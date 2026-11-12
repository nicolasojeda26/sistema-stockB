import type { Sql, TransactionSql } from 'postgres'
import { registrarOperacionTx } from './stock'
import { aCentavos, aPesos } from './venta-calculo'
import { MEDIOS_PROVEEDOR, TIPOS_COMPROBANTE, totalesCompra, type MedioProveedor, type TipoComprobante } from './compras-tipos'

export { totalesCompra, MEDIOS_PROVEEDOR, TIPOS_COMPROBANTE, type MedioProveedor, type TipoComprobante }

export class ErrorCompra extends Error {}

type Quien = { id: number; rol: 'admin' | 'vendedora' | 'deposito'; permisos?: readonly string[] }
type Tx = Sql | TransactionSql

export async function saldoProveedor(sql: Tx, proveedorId: number): Promise<number> {
  const [{ saldo }] = await sql<{ saldo: number }[]>`select coalesce(sum(monto), 0) as saldo from proveedor_movimientos where proveedor_id = ${proveedorId}`
  return Number(saldo)
}

/** Retiro de la caja abierta del usuario (pagos y gastos en efectivo). Devuelve el id del movimiento. */
async function retiroDeCaja(tx: TransactionSql, usuarioId: number, monto: number, motivo: string): Promise<number> {
  const [caja] = await tx<{ id: number }[]>`select id from cajas where usuario_id = ${usuarioId} and cerrada is null for update`
  if (!caja) throw new ErrorCompra('Para sacar la plata de la caja, abrí tu caja primero (en Vender).')
  const [m] = await tx<{ id: number }[]>`
    insert into movimientos_caja (caja_id, tipo, monto, motivo, usuario_id)
    values (${caja.id}, 'retiro', ${monto}, ${motivo.slice(0, 200)}, ${usuarioId}) returning id`
  return m.id
}

export type PagoInicial = { monto: number; medio: MedioProveedor; desdeCaja: boolean }

export type DatosCompra = {
  usuario: Quien
  proveedorId: number
  depositoId: number
  fecha: string
  tipoComprobante: TipoComprobante
  numero: string | null
  items: { productoId: number; cantidad: number; costo: number }[]
  ivaPct: number
  percepciones: number
  /** Total que figura en la factura: tiene que coincidir con el calculado (salvo redondeos de hasta $1). */
  totalEsperado: number
  actualizarCostos: boolean
  nota?: string | null
  pago?: PagoInicial | null
}

