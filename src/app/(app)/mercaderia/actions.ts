'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { coincide, ordenRelevancia } from '@/lib/busqueda'
import { requerirUsuario } from '@/lib/dal'
import { puedeUsarDeposito } from '@/lib/depositos'
import { mensajeError } from '@/lib/errores'
import { centavos, parseNumero } from '@/lib/numeros'
import { ErrorStock, nuevoCodigoInterno, registrarOperacion } from '@/lib/stock'

export type ProductoLinea = {
  id: number
  codigo: string
  nombre: string
  precio: number
  activo: boolean
  /** Stock en el depósito de referencia (origen en transferencias). */
  stock: number
}

const lineas = (depositoId: number | null) => db()`
  select p.id, p.codigo, p.nombre, p.precio, p.activo,
    coalesce((select cantidad from stock s where s.producto_id = p.id and s.deposito_id = ${depositoId ?? 0}), 0) as stock
  from productos p`

/** Escaneo o búsqueda: si el texto es un código exacto devuelve ese producto; si no, sugerencias. */
export async function buscarProducto(q: string, depositoId: number | null): Promise<{ exacto?: ProductoLinea; sugerencias: ProductoLinea[] }> {
  await requerirUsuario()
  const texto = String(q ?? '').trim().slice(0, 100)
  if (!texto) return { sugerencias: [] }
  const [exacto] = await db()<ProductoLinea[]>`${lineas(depositoId)} where lower(p.codigo) = lower(${texto})`
  if (exacto) return { exacto, sugerencias: [] }
  const sugerencias = await db()<ProductoLinea[]>`
    ${lineas(depositoId)}
    where p.activo and ${coincide(db(), texto)}
    order by ${ordenRelevancia(db(), texto)} limit 8`
  return { sugerencias }
}

/** Stock de varios productos en un depósito (al cambiar de depósito). */
export async function stockEn(ids: number[], depositoId: number): Promise<Record<number, number>> {
  await requerirUsuario()
  const lista = z.array(z.number().int()).max(1000).parse(ids)
  const filas = await db()<{ producto_id: number; cantidad: number }[]>`
    select producto_id, cantidad from stock where deposito_id = ${depositoId} and producto_id = any(${lista}::int[])`
  return Object.fromEntries(lista.map((id) => [id, filas.find((f) => f.producto_id === id)?.cantidad ?? 0]))
}

export async function generarCodigo(): Promise<string> {
  await requerirUsuario()
  return nuevoCodigoInterno(db())
}

export type ResultadoAlta = { producto?: ProductoLinea; error?: string; errores?: Record<string, string> }

/** Alta rápida desde el ingreso de mercadería (la puede hacer la vendedora). */
export async function crearProductoRapido(datos: {
  codigo: string
  nombre: string
  categoriaId: number | null
  precio: string
  costo: string
}): Promise<ResultadoAlta> {
  const u = await requerirUsuario()
  const codigo = String(datos.codigo ?? '').trim()
  const nombre = String(datos.nombre ?? '').trim().replace(/\s+/g, ' ')
  const precio = parseNumero(datos.precio)
  const costo = String(datos.costo ?? '').trim() ? parseNumero(datos.costo) : 0
  const errores: Record<string, string> = {}
  if (!codigo || codigo.length > 64) errores.codigo = 'Escaneá el código o generá uno.'
  if (!nombre || nombre.length > 200) errores.nombre = 'Poné el nombre.'
  if (precio === null || precio < 0) errores.precio = 'Poné el precio de venta.'
  if (costo === null || costo < 0) errores.costo = 'Costo no válido.'
  if (Object.keys(errores).length) return { errores }
  try {
    const [p] = await db().begin(async (tx) => {
      await tx`select set_config('app.usuario_id', ${String(u.id)}, true), set_config('app.origen', 'ingreso', true)`
      return tx<ProductoLinea[]>`
        insert into productos (codigo, nombre, categoria_id, costo, precio)
        values (${codigo}, ${nombre}, ${datos.categoriaId || null}, ${centavos(costo!)}, ${centavos(precio!)})
        returning id, codigo, nombre, precio, activo, 0 as stock`
    })
    revalidatePath('/productos')
    return { producto: p }
  } catch (e) {
    const msg = mensajeError(e, 'Ya existe un producto con ese código.')
    return { error: msg, errores: (e as { code?: string }).code === '23505' ? { codigo: msg } : undefined }
  }
}

