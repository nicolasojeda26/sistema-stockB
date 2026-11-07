import 'server-only'
import { db } from './db'
import type { Usuario } from './dal'
import type { MedioVenta } from './venta-calculo'

export type VentaDetalle = {
  id: number
  creado: Date
  sucursal: string
  sucursal_id: number
  direccion: string | null
  vendedora: string | null
  caja_id: number
  subtotal: number
  descuento: number
  total: number
  descuento_global_pct: number
  efectivo_recibido: number | null
  vuelto: number
  estado: 'completada' | 'anulada'
  anulada_en: Date | null
  anulada_por: string | null
  motivo_anulacion: string | null
  cliente_id: number | null
  cliente: string | null
  cliente_telefono: string | null
  para_retirar: boolean
  retirada_en: Date | null
  items: { id: number; producto_id: number | null; codigo: string; nombre: string; cantidad: number; precio_unitario: number; descuento_pct: number; subtotal: number }[]
  pagos: { medio: MedioVenta; monto: number; cuotas: number | null }[]
}

/** Una venta con sus ítems y pagos. La vendedora solo ve las de su sucursal. */
export async function leerVenta(id: number, u: Usuario): Promise<VentaDetalle | null> {
  const sql = db()
  const [v] = await sql<Omit<VentaDetalle, 'items' | 'pagos'>[]>`
    select v.id, v.creado, s.nombre as sucursal, s.id as sucursal_id, s.direccion, us.nombre as vendedora, v.caja_id,
      v.subtotal, v.descuento, v.total, v.descuento_global_pct, v.efectivo_recibido, v.vuelto,
      v.estado, v.anulada_en, an.nombre as anulada_por, v.motivo_anulacion,
      v.cliente_id, cl.nombre as cliente, cl.telefono as cliente_telefono, v.para_retirar, v.retirada_en
    from ventas v join sucursales s on s.id = v.sucursal_id
    left join clientes cl on cl.id = v.cliente_id
    left join usuarios us on us.id = v.usuario_id left join usuarios an on an.id = v.anulada_por
    where v.id = ${id}`
  if (!v) return null
  if (u.rol !== 'admin' && v.sucursal_id !== u.sucursal_id) return null
  const [items, pagos] = await Promise.all([
    sql<VentaDetalle['items']>`select id, producto_id, codigo, nombre, cantidad, precio_unitario, descuento_pct, subtotal from venta_items where venta_id = ${id} order by id`,
    sql<VentaDetalle['pagos']>`select medio, monto, cuotas from venta_pagos where venta_id = ${id} order by id`,
  ])
  return { ...v, items, pagos }
}
