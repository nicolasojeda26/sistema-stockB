import 'server-only'
import type { Sql } from 'postgres'

export type Filtro = { desde: string; hasta: string; sucursalId: number | null }

const rango = (sql: Sql, f: Filtro, col: string) => sql`
  ${sql.unsafe(col)} >= (${f.desde}::date)::timestamp at time zone 'America/Argentina/Buenos_Aires'
  and ${sql.unsafe(col)} < (${f.hasta}::date + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires'`

const deSucursal = (sql: Sql, f: Filtro, col: string) => (f.sucursalId ? sql`and ${sql.unsafe(col)} = ${f.sucursalId}` : sql``)

export async function resumen(sql: Sql, f: Filtro) {
  const [v] = await sql<{ ventas: number; bruto: number; unidades: number }[]>`
    select count(*)::int as ventas, coalesce(sum(total), 0) as bruto,
      coalesce((select sum(i.cantidad) from venta_items i join ventas x on x.id = i.venta_id
                where x.estado = 'completada' and ${rango(sql, f, 'x.creado')} ${deSucursal(sql, f, 'x.sucursal_id')}), 0)::int as unidades
    from ventas v where v.estado = 'completada' and ${rango(sql, f, 'v.creado')} ${deSucursal(sql, f, 'v.sucursal_id')}`
  const [d] = await sql<{ devuelto: number }[]>`
    select coalesce(sum(d.total), 0) as devuelto from devoluciones d join cajas c on c.id = d.caja_id
    where ${rango(sql, f, 'd.creado')} ${deSucursal(sql, f, 'c.sucursal_id')}`
  const bruto = Number(v.bruto)
  const devuelto = Number(d.devuelto)
  return { ventas: v.ventas, bruto, devuelto, neto: Math.round((bruto - devuelto) * 100) / 100, unidades: v.unidades, promedio: v.ventas ? Math.round((bruto / v.ventas) * 100) / 100 : 0 }
}

export function porDia(sql: Sql, f: Filtro) {
  return sql<{ dia: string; ventas: number; total: number }[]>`
    select d::date::text as dia, count(v.id)::int as ventas, coalesce(sum(v.total), 0) as total
    from generate_series(${f.desde}::date, ${f.hasta}::date, interval '1 day') d
    left join ventas v on v.estado = 'completada' ${deSucursal(sql, f, 'v.sucursal_id')}
      and (v.creado at time zone 'America/Argentina/Buenos_Aires')::date = d::date
    group by d order by d`
}

export function porSucursal(sql: Sql, f: Filtro) {
  return sql<{ nombre: string; ventas: number; total: number }[]>`
    select s.nombre, count(*)::int as ventas, sum(v.total) as total
    from ventas v join sucursales s on s.id = v.sucursal_id
    where v.estado = 'completada' and ${rango(sql, f, 'v.creado')} ${deSucursal(sql, f, 'v.sucursal_id')}
    group by s.nombre order by total desc`
}

export function porVendedora(sql: Sql, f: Filtro) {
  return sql<{ nombre: string; ventas: number; total: number }[]>`
    select coalesce(u.nombre, '—') as nombre, count(*)::int as ventas, sum(v.total) as total
    from ventas v left join usuarios u on u.id = v.usuario_id
    where v.estado = 'completada' and ${rango(sql, f, 'v.creado')} ${deSucursal(sql, f, 'v.sucursal_id')}
    group by u.nombre order by total desc`
}

export function porMedio(sql: Sql, f: Filtro) {
  return sql<{ medio: string; pagos: number; total: number }[]>`
    select p.medio, count(*)::int as pagos, sum(p.monto) as total
    from venta_pagos p join ventas v on v.id = p.venta_id
    where v.estado = 'completada' and ${rango(sql, f, 'v.creado')} ${deSucursal(sql, f, 'v.sucursal_id')}
    group by p.medio order by total desc`
}