const Operacion = z.object({
  tipo: z.enum(['ingreso', 'transferencia', 'ajuste']),
  origenId: z.number().int().nullable(),
  destinoId: z.number().int(),
  motivo: z.string().trim().max(60).nullable(),
  nota: z.string().trim().max(300).nullable(),
  items: z
    .array(z.object({ productoId: z.number().int(), cantidad: z.number().int().optional(), contado: z.number().int().optional() }))
    .min(1)
    .max(500),
})

export async function confirmarOperacion(datos: z.input<typeof Operacion>): Promise<{ operacionId?: number; error?: string }> {
  const u = await requerirUsuario()
  const r = Operacion.safeParse(datos)
  if (!r.success) return { error: 'Revisá las cantidades de la lista.' }
  const d = r.data

  if (d.tipo === 'ajuste' && u.rol !== 'admin') return { error: 'Los ajustes los hace una administradora.' }
  if (d.tipo === 'ingreso' && !(await puedeUsarDeposito(u, d.destinoId)))
    return { error: 'Solo podés cargar mercadería en los depósitos de tu sucursal.' }
  if (d.tipo === 'transferencia' && !(await puedeUsarDeposito(u, d.origenId ?? 0)))
    return { error: 'Solo podés enviar mercadería desde los depósitos de tu sucursal.' }
  if (d.tipo === 'ajuste' && !d.motivo) return { error: 'Elegí el motivo del ajuste.' }

  try {
    const { operacionId } = await registrarOperacion(db(), { ...d, usuarioId: u.id })
    revalidatePath('/productos')
    revalidatePath('/mercaderia')
    return { operacionId }
  } catch (e) {
    if (e instanceof ErrorStock) return { error: e.message }
    console.error(e)
    return { error: 'No se pudo guardar. Probá de nuevo.' }
  }
}

export type ArticuloBuscado = { id: number; nombre: string; variantes: number }

/** Artículos con talles y colores, para cargar por grilla. */
export async function buscarArticulos(q: string): Promise<ArticuloBuscado[]> {
  await requerirUsuario()
  const sql = db()
  const palabras = q.trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0, 5)
  return sql<ArticuloBuscado[]>`
    select a.id, a.nombre, (select count(*)::int from productos p where p.articulo_id = a.id and p.activo) as variantes
    from articulos a
    where a.activo ${palabras.reduce((acc, w) => sql`${acc} and normalizar(a.nombre) like ${'%' + w.normalize('NFD').replace(/[̀-ͯ]/g, '') + '%'}`, sql``)}
    order by lower(a.nombre) limit 12`
}

export type VarianteLinea = ProductoLinea & { talle: string | null; color: string | null; orden_talle: number }

export async function variantesArticulo(articuloId: number, depositoId: number | null): Promise<{ nombre: string; variantes: VarianteLinea[] } | null> {
  await requerirUsuario()
  const sql = db()
  const [a] = await sql<{ nombre: string }[]>`select nombre from articulos where id = ${articuloId}`
  if (!a) return null
  const variantes = await sql<VarianteLinea[]>`
    select p.id, p.codigo, p.nombre, p.precio, p.activo, p.talle, p.color, p.orden_talle,
      coalesce((select cantidad from stock s where s.producto_id = p.id and s.deposito_id = ${depositoId ?? 0}), 0) as stock
    from productos p where p.articulo_id = ${articuloId} and p.activo
    order by lower(coalesce(p.color, '')), p.orden_talle`
  return { nombre: a.nombre, variantes }
}
