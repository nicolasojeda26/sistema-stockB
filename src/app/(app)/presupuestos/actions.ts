'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requerirUsuario } from '@/lib/dal'
import { coincide, ordenRelevancia } from '@/lib/busqueda'
import { calcularVenta } from '@/lib/venta-calculo'

export type ProductoPresupuesto = { id: number; codigo: string; nombre: string; precio: number }

export async function buscarProductosPresupuesto(q: string): Promise<ProductoPresupuesto[]> {
  await requerirUsuario()
  const texto = String(q ?? '').trim().slice(0, 100)
  if (!texto) return []
  const sql = db()
  const [exacto] = await sql<ProductoPresupuesto[]>`
    select id, codigo, nombre, precio from productos
    where activo and lower(codigo) = lower(${texto}) limit 1`
  if (exacto) return [exacto]
  return sql<ProductoPresupuesto[]>`
    select id, codigo, nombre, precio from productos p
    where p.activo and ${coincide(sql, texto)}
    order by ${ordenRelevancia(sql, texto)} limit 8`
}

const Crear = z.object({
  sucursalId: z.number().int().positive(),
  clienteId: z.number().int().positive().nullable(),
  validoHasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  descuentoGlobalPct: z.number().min(0).max(100),
  nota: z.string().trim().max(500).nullable(),
  items: z.array(z.object({ productoId: z.number().int().positive(), cantidad: z.number().int().positive().max(10000), descuentoPct: z.number().min(0).max(100) })).min(1).max(300),
})

export async function crearPresupuesto(datos: z.input<typeof Crear>): Promise<{ id?: number; error?: string }> {
  const u = await requerirUsuario()
  const validado = Crear.safeParse(datos)
  if (!validado.success) return { error: 'Revisá los productos, cantidades y descuentos.' }
  const d = validado.data
  if (u.rol !== 'admin' && u.sucursal_id !== d.sucursalId) return { error: 'No podés crear presupuestos para otra sucursal.' }
  if (d.validoHasta) {
    const fecha = new Date(`${d.validoHasta}T00:00:00Z`)
    if (Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== d.validoHasta) return { error: 'La fecha de vigencia no es válida.' }
  }

  const sql = db()
  const ids = [...new Set(d.items.map((i) => i.productoId))]
  const productos = await sql<ProductoPresupuesto[]>`
    select id, codigo, nombre, precio from productos where activo and id = any(${ids}::int[])`
  if (productos.length !== ids.length) return { error: 'Algún producto dejó de estar activo. Actualizá la lista y volvé a intentar.' }
  const porId = new Map(productos.map((p) => [p.id, p]))
  const lineas = d.items.map((i) => ({ ...porId.get(i.productoId)!, cantidad: i.cantidad, descuentoPct: i.descuentoPct }))
  const calculo = calcularVenta(lineas, d.descuentoGlobalPct)
  const total = calculo.total / 100

  try {
    const id = await sql.begin(async (tx) => {
      const [s] = await tx<{ id: number }[]>`select id from sucursales where id = ${d.sucursalId} and activa`
      if (!s) throw new Error('La sucursal no está activa.')
      if (d.clienteId) {
        const [c] = await tx<{ id: number }[]>`select id from clientes where id = ${d.clienteId} and activo`
        if (!c) throw new Error('La clienta no está activa.')
      }
      const [presupuesto] = await tx<{ id: number }[]>`
        insert into presupuestos (sucursal_id, usuario_id, cliente_id, valido_hasta, descuento_global, total, nota)
        values (${d.sucursalId}, ${u.id}, ${d.clienteId}, ${d.validoHasta}, ${d.descuentoGlobalPct}, ${total}, ${d.nota?.trim() || null})
        returning id`
      const lineasDb = d.items.map((i) => {
        const p = porId.get(i.productoId)!
        return { presupuesto_id: presupuesto.id, producto_id: p.id, codigo: p.codigo, nombre: p.nombre, cantidad: i.cantidad, precio: p.precio, descuento_pct: i.descuentoPct }
      })
      await tx`insert into presupuesto_items ${tx(lineasDb)}`
      return presupuesto.id
    })
    revalidatePath('/presupuestos')
    return { id }
  } catch (e) {
    return { error: (e as Error).message || 'No se pudo guardar el presupuesto.' }
  }
}

export async function cambiarEstadoPresupuesto(id: number, estado: 'abierto' | 'aceptado' | 'rechazado' | 'cancelado'): Promise<{ error?: string }> {
  const u = await requerirUsuario()
  if (!Number.isInteger(id) || id <= 0) return { error: 'El presupuesto no es válido.' }
  const sql = db()
  const [p] = await sql<{ sucursal_id: number; estado: string }[]>`select sucursal_id, estado from presupuestos where id = ${id}`
  if (!p || (u.rol !== 'admin' && p.sucursal_id !== u.sucursal_id)) return { error: 'No encontramos ese presupuesto.' }
  const transiciones = {
    abierto: ['aceptado', 'rechazado', 'cancelado'],
    rechazado: ['abierto', 'cancelado'],
    aceptado: [],
    cancelado: [],
  } as const
  if (!transiciones[p.estado as keyof typeof transiciones]?.includes(estado as never)) {
    return { error: 'Ese cambio de estado no está permitido.' }
  }
  await sql`update presupuestos set estado = ${estado} where id = ${id}`
  revalidatePath(`/presupuestos/${id}`)
  revalidatePath('/presupuestos')
  return {}
}