/** Más vendidos: unidades netas de devoluciones. */
export function masVendidos(sql: Sql, f: Filtro, limite = 20) {
  return sql<{ producto_id: number | null; codigo: string; nombre: string; unidades: number; total: number }[]>`
    select i.producto_id, max(i.codigo) as codigo, max(i.nombre) as nombre,
      (sum(i.cantidad) - coalesce(sum((select sum(di.cantidad) from devolucion_items di where di.venta_item_id = i.id)), 0))::int as unidades,
      sum(i.subtotal) - coalesce(sum((select sum(di.subtotal) from devolucion_items di where di.venta_item_id = i.id)), 0) as total
    from venta_items i join ventas v on v.id = i.venta_id
    where v.estado = 'completada' and ${rango(sql, f, 'v.creado')} ${deSucursal(sql, f, 'v.sucursal_id')}
    group by i.producto_id
    order by unidades desc, total desc
    limit ${limite}`
}

/** Productos con stock que no se vendieron en los últimos `dias` días. */
export function sinMovimiento(sql: Sql, sucursalId: number | null, dias = 60) {
  return sql<{ id: number; codigo: string; nombre: string; stock: number; valor: number; ultima: Date | null }[]>`
    select p.id, p.codigo, p.nombre, sum(s.cantidad)::int as stock, sum(s.cantidad) * p.costo as valor,
      (select max(v.creado) from venta_items i join ventas v on v.id = i.venta_id where i.producto_id = p.id and v.estado = 'completada') as ultima
    from productos p
    join stock s on s.producto_id = p.id
    join depositos d on d.id = s.deposito_id ${sucursalId ? sql`and d.sucursal_id = ${sucursalId}` : sql``}
    where p.activo
      and not exists (
        select 1 from venta_items i join ventas v on v.id = i.venta_id
        where i.producto_id = p.id and v.estado = 'completada' and v.creado >= now() - make_interval(days => ${dias})
          ${sucursalId ? sql`and v.sucursal_id = ${sucursalId}` : sql``})
    group by p.id
    having sum(s.cantidad) > 0
    order by valor desc nulls last, stock desc
    limit 100`
}

/** Valor del stock (solo cantidades positivas) a costo y a precio de venta. */
export function valorStock(sql: Sql, sucursalId: number | null) {
  return sql<{ sucursal: string; deposito: string; unidades: number; costo: number; venta: number }[]>`
    select coalesce(su.nombre, 'Central') as sucursal, d.nombre as deposito,
      coalesce(sum(s.cantidad) filter (where s.cantidad > 0), 0)::int as unidades,
      coalesce(sum(s.cantidad * p.costo) filter (where s.cantidad > 0), 0) as costo,
      coalesce(sum(s.cantidad * p.precio) filter (where s.cantidad > 0), 0) as venta
    from depositos d left join sucursales su on su.id = d.sucursal_id
    left join stock s on s.deposito_id = d.id left join productos p on p.id = s.producto_id and p.activo
    where d.activo ${sucursalId ? sql`and d.sucursal_id = ${sucursalId}` : sql``}
    group by su.nombre, d.nombre, d.es_principal
    order by su.nombre nulls last, d.es_principal desc, d.nombre`
}

export type FiltroComprobantes = { desde: string; hasta: string; ambiente: string; puntoVenta: number | null }

/** Libro de comprobantes (para el contador). Las notas de crédito restan. */
export function comprobantes(sql: Sql, f: FiltroComprobantes) {
  return sql<
    { id: number; fecha: Date; cbte_tipo: number; punto_venta: number; numero: number; doc_tipo: number; doc_nro: string; receptor_nombre: string | null; receptor_condicion: number; neto: number; iva: number; total: number; cae: string; venta_id: number }[]
  >`
    select id, fecha, cbte_tipo, punto_venta, numero, doc_tipo, doc_nro, receptor_nombre, receptor_condicion, neto, iva, total, cae, venta_id
    from comprobantes
    where estado = 'autorizado' and ambiente = ${f.ambiente} and fecha between ${f.desde}::date and ${f.hasta}::date
      ${f.puntoVenta ? sql`and punto_venta = ${f.puntoVenta}` : sql``}
    order by fecha, punto_venta, cbte_tipo, numero`
}

export const hoyAR = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date())
export const fechaValida = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '')
export const inicioDeMes = () => hoyAR().slice(0, 8) + '01'
