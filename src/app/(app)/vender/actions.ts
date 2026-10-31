'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requerirUsuario } from '@/lib/dal'
import { abrirCaja, cajaAbierta, ErrorVenta, registrarVenta } from '@/lib/ventas'
import { parseNumero } from '@/lib/numeros'
import { CONSUMIDOR_FINAL, facturarVenta, leerConfig } from '@/lib/arca/facturacion'
import type { Resultado } from '@/components/form-accion'

export type ProductoVenta = { id: number; codigo: string; nombre: string; precio: number; stock: number }

const conStock = (sucursalId: number) => db()`
  select p.id, p.codigo, p.nombre, p.precio,
    coalesce((select s.cantidad from stock s join depositos d on d.id = s.deposito_id
              where s.producto_id = p.id and d.sucursal_id = ${sucursalId} and d.es_principal), 0) as stock
  from productos p`

/** Escaneo en la caja: código exacto o sugerencias por nombre, con el stock del local. */
export async function buscarParaVender(q: string): Promise<{ exacto?: ProductoVenta; sugerencias: ProductoVenta[]; error?: string }> {
  const u = await requerirUsuario()
  const caja = await cajaAbierta(db(), u.id)
  if (!caja) return { sugerencias: [], error: 'La caja está cerrada.' }
  const texto = String(q ?? '').trim().slice(0, 100)
  if (!texto) return { sugerencias: [] }
  const [exacto] = await db()<(ProductoVenta & { activo: boolean })[]>`
    ${conStock(caja.sucursal_id)} where lower(p.codigo) = lower(${texto})`
  if (exacto) {
    if (!(await db()`select 1 from productos where id = ${exacto.id} and activo`).length) return { sugerencias: [], error: `"${exacto.nombre}" está dado de baja.` }
    return { exacto, sugerencias: [] }
  }
  const patron = `%${texto.toLowerCase().replace(/[\\%_]/g, '\\$&')}%`
  const sugerencias = await db()<ProductoVenta[]>`
    ${conStock(caja.sucursal_id)}
    where p.activo and (lower(p.nombre) like ${patron} or lower(p.codigo) like ${patron})
    order by (lower(p.nombre) like ${texto.toLowerCase() + '%'}) desc, lower(p.nombre) limit 8`
  return { sugerencias }
}

/** Precios actuales de los productos del carrito (por si alguien los cambió). */
export async function preciosActuales(ids: number[]): Promise<Record<number, number>> {
  await requerirUsuario()
  const lista = z.array(z.number().int()).max(300).parse(ids)
  const filas = await db()<{ id: number; precio: number }[]>`select id, precio from productos where id = any(${lista}::int[])`
  return Object.fromEntries(filas.map((f) => [f.id, f.precio]))
}

const Cobro = z.object({
  items: z.array(z.object({ productoId: z.number().int(), cantidad: z.number().int().min(1).max(10000), descuentoPct: z.number().min(0).max(100) })).min(1).max(300),
  descuentoGlobalPct: z.number().min(0).max(100),
  pagos: z
    .array(z.object({ medio: z.enum(['efectivo', 'transferencia', 'debito', 'credito']), monto: z.number().positive().max(1e10), cuotas: z.number().int().min(1).max(24).nullable().optional() }))
    .min(1)
    .max(6),
  efectivoRecibido: z.number().nonnegative().max(1e10).nullable(),
  totalEsperado: z.number().nonnegative(),
})

export type ResultadoCobro = {
  ventaId?: number
  vuelto?: number
  error?: string
  /** Factura emitida automáticamente (si está activado). */
  comprobante?: { id: number; tipo: string; simulado: boolean }
  /** La venta quedó registrada pero la factura no salió. */
  errorFactura?: string
  puedeFacturar?: boolean
}

export async function cobrar(datos: z.input<typeof Cobro>): Promise<ResultadoCobro> {
  const u = await requerirUsuario()
  const r = Cobro.safeParse(datos)
  if (!r.success) return { error: 'Revisá los datos del cobro.' }
  let res
  try {
    res = await registrarVenta(db(), { ...r.data, usuario: { id: u.id, rol: u.rol } })
  } catch (e) {
    if (e instanceof ErrorVenta) return { error: e.message }
    console.error(e)
    return { error: 'No se pudo registrar la venta. Probá de nuevo.' }
  }
  revalidatePath('/caja')
  revalidatePath('/ventas')
  const config = await leerConfig(db())
  const salida: ResultadoCobro = { ventaId: res.ventaId, vuelto: res.vuelto, puedeFacturar: config.modo !== 'desactivada' }
  if (config.modo !== 'desactivada' && config.facturar_automatico) {
    // La venta ya está guardada: si la factura falla, se avisa y se puede reintentar.
    try {
      const c = await facturarVenta(db(), { ventaId: res.ventaId, receptor: CONSUMIDOR_FINAL, usuarioId: u.id })
      salida.comprobante = { id: c.id, tipo: c.tipo, simulado: c.simulado }
    } catch (e) {
      salida.errorFactura = (e as Error).message
    }
  }
  return salida
}

/** Factura a consumidor final desde la pantalla de cobro. */
export async function facturarConsumidorFinal(ventaId: number): Promise<{ comprobante?: { id: number; tipo: string; simulado: boolean }; error?: string }> {
  const u = await requerirUsuario()
  const [v] = await db()<{ usuario_id: number }[]>`select usuario_id from ventas where id = ${ventaId}`
  if (!v || (u.rol !== 'admin' && v.usuario_id !== u.id)) return { error: 'No encontramos la venta.' }
  try {
    const c = await facturarVenta(db(), { ventaId, receptor: CONSUMIDOR_FINAL, usuarioId: u.id })
    revalidatePath(`/ventas/${ventaId}`)
    return { comprobante: { id: c.id, tipo: c.tipo, simulado: c.simulado } }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function abrir(_: Resultado, f: FormData): Promise<Resultado> {
  const u = await requerirUsuario()
  const sucursalId = u.rol === 'admin' ? Number(f.get('sucursal_id')) : u.sucursal_id
  const monto = parseNumero(String(f.get('monto_inicial') ?? '').trim() || '0')
  if (!sucursalId) return { error: 'Elegí la sucursal.' }
  if (monto === null || monto < 0) return { error: 'El monto inicial no es válido.' }
  try {
    await abrirCaja(db(), { usuarioId: u.id, sucursalId, montoInicial: Math.round(monto * 100) / 100 })
  } catch (e) {
    if (e instanceof ErrorVenta) return { error: e.message }
    throw e
  }
  revalidatePath('/vender')
  revalidatePath('/caja')
  return { ok: 'Caja abierta.' }
}
