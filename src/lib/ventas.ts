import type { Sql } from 'postgres'
import { aCentavos, aPesos, calcularVenta, descuentoEfectivo, type MedioPago } from './venta-calculo'

export class ErrorVenta extends Error {}

type Quien = { id: number; rol: 'admin' | 'vendedora' }

// ── Caja ────────────────────────────────────────────────────────────────

export type CajaAbierta = { id: number; sucursal_id: number; sucursal: string; abierta: Date; monto_inicial: number }

export async function cajaAbierta(sql: Sql, usuarioId: number): Promise<CajaAbierta | null> {
  const [c] = await sql<CajaAbierta[]>`
    select c.id, c.sucursal_id, s.nombre as sucursal, c.abierta, c.monto_inicial
    from cajas c join sucursales s on s.id = c.sucursal_id
    where c.usuario_id = ${usuarioId} and c.cerrada is null`
  return c ?? null
}

export async function abrirCaja(sql: Sql, d: { usuarioId: number; sucursalId: number; montoInicial: number }): Promise<number> {
  if (!(d.montoInicial >= 0)) throw new ErrorVenta('El monto inicial no es válido.')
  const [s] = await sql`select 1 from sucursales where id = ${d.sucursalId} and activa`
  if (!s) throw new ErrorVenta('La sucursal no existe o está inactiva.')
  try {
    const [c] = await sql<{ id: number }[]>`
      insert into cajas (sucursal_id, usuario_id, monto_inicial) values (${d.sucursalId}, ${d.usuarioId}, ${d.montoInicial}) returning id`
    return c.id
  } catch (e) {
    if ((e as { code?: string }).code === '23505') throw new ErrorVenta('Ya tenés una caja abierta.')
    throw e
  }
}

export type ResumenCaja = {
  ventas: number
  anuladas: number
  /** Vendido menos devuelto. */
  total: number
  /** Por medio, ya restadas las devoluciones. */
  porMedio: Record<MedioPago, number>
  devoluciones: number
  devolucionesEfectivo: number
  ingresos: number
  retiros: number
  montoInicial: number
  efectivoEsperado: number
}

/** Totales de una caja a partir de lo registrado (solo ventas no anuladas). */
export async function resumenCaja(sql: Sql, cajaId: number): Promise<ResumenCaja> {
  const [[v], pagos, devs, [m], [c]] = await Promise.all([
    sql<{ ventas: number; anuladas: number; total: number }[]>`
      select count(*) filter (where estado = 'completada')::int as ventas,
             count(*) filter (where estado = 'anulada')::int as anuladas,
             coalesce(sum(total) filter (where estado = 'completada'), 0) as total
      from ventas where caja_id = ${cajaId}`,
    sql<{ medio: MedioPago; monto: number }[]>`
      select p.medio, sum(p.monto) as monto
      from venta_pagos p join ventas v on v.id = p.venta_id
      where v.caja_id = ${cajaId} and v.estado = 'completada' group by p.medio`,
    // Las devoluciones salen de la caja donde se hacen (no de la caja de la venta).
    sql<{ medio: MedioPago; monto: number }[]>`
      select medio, sum(total) as monto from devoluciones where caja_id = ${cajaId} group by medio`,
    sql<{ ingresos: number; retiros: number }[]>`
      select coalesce(sum(monto) filter (where tipo = 'ingreso'), 0) as ingresos,
             coalesce(sum(monto) filter (where tipo = 'retiro'), 0) as retiros
      from movimientos_caja where caja_id = ${cajaId}`,
    sql<{ monto_inicial: number }[]>`select monto_inicial from cajas where id = ${cajaId}`,
  ])
  const porMedio: Record<MedioPago, number> = { efectivo: 0, transferencia: 0, debito: 0, credito: 0 }
  for (const p of pagos) porMedio[p.medio] = Number(p.monto)
  let devueltoC = 0
  let devueltoEfC = 0
  for (const d of devs) {
    porMedio[d.medio] = aPesos(aCentavos(porMedio[d.medio]) - aCentavos(Number(d.monto)))
    devueltoC += aCentavos(Number(d.monto))
    if (d.medio === 'efectivo') devueltoEfC += aCentavos(Number(d.monto))
  }
  const esperado = aCentavos(c.monto_inicial) + aCentavos(porMedio.efectivo) + aCentavos(m.ingresos) - aCentavos(m.retiros)
  return {
    ventas: v.ventas,
    anuladas: v.anuladas,
    total: aPesos(aCentavos(Number(v.total)) - devueltoC),
    porMedio,
    devoluciones: aPesos(devueltoC),
    devolucionesEfectivo: aPesos(devueltoEfC),
    ingresos: Number(m.ingresos),
    retiros: Number(m.retiros),
    montoInicial: Number(c.monto_inicial),
    efectivoEsperado: aPesos(esperado),
  }
}