export async function registrarCompra(sql: Sql, d: DatosCompra) {
  if (!puedeEn(d.usuario, 'compras')) throw new ErrorCompra('No tenés permiso para cargar compras.')
  if (!d.items.length) throw new ErrorCompra('Agregá los productos de la factura.')
  for (const it of d.items) {
    if (!Number.isInteger(it.cantidad) || it.cantidad <= 0) throw new ErrorCompra('Hay una cantidad no válida.')
    if (!(it.costo >= 0)) throw new ErrorCompra('Hay un costo no válido.')
  }
  if (![0, 10.5, 21, 27].includes(d.ivaPct)) throw new ErrorCompra('El IVA no es válido.')
  if (d.tipoComprobante !== 'A' && d.ivaPct !== 0) throw new ErrorCompra('Solo la factura A discrimina IVA.')
  if (!(d.percepciones >= 0)) throw new ErrorCompra('Las percepciones no son válidas.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha)) throw new ErrorCompra('La fecha no es válida.')
  const numero = d.numero?.trim() || null
  const t = totalesCompra(d.items, d.ivaPct, d.percepciones)
  if (Math.abs(aCentavos(t.total) - aCentavos(d.totalEsperado)) > 100) throw new ErrorCompra('El total no coincide con los productos cargados.')
  if (d.pago && !(d.pago.monto > 0)) throw new ErrorCompra('Poné cuánto se pagó.')

  return sql.begin(async (tx) => {
    const [prov] = await tx<{ nombre: string; activo: boolean }[]>`select nombre, activo from proveedores where id = ${d.proveedorId}`
    if (!prov || !prov.activo) throw new ErrorCompra('El proveedor no existe o está dado de baja.')
    if (numero) {
      const [dup] = await tx`
        select id from compras where proveedor_id = ${d.proveedorId} and tipo_comprobante = ${d.tipoComprobante}
          and numero = ${numero} and estado = 'registrada'`
      if (dup) throw new ErrorCompra(`Esa factura ya está cargada (compra N.º ${dup.id}).`)
    }
    const comprobante = `${TIPOS_COMPROBANTE[d.tipoComprobante]}${numero ? ` ${numero}` : ''}`
    const op = await registrarOperacionTx(tx, {
      tipo: 'ingreso',
      destinoId: d.depositoId,
      usuarioId: d.usuario.id,
      motivo: 'Compra',
      nota: `${prov.nombre} · ${comprobante}`,
      items: d.items.map((i) => ({ productoId: i.productoId, cantidad: i.cantidad })),
    })
    const [c] = await tx<{ id: number }[]>`
      insert into compras (proveedor_id, deposito_id, fecha, tipo_comprobante, numero, neto, iva, percepciones, total,
        operacion_id, actualizo_costos, nota, usuario_id)
      values (${d.proveedorId}, ${d.depositoId}, ${d.fecha}, ${d.tipoComprobante}, ${numero}, ${t.neto}, ${t.iva},
        ${t.percepciones}, ${t.total}, ${op.operacionId}, ${d.actualizarCostos}, ${d.nota?.trim() || null}, ${d.usuario.id})
      returning id`
    const json = JSON.stringify(d.items.map((i) => ({ producto_id: i.productoId, cantidad: i.cantidad, costo: i.costo })))
    await tx`
      insert into compra_items (compra_id, producto_id, cantidad, costo)
      select ${c.id}, producto_id, cantidad, costo
      from jsonb_to_recordset(${json}::text::jsonb) as x(producto_id int, cantidad int, costo numeric)`
    if (d.actualizarCostos) {
      // El costo queda como el último pagado (sin IVA si es factura A, porque ese IVA se recupera).
      await tx`select set_config('app.usuario_id', ${String(d.usuario.id)}, true), set_config('app.origen', 'compra', true)`
      await tx`
        update productos p set costo = x.costo
        from (select distinct on (producto_id) producto_id, costo from compra_items where compra_id = ${c.id} order by producto_id, id desc) x
        where p.id = x.producto_id and p.costo is distinct from x.costo`
    }
    if (t.total > 0)
      await tx`
        insert into proveedor_movimientos (proveedor_id, fecha, tipo, monto, compra_id, nota, usuario_id)
        values (${d.proveedorId}, ${d.fecha}, 'compra', ${t.total}, ${c.id}, ${comprobante}, ${d.usuario.id})`
    if (d.pago) await pagoTx(tx, { proveedorId: d.proveedorId, usuario: d.usuario, ...d.pago, compraId: c.id, nota: `Pago de ${comprobante}`, nombre: prov.nombre })
    return { compraId: c.id, ...t }
  })
}

async function pagoTx(
  tx: TransactionSql,
  d: PagoInicial & { proveedorId: number; usuario: Quien; compraId?: number | null; nota?: string | null; nombre: string },
) {
  if (!(aCentavos(d.monto) > 0)) throw new ErrorCompra('Poné un monto mayor a cero.')
  if (!(d.medio in MEDIOS_PROVEEDOR)) throw new ErrorCompra('Elegí cómo se pagó.')
  if (d.desdeCaja && d.medio !== 'efectivo') throw new ErrorCompra('De la caja solo sale efectivo.')
  const movCaja = d.desdeCaja ? await retiroDeCaja(tx, d.usuario.id, d.monto, `Pago a ${d.nombre}`) : null
  await tx`
    insert into proveedor_movimientos (proveedor_id, tipo, monto, compra_id, medio, movimiento_caja_id, nota, usuario_id)
    values (${d.proveedorId}, 'pago', ${-d.monto}, ${d.compraId ?? null}, ${d.medio}, ${movCaja}, ${d.nota?.trim() || null}, ${d.usuario.id})`
}

export async function registrarPagoProveedor(sql: Sql, d: PagoInicial & { proveedorId: number; usuario: Quien; nota?: string | null }) {
  if (!puedeEn(d.usuario, 'compras')) throw new ErrorCompra('No tenés permiso para registrar pagos a proveedores.')
  return sql.begin(async (tx) => {
    const [p] = await tx<{ nombre: string }[]>`select nombre from proveedores where id = ${d.proveedorId} for update`
    if (!p) throw new ErrorCompra('El proveedor no existe.')
    await pagoTx(tx, { ...d, nombre: p.nombre })
    return { saldo: await saldoProveedor(tx, d.proveedorId) }
  })
}

/** Nota de crédito o ajuste manual de la cuenta del proveedor. Positivo = le debemos más. */
export async function ajustarCuentaProveedor(sql: Sql, d: { proveedorId: number; usuario: Quien; monto: number; tipo: 'nota_credito' | 'ajuste'; nota: string }) {
  if (!puedeEn(d.usuario, 'compras')) throw new ErrorCompra('No tenés permiso para ajustar cuentas de proveedores.')
  if (!aCentavos(d.monto)) throw new ErrorCompra('Poné un monto distinto de cero.')
  if (!d.nota.trim()) throw new ErrorCompra('Contá el motivo.')
  const monto = d.tipo === 'nota_credito' ? -Math.abs(d.monto) : d.monto
  await sql`
    insert into proveedor_movimientos (proveedor_id, tipo, monto, nota, usuario_id)
    values (${d.proveedorId}, ${d.tipo}, ${monto}, ${d.nota.trim()}, ${d.usuario.id})`
}

/** Anula la compra: saca del stock lo que había entrado y descuenta la deuda. Los pagos quedan como saldo a favor. */
export async function anularCompra(sql: Sql, d: { compraId: number; usuario: Quien; motivo: string }) {
  if (!puedeEn(d.usuario, 'compras')) throw new ErrorCompra('No tenés permiso para anular compras.')
  if (!d.motivo.trim()) throw new ErrorCompra('Contá por qué se anula.')
  return sql.begin(async (tx) => {
    const [c] = await tx<{ id: number; estado: string; deposito_id: number; proveedor_id: number; total: number }[]>`
      select id, estado, deposito_id, proveedor_id, total from compras where id = ${d.compraId} for update`
    if (!c) throw new ErrorCompra('La compra no existe.')
    if (c.estado === 'anulada') throw new ErrorCompra('La compra ya estaba anulada.')
    const items = await tx<{ producto_id: number; cantidad: number }[]>`
      select producto_id, sum(cantidad)::int as cantidad from compra_items where compra_id = ${c.id} group by producto_id`
    await registrarOperacionTx(tx, {
      tipo: 'ajuste',
      destinoId: c.deposito_id,
      usuarioId: d.usuario.id,
      motivo: 'Anulación de compra',
      nota: `Compra N.º ${c.id}: ${d.motivo.trim()}`,
      items: items.map((i) => ({ productoId: i.producto_id, cantidad: -i.cantidad })),
    })
    await tx`update compras set estado = 'anulada', anulada_en = now(), anulada_por = ${d.usuario.id}, nota = concat_ws(' · ', nota, ${'Anulada: ' + d.motivo.trim()}::text) where id = ${c.id}`
    if (Number(c.total) > 0)
      await tx`
        insert into proveedor_movimientos (proveedor_id, tipo, monto, compra_id, nota, usuario_id)
        values (${c.proveedor_id}, 'anulacion', ${-Number(c.total)}, ${c.id}, ${d.motivo.trim()}, ${d.usuario.id})`
  })
}

// ── Gastos ──────────────────────────────────────────────────────────────

import type { MedioGasto } from './compras-tipos'
import { puedeEn } from './permisos'
export type { MedioGasto }

export async function registrarGasto(
  sql: Sql,
  d: {
    usuario: Quien & { sucursal_id: number | null }
    sucursalId: number | null
    fecha: string
    categoria: string
    descripcion?: string | null
    monto: number
    medio: MedioGasto
    desdeCaja: boolean
    proveedorId?: number | null
  },
) {
  if (!(aCentavos(d.monto) > 0)) throw new ErrorCompra('Poné un monto mayor a cero.')
  if (!d.categoria.trim()) throw new ErrorCompra('Elegí la categoría.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha)) throw new ErrorCompra('La fecha no es válida.')
  if (d.desdeCaja && d.medio !== 'efectivo') throw new ErrorCompra('De la caja solo sale efectivo.')
  // La vendedora solo carga gastos de su local, pagados con la caja.
  if (!puedeEn(d.usuario, 'gastos')) {
    if (!d.desdeCaja) throw new ErrorCompra('Los gastos que cargás vos salen de tu caja.')
  }
  return sql.begin(async (tx) => {
    let sucursalId = puedeEn(d.usuario, 'gastos') ? d.sucursalId : d.usuario.sucursal_id
    let movCaja: number | null = null
    if (d.desdeCaja) {
      const motivo = `Gasto: ${d.categoria.trim()}${d.descripcion?.trim() ? ` (${d.descripcion.trim()})` : ''}`
      movCaja = await retiroDeCaja(tx, d.usuario.id, d.monto, motivo)
      const [c] = await tx<{ sucursal_id: number }[]>`select c.sucursal_id from movimientos_caja m join cajas c on c.id = m.caja_id where m.id = ${movCaja}`
      sucursalId = c.sucursal_id
    }
    const [g] = await tx<{ id: number }[]>`
      insert into gastos (sucursal_id, fecha, categoria, descripcion, monto, medio, movimiento_caja_id, proveedor_id, usuario_id)
      values (${sucursalId ?? null}, ${d.fecha}, ${d.categoria.trim().slice(0, 80)}, ${d.descripcion?.trim().slice(0, 200) || null},
        ${d.monto}, ${d.medio}, ${movCaja}, ${d.proveedorId ?? null}, ${d.usuario.id})
      returning id`
    return { gastoId: g.id }
  })
}

/** Anula un gasto. Si salió de una caja todavía abierta, la plata vuelve a esa caja. */
export async function anularGasto(sql: Sql, d: { gastoId: number; usuario: Quien }) {
  if (!puedeEn(d.usuario, 'gastos')) throw new ErrorCompra('No tenés permiso para anular gastos.')
  return sql.begin(async (tx) => {
    const [g] = await tx<{ anulado: boolean; movimiento_caja_id: number | null; monto: number; categoria: string }[]>`
      select anulado, movimiento_caja_id, monto, categoria from gastos where id = ${d.gastoId} for update`
    if (!g) throw new ErrorCompra('El gasto no existe.')
    if (g.anulado) throw new ErrorCompra('El gasto ya estaba anulado.')
    if (g.movimiento_caja_id) {
      const [m] = await tx<{ caja_id: number; cerrada: Date | null }[]>`
        select m.caja_id, c.cerrada from movimientos_caja m join cajas c on c.id = m.caja_id where m.id = ${g.movimiento_caja_id}`
      if (m?.cerrada) throw new ErrorCompra('Ese gasto salió de una caja que ya se cerró: no se puede anular.')
      if (m) await tx`delete from movimientos_caja where id = ${g.movimiento_caja_id}`
    }
    await tx`update gastos set anulado = true, movimiento_caja_id = null where id = ${d.gastoId}`
  })
}