export async function movimientoCaja(sql: Sql, d: { cajaId: number; usuarioId: number; tipo: 'ingreso' | 'retiro'; monto: number; motivo: string }) {
  if (!(d.monto > 0)) throw new ErrorVenta('Poné un monto mayor a cero.')
  if (!d.motivo.trim()) throw new ErrorVenta('Contá el motivo (ej.: cambio, pago a proveedor).')
  const [c] = await sql`select 1 from cajas where id = ${d.cajaId} and cerrada is null`
  if (!c) throw new ErrorVenta('La caja ya está cerrada.')
  await sql`insert into movimientos_caja (caja_id, tipo, monto, motivo, usuario_id) values (${d.cajaId}, ${d.tipo}, ${d.monto}, ${d.motivo.trim()}, ${d.usuarioId})`
}

export async function cerrarCaja(sql: Sql, d: { cajaId: number; usuarioId: number; efectivoContado: number; nota?: string | null }) {
  if (!(d.efectivoContado >= 0)) throw new ErrorVenta('Poné cuánto efectivo contaste.')
  return sql.begin(async (tx) => {
    const [c] = await tx`select id from cajas where id = ${d.cajaId} and cerrada is null for update`
    if (!c) throw new ErrorVenta('La caja ya está cerrada.')
    const r = await resumenCaja(tx as unknown as Sql, d.cajaId)
    await tx`
      update cajas set cerrada = now(), cerrada_por = ${d.usuarioId}, efectivo_esperado = ${r.efectivoEsperado},
        efectivo_contado = ${d.efectivoContado}, nota_cierre = ${d.nota ?? null}
      where id = ${d.cajaId}`
    return { ...r, diferencia: aPesos(aCentavos(d.efectivoContado) - aCentavos(r.efectivoEsperado)) }
  })
}

// ── Venta ───────────────────────────────────────────────────────────────

export type DatosVenta = {
  usuario: Quien
  items: { productoId: number; cantidad: number; descuentoPct: number }[]
  descuentoGlobalPct: number
  pagos: { medio: MedioPago; monto: number; cuotas?: number | null }[]
  efectivoRecibido?: number | null
  /** Total que vio la vendedora: si el precio cambió mientras tanto, se avisa. */
  totalEsperado: number
}

export async function registrarVenta(sql: Sql, d: DatosVenta): Promise<{ ventaId: number; total: number; vuelto: number }> {
  if (!d.items.length) throw new ErrorVenta('No hay productos en la venta.')
  for (const it of d.items) {
    if (!Number.isInteger(it.cantidad) || it.cantidad <= 0) throw new ErrorVenta('Hay una cantidad no válida.')
    if (!(it.descuentoPct >= 0 && it.descuentoPct <= 100)) throw new ErrorVenta('Hay un descuento no válido.')
  }
  if (!(d.descuentoGlobalPct >= 0 && d.descuentoGlobalPct <= 100)) throw new ErrorVenta('El descuento general no es válido.')
  if (!d.pagos.length) throw new ErrorVenta('Elegí cómo paga el cliente.')
  for (const p of d.pagos) if (!(aCentavos(p.monto) > 0)) throw new ErrorVenta('Hay un pago sin monto.')

  return sql.begin(async (tx) => {
    const caja = await cajaAbierta(tx as unknown as Sql, d.usuario.id)
    if (!caja) throw new ErrorVenta('Abrí la caja antes de vender.')
    const [dep] = await tx<{ id: number }[]>`select id from depositos where sucursal_id = ${caja.sucursal_id} and es_principal and activo`
    if (!dep) throw new ErrorVenta('La sucursal no tiene depósito principal activo.')
    const [{ descuento_max }] = await tx<{ descuento_max: number }[]>`select descuento_max from usuarios where id = ${d.usuario.id}`
    const tope = d.usuario.rol === 'admin' ? 100 : Number(descuento_max)

    const ids = [...new Set(d.items.map((i) => i.productoId))]
    const productos = await tx<{ id: number; codigo: string; nombre: string; precio: number; activo: boolean }[]>`
      select id, codigo, nombre, precio, activo from productos where id = any(${ids}::int[])`
    const porId = new Map(productos.map((p) => [p.id, p]))
    const lineas = d.items.map((it) => {
      const p = porId.get(it.productoId)
      if (!p) throw new ErrorVenta('Uno de los productos ya no existe.')
      if (!p.activo) throw new ErrorVenta(`"${p.nombre}" está dado de baja.`)
      if (descuentoEfectivo(it.descuentoPct, d.descuentoGlobalPct) > tope + 0.001)
        throw new ErrorVenta(`El descuento de "${p.nombre}" supera tu máximo permitido (${tope} %).`)
      return { ...it, producto: p, precio: Number(p.precio) }
    })

    const calc = calcularVenta(lineas, d.descuentoGlobalPct)
    if (calc.total !== aCentavos(d.totalEsperado)) throw new ErrorVenta('Cambió el precio de algún producto. Revisá el total y cobrá de nuevo.')
    const pagado = d.pagos.reduce((a, p) => a + aCentavos(p.monto), 0)
    if (pagado !== calc.total) throw new ErrorVenta('La suma de los pagos no coincide con el total.')

    const efectivo = d.pagos.filter((p) => p.medio === 'efectivo').reduce((a, p) => a + aCentavos(p.monto), 0)
    let vuelto = 0
    let recibido: number | null = null
    if (efectivo > 0) {
      recibido = aCentavos(d.efectivoRecibido ?? aPesos(efectivo))
      if (recibido < efectivo) throw new ErrorVenta('El efectivo recibido no alcanza.')
      vuelto = recibido - efectivo
    }

    const [v] = await tx<{ id: number }[]>`
      insert into ventas (sucursal_id, deposito_id, caja_id, usuario_id, subtotal, descuento, total, descuento_global_pct, efectivo_recibido, vuelto)
      values (${caja.sucursal_id}, ${dep.id}, ${caja.id}, ${d.usuario.id}, ${aPesos(calc.bruto)}, ${aPesos(calc.descuento)}, ${aPesos(calc.total)},
              ${d.descuentoGlobalPct}, ${recibido === null ? null : aPesos(recibido)}, ${aPesos(vuelto)})
      returning id`

    const items = lineas.map((l, i) => ({
      venta_id: v.id,
      producto_id: l.producto.id,
      codigo: l.producto.codigo,
      nombre: l.producto.nombre,
      cantidad: l.cantidad,
      precio_unitario: l.precio,
      descuento_pct: l.descuentoPct,
      subtotal: aPesos(calc.subtotales[i]),
    }))
    await tx`insert into venta_items ${tx(items)}`
    await tx`insert into venta_pagos ${tx(d.pagos.map((p) => ({ venta_id: v.id, medio: p.medio, monto: p.monto, cuotas: p.medio === 'credito' ? (p.cuotas ?? 1) : null })))}`

    // Descontar stock del depósito principal (puede quedar en negativo: la prenda está en la mano).
    const porProducto = new Map<number, number>()
    for (const l of lineas) porProducto.set(l.producto.id, (porProducto.get(l.producto.id) ?? 0) + l.cantidad)
    const movs = [...porProducto].sort(([a], [b]) => a - b).map(([producto_id, cant]) => ({ producto_id, cantidad: -cant }))
    const json = JSON.stringify(movs)
    const datos = tx`select * from jsonb_to_recordset(${json}::text::jsonb) as x(producto_id int, cantidad int)`
    await tx`
      insert into stock (producto_id, deposito_id, cantidad)
      select producto_id, ${dep.id}, cantidad from (${datos}) d
      on conflict (producto_id, deposito_id) do update set cantidad = stock.cantidad + excluded.cantidad`
    await tx`
      insert into movimientos_stock (producto_id, deposito_id, cantidad, tipo, usuario_id, venta_id)
      select producto_id, ${dep.id}, cantidad, 'venta', ${d.usuario.id}, ${v.id} from (${datos}) d`

    return { ventaId: v.id, total: aPesos(calc.total), vuelto: aPesos(vuelto) }
  })
}

/** Anula una venta completa: devuelve el stock y la saca de los totales de la caja. */
export async function anularVenta(sql: Sql, d: { ventaId: number; usuarioId: number; motivo: string }) {
  if (!d.motivo.trim()) throw new ErrorVenta('Contá por qué se anula.')
  await sql.begin(async (tx) => {
    const [v] = await tx<{ estado: string; deposito_id: number }[]>`select estado, deposito_id from ventas where id = ${d.ventaId} for update`
    if (!v) throw new ErrorVenta('La venta no existe.')
    if (v.estado === 'anulada') throw new ErrorVenta('La venta ya estaba anulada.')
    const [dev] = await tx`select 1 from devoluciones where venta_id = ${d.ventaId}`
    if (dev) throw new ErrorVenta('Esta venta ya tiene devoluciones: devolvé lo que queda en lugar de anularla.')
    await tx`
      update ventas set estado = 'anulada', anulada_en = now(), anulada_por = ${d.usuarioId}, motivo_anulacion = ${d.motivo.trim()}
      where id = ${d.ventaId}`
    const items = await tx<{ producto_id: number; cantidad: number }[]>`
      select producto_id, sum(cantidad)::int as cantidad from venta_items
      where venta_id = ${d.ventaId} and producto_id is not null group by producto_id order by producto_id`
    for (const it of items) {
      await tx`
        insert into stock (producto_id, deposito_id, cantidad) values (${it.producto_id}, ${v.deposito_id}, ${it.cantidad})
        on conflict (producto_id, deposito_id) do update set cantidad = stock.cantidad + excluded.cantidad`
      await tx`
        insert into movimientos_stock (producto_id, deposito_id, cantidad, tipo, motivo, usuario_id, venta_id)
        values (${it.producto_id}, ${v.deposito_id}, ${it.cantidad}, 'devolucion', ${'Anulación de venta: ' + d.motivo.trim()}, ${d.usuarioId}, ${d.ventaId})`
    }
  })
}

// ── Devoluciones ────────────────────────────────────────────────────────

export type ItemVendido = { id: number; producto_id: number | null; nombre: string; cantidad: number; devuelto: number; unitario: number }

/** Lo que se puede devolver de una venta, con el precio efectivo por unidad (descuentos incluidos). */
export async function itemsDevolvibles(sql: Sql, ventaId: number): Promise<ItemVendido[]> {
  const [v] = await sql<{ total: number; suma: number }[]>`
    select v.total, (select sum(subtotal) from venta_items where venta_id = v.id) as suma from ventas v where v.id = ${ventaId}`
  if (!v) return []
  const factor = Number(v.suma) > 0 ? Number(v.total) / Number(v.suma) : 0
  const items = await sql<{ id: number; producto_id: number | null; nombre: string; cantidad: number; subtotal: number; devuelto: number }[]>`
    select i.id, i.producto_id, i.nombre, i.cantidad, i.subtotal,
      coalesce((select sum(di.cantidad) from devolucion_items di where di.venta_item_id = i.id), 0)::int as devuelto
    from venta_items i where i.venta_id = ${ventaId} order by i.id`
  return items.map((i) => ({ ...i, unitario: aPesos(Math.round((aCentavos(Number(i.subtotal)) * factor) / i.cantidad)) }))
}

export async function registrarDevolucion(
  sql: Sql,
  d: { ventaId: number; usuario: Quien; items: { ventaItemId: number; cantidad: number }[]; medio: MedioPago; motivo: string },
): Promise<{ devolucionId: number; total: number }> {
  if (!d.motivo.trim()) throw new ErrorVenta('Contá el motivo de la devolución.')
  const pedidos = d.items.filter((i) => i.cantidad > 0)
  if (!pedidos.length) throw new ErrorVenta('Elegí qué productos se devuelven.')
  for (const i of pedidos) if (!Number.isInteger(i.cantidad)) throw new ErrorVenta('Hay una cantidad no válida.')

  return sql.begin(async (tx) => {
    const caja = await cajaAbierta(tx as unknown as Sql, d.usuario.id)
    if (!caja) throw new ErrorVenta('Abrí tu caja: la plata de la devolución sale de ahí.')
    const [v] = await tx<{ estado: string; sucursal_id: number; total: number }[]>`select estado, sucursal_id, total from ventas where id = ${d.ventaId} for update`
    if (!v) throw new ErrorVenta('La venta no existe.')
    if (v.estado === 'anulada') throw new ErrorVenta('La venta está anulada.')
    if (d.usuario.rol !== 'admin' && v.sucursal_id !== caja.sucursal_id) throw new ErrorVenta('Solo podés hacer devoluciones de ventas de tu sucursal.')
    const [dep] = await tx<{ id: number }[]>`select id from depositos where sucursal_id = ${caja.sucursal_id} and es_principal and activo`
    if (!dep) throw new ErrorVenta('Tu sucursal no tiene depósito principal activo.')

    const disponibles = await itemsDevolvibles(tx as unknown as Sql, d.ventaId)
    const lineas = pedidos.map((p) => {
      const it = disponibles.find((x) => x.id === p.ventaItemId)
      if (!it) throw new ErrorVenta('Uno de los productos no es de esta venta.')
      if (p.cantidad > it.cantidad - it.devuelto) throw new ErrorVenta(`De "${it.nombre}" se pueden devolver como mucho ${it.cantidad - it.devuelto}.`)
      return { it, cantidad: p.cantidad, subtotal: aPesos(aCentavos(it.unitario) * p.cantidad) }
    })
    let totalC = lineas.reduce((a, l) => a + aCentavos(l.subtotal), 0)
    // Que lo devuelto nunca supere lo cobrado (redondeos de los descuentos).
    const [{ ya }] = await tx<{ ya: number }[]>`select coalesce(sum(total), 0) as ya from devoluciones where venta_id = ${d.ventaId}`
    totalC = Math.min(totalC, aCentavos(Number(v.total)) - aCentavos(Number(ya)))
    if (totalC <= 0) throw new ErrorVenta('Ya se devolvió todo lo cobrado en esta venta.')

    const [dv] = await tx<{ id: number }[]>`
      insert into devoluciones (venta_id, caja_id, deposito_id, usuario_id, total, medio, motivo)
      values (${d.ventaId}, ${caja.id}, ${dep.id}, ${d.usuario.id}, ${aPesos(totalC)}, ${d.medio}, ${d.motivo.trim()})
      returning id`
    await tx`insert into devolucion_items ${tx(lineas.map((l) => ({ devolucion_id: dv.id, venta_item_id: l.it.id, cantidad: l.cantidad, subtotal: l.subtotal })))}`
    for (const l of [...lineas].sort((a, b) => (a.it.producto_id ?? 0) - (b.it.producto_id ?? 0))) {
      if (!l.it.producto_id) continue
      await tx`
        insert into stock (producto_id, deposito_id, cantidad) values (${l.it.producto_id}, ${dep.id}, ${l.cantidad})
        on conflict (producto_id, deposito_id) do update set cantidad = stock.cantidad + excluded.cantidad`
      await tx`
        insert into movimientos_stock (producto_id, deposito_id, cantidad, tipo, motivo, usuario_id, venta_id)
        values (${l.it.producto_id}, ${dep.id}, ${l.cantidad}, 'devolucion', ${'Devolución: ' + d.motivo.trim()}, ${d.usuario.id}, ${d.ventaId})`
    }
    return { devolucionId: dv.id, total: aPesos(totalC) }
  })
}
