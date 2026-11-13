import type { Sql } from 'postgres'
import type { TransactionSql } from 'postgres'
import { aCentavos, aPesos, calcularVenta, descuentoEfectivo, formaPermitida, precioSegunForma, type FormaPrecio, type MedioPago, type MedioVenta } from './venta-calculo'
import { puedeEn } from './permisos'
import { lineaReparacion, numeroReparacion } from './reparaciones'

export class ErrorVenta extends Error {}

type Quien = { id: number; rol: 'admin' | 'vendedora' | 'deposito'; permisos?: readonly string[] }

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
  porMedio: Record<MedioVenta, number>
  /** Lo que pagaron clientas a cuenta en esta caja, por medio. */
  cobrosCuenta: Record<MedioPago, number>
  devoluciones: number
  devolucionesEfectivo: number
  ingresos: number
  retiros: number
  montoInicial: number
  efectivoEsperado: number
}

/** Totales de una caja a partir de lo registrado (solo ventas no anuladas). */
export async function resumenCaja(sql: Sql, cajaId: number): Promise<ResumenCaja> {
  const [[v], pagos, devs, [m], [c], cobros] = await Promise.all([
    sql<{ ventas: number; anuladas: number; total: number }[]>`
      select count(*) filter (where estado = 'completada')::int as ventas,
             count(*) filter (where estado = 'anulada')::int as anuladas,
             coalesce(sum(total) filter (where estado = 'completada'), 0) as total
      from ventas where caja_id = ${cajaId}`,
    sql<{ medio: MedioVenta; monto: number }[]>`
      select p.medio, sum(p.monto) as monto
      from venta_pagos p join ventas v on v.id = p.venta_id
      where v.caja_id = ${cajaId} and v.estado = 'completada' group by p.medio`,
    // Las devoluciones salen de la caja donde se hacen (no de la caja de la venta).
    sql<{ medio: MedioVenta; monto: number }[]>`
      select medio, sum(total) as monto from devoluciones where caja_id = ${cajaId} group by medio`,
    sql<{ ingresos: number; retiros: number }[]>`
      select coalesce(sum(monto) filter (where tipo = 'ingreso'), 0) as ingresos,
             coalesce(sum(monto) filter (where tipo = 'retiro'), 0) as retiros
      from movimientos_caja where caja_id = ${cajaId}`,
    sql<{ monto_inicial: number }[]>`select monto_inicial from cajas where id = ${cajaId}`,
    sql<{ medio: MedioPago; monto: number }[]>`
      select medio, -sum(monto) as monto from cuenta_movimientos where caja_id = ${cajaId} and tipo = 'pago' group by medio`,
  ])
  const porMedio: Record<MedioVenta, number> = { efectivo: 0, transferencia: 0, debito: 0, credito: 0, cuenta_corriente: 0, cambio: 0 }
  const cobrosCuenta: Record<MedioPago, number> = { efectivo: 0, transferencia: 0, debito: 0, credito: 0 }
  for (const x of cobros) cobrosCuenta[x.medio] = Number(x.monto)
  for (const p of pagos) porMedio[p.medio as MedioVenta] = Number(p.monto)
  let devueltoC = 0
  let devueltoEfC = 0
  for (const d of devs) {
    porMedio[d.medio] = aPesos(aCentavos(porMedio[d.medio]) - aCentavos(Number(d.monto)))
    devueltoC += aCentavos(Number(d.monto))
    if (d.medio === 'efectivo') devueltoEfC += aCentavos(Number(d.monto))
  }
  const esperado =
    aCentavos(c.monto_inicial) + aCentavos(porMedio.efectivo) + aCentavos(cobrosCuenta.efectivo) + aCentavos(m.ingresos) - aCentavos(m.retiros)
  return {
    ventas: v.ventas,
    anuladas: v.anuladas,
    total: aPesos(aCentavos(Number(v.total)) - devueltoC),
    porMedio,
    cobrosCuenta,
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

// ── Cuenta corriente ────────────────────────────────────────────────────

type Tx = Sql | TransactionSql

/** Saldo del cliente: positivo debe, negativo tiene a favor. */
export async function saldoCliente(sql: Tx, clienteId: number): Promise<number> {
  const [{ saldo }] = await sql<{ saldo: number }[]>`select coalesce(sum(monto), 0) as saldo from cuenta_movimientos where cliente_id = ${clienteId}`
  return Number(saldo)
}

/** Cargar a la cuenta: controla el límite de fiado (la administradora puede pasarlo). */
async function cargarACuenta(
  tx: Tx,
  d: { clienteId: number; monto: number; usuario: Quien; tipo: 'venta' | 'ajuste'; ventaId?: number | null; nota?: string | null },
) {
  const [c] = await tx<{ nombre: string; limite_credito: number; activo: boolean }[]>`
    select nombre, limite_credito, activo from clientes where id = ${d.clienteId} for update`
  if (!c || !c.activo) throw new ErrorVenta('El cliente no existe o está dado de baja.')
  const saldo = await saldoCliente(tx, d.clienteId)
  const nuevo = aCentavos(saldo) + aCentavos(d.monto)
  if (!puedeEn(d.usuario, 'credito') && nuevo > aCentavos(Number(c.limite_credito)))
    throw new ErrorVenta(
      Number(c.limite_credito) > 0
        ? `${c.nombre} supera su límite de cuenta corriente (${Number(c.limite_credito).toLocaleString('es-AR')}). Lo puede autorizar quien maneja los créditos.`
        : `${c.nombre} no tiene saldo a favor suficiente ni cuenta corriente habilitada.`,
    )
  await tx`
    insert into cuenta_movimientos (cliente_id, tipo, monto, venta_id, usuario_id, nota)
    values (${d.clienteId}, ${d.tipo}, ${d.monto}, ${d.ventaId ?? null}, ${d.usuario.id}, ${d.nota ?? null})`
}

/** La clienta paga (o deja una seña a cuenta): entra plata en la caja de quien cobra. */
export async function registrarPagoCuenta(sql: Sql, d: { clienteId: number; usuario: Quien; monto: number; medio: MedioPago; nota?: string | null }) {
  if (!(aCentavos(d.monto) > 0)) throw new ErrorVenta('Poné un monto mayor a cero.')
  return sql.begin(async (tx) => {
    const caja = await cajaAbierta(tx as unknown as Sql, d.usuario.id)
    if (!caja) throw new ErrorVenta('Abrí tu caja: el pago entra ahí.')
    const [c] = await tx`select 1 from clientes where id = ${d.clienteId}`
    if (!c) throw new ErrorVenta('El cliente no existe.')
    const [m] = await tx<{ id: number }[]>`
      insert into cuenta_movimientos (cliente_id, tipo, monto, caja_id, medio, usuario_id, nota)
      values (${d.clienteId}, 'pago', ${-d.monto}, ${caja.id}, ${d.medio}, ${d.usuario.id}, ${d.nota?.trim() || null})
      returning id`
    return { movimientoId: m.id, saldo: await saldoCliente(tx, d.clienteId) }
  })
}

/** Ajuste manual del saldo (solo administradora): positivo suma deuda, negativo suma a favor. */
export async function ajustarCuenta(sql: Sql, d: { clienteId: number; usuario: Quien; monto: number; nota: string }) {
  if (!puedeEn(d.usuario, 'credito')) throw new ErrorVenta('No tenés permiso para ajustar saldos de clientes.')
  if (!aCentavos(d.monto)) throw new ErrorVenta('Poné un monto distinto de cero.')
  if (!d.nota.trim()) throw new ErrorVenta('Contá el motivo del ajuste.')
  await sql`
    insert into cuenta_movimientos (cliente_id, tipo, monto, usuario_id, nota)
    values (${d.clienteId}, 'ajuste', ${d.monto}, ${d.usuario.id}, ${d.nota.trim()})`
}

// ── Venta ───────────────────────────────────────────────────────────────

export type DatosVenta = {
  usuario: Quien
  items: { productoId: number; cantidad: number; descuentoPct: number }[]
  descuentoGlobalPct: number
  /** Lo que paga la clienta (sin contar lo que devuelve en un cambio). */
  pagos: { medio: MedioPago | 'cuenta_corriente'; monto: number; cuotas?: number | null }[]
  efectivoRecibido?: number | null
  /** Total que vio la vendedora: si el precio cambió mientras tanto, se avisa. */
  totalEsperado: number
  /** Con qué precio se vende (lista, transferencia o efectivo). Por defecto, lista. */
  formaPrecio?: FormaPrecio
  /** Reparaciones que se cobran en esta venta (quedan entregadas). */
  reparaciones?: number[]
  clienteId?: number | null
  /** Apartado con seña: el producto queda separado hasta que lo retiran. */
  paraRetirar?: boolean
  /** Cambio de producto: lo que devuelve de otra venta paga esta. */
  cambio?: {
    ventaId: number
    items: { ventaItemId: number; cantidad: number }[]
    /** Si lo devuelto vale más que lo nuevo: se le da la diferencia en efectivo o queda a su favor. */
    excedente: 'efectivo' | 'cuenta_corriente'
  } | null
}

export async function registrarVenta(
  sql: Sql,
  d: DatosVenta,
): Promise<{ ventaId: number; total: number; vuelto: number; devolucionId?: number; aFavor?: number; reintegro?: number }> {
  const idsReparacion = [...new Set(d.reparaciones ?? [])]
  if (!d.items.length && !idsReparacion.length) throw new ErrorVenta('No hay productos en la venta.')
  for (const it of d.items) {
    if (!Number.isInteger(it.cantidad) || it.cantidad <= 0) throw new ErrorVenta('Hay una cantidad no válida.')
    if (!(it.descuentoPct >= 0 && it.descuentoPct <= 100)) throw new ErrorVenta('Hay un descuento no válido.')
  }
  if (!(d.descuentoGlobalPct >= 0 && d.descuentoGlobalPct <= 100)) throw new ErrorVenta('El descuento general no es válido.')
  if (!d.pagos.length && !d.cambio) throw new ErrorVenta('Elegí cómo paga el cliente.')
  for (const p of d.pagos) if (!(aCentavos(p.monto) > 0)) throw new ErrorVenta('Hay un pago sin monto.')
  const aCuenta = d.pagos.filter((p) => p.medio === 'cuenta_corriente').reduce((a, p) => a + aCentavos(p.monto), 0)
  const forma: FormaPrecio = d.formaPrecio ?? 'lista'
  if (!formaPermitida(forma, d.pagos.map((p) => p.medio)))
    throw new ErrorVenta(forma === 'efectivo' ? 'El precio de efectivo es para pagar todo en efectivo. Elegí otro precio o cambiá el pago.' : 'El precio de transferencia es para pagar con transferencia o efectivo. Elegí otro precio o cambiá el pago.')
  if ((aCuenta > 0 || d.paraRetirar || d.cambio?.excedente === 'cuenta_corriente') && !d.clienteId)
    throw new ErrorVenta('Elegí el cliente: hace falta para cargar a su cuenta o apartar.')

  return sql.begin(async (tx) => {
    const caja = await cajaAbierta(tx as unknown as Sql, d.usuario.id)
    if (!caja) throw new ErrorVenta('Abrí la caja antes de vender.')
    const [dep] = await tx<{ id: number }[]>`select id from depositos where sucursal_id = ${caja.sucursal_id} and es_principal and activo`
    if (!dep) throw new ErrorVenta('La sucursal no tiene depósito principal activo.')
    const [{ descuento_max }] = await tx<{ descuento_max: number }[]>`select descuento_max from usuarios where id = ${d.usuario.id}`
    const tope = puedeEn(d.usuario, 'descuento_libre') ? 100 : Number(descuento_max)
    if (d.clienteId) {
      const [c] = await tx`select 1 from clientes where id = ${d.clienteId} and activo`
      if (!c) throw new ErrorVenta('El cliente no existe o está dado de baja.')
    }

    const ids = [...new Set(d.items.map((i) => i.productoId))]
    const productos = await tx<{ id: number; codigo: string; nombre: string; precio: number; precio_transferencia: number | null; precio_efectivo: number | null; activo: boolean }[]>`
      select id, codigo, nombre, precio, precio_transferencia, precio_efectivo, activo from productos where id = any(${ids}::int[])`
    const ajustesPago = await tx<{ clave: string; valor: string }[]>`select clave, valor from ajustes where clave in ('descuento_transferencia', 'descuento_efectivo')`
    const pct = (clave: string) => Math.min(100, Math.max(0, Number(ajustesPago.find((a) => a.clave === clave)?.valor) || 0))
    const descuentos = { transferencia: pct('descuento_transferencia'), efectivo: pct('descuento_efectivo') }
    const porId = new Map(productos.map((p) => [p.id, p]))
    const lineas: { productoId: number; cantidad: number; descuentoPct: number; producto: { id: number | null; codigo: string; nombre: string }; precio: number }[] = d.items.map((it) => {
      const p = porId.get(it.productoId)
      if (!p) throw new ErrorVenta('Uno de los productos ya no existe.')
      if (!p.activo) throw new ErrorVenta(`"${p.nombre}" está dado de baja.`)
      if (descuentoEfectivo(it.descuentoPct, d.descuentoGlobalPct) > tope + 0.001)
        throw new ErrorVenta(`El descuento de "${p.nombre}" supera tu máximo permitido (${tope} %).`)
      return { ...it, producto: p as { id: number | null; codigo: string; nombre: string }, precio: precioSegunForma(p, forma, descuentos) }
    })
    // Reparaciones: una línea cada una, con su precio (el mismo pague como pague) y sin stock.
    if (idsReparacion.length) {
      const reps = await tx<{ id: number; sucursal_id: number; estado: string; precio: number | null; equipo: string; falla: string }[]>`
        select id, sucursal_id, estado, precio, equipo, falla from reparaciones where id = any(${idsReparacion}::int[]) order by id for update`
      for (const id of idsReparacion) {
        const rep = reps.find((x) => x.id === id)
        if (!rep || rep.sucursal_id !== caja.sucursal_id) throw new ErrorVenta('Una de las reparaciones no es de esta sucursal.')
        if (!['listo', 'sin_reparacion'].includes(rep.estado) || !(Number(rep.precio) > 0))
          throw new ErrorVenta(`La reparación ${numeroReparacion(id)} no está lista para cobrar.`)
        lineas.push({
          productoId: 0,
          cantidad: 1,
          descuentoPct: 0,
          producto: { id: null, codigo: numeroReparacion(id), nombre: lineaReparacion(rep) },
          precio: Number(rep.precio),
        })
      }
    }

    const calc = calcularVenta(lineas, d.descuentoGlobalPct)
    if (calc.total !== aCentavos(d.totalEsperado)) throw new ErrorVenta('Cambió el precio de algún producto. Revisá el total y cobrá de nuevo.')

    // Cambio de producto: primero entra lo devuelto (stock y crédito), después se cobra la diferencia.
    let devuelto = 0
    let devolucionId: number | undefined
    if (d.cambio) {
      const r = await devolverEnTx(tx, caja, dep.id, {
        ventaId: d.cambio.ventaId,
        usuario: d.usuario,
        items: d.cambio.items,
        medio: 'cambio',
        motivo: 'Cambio de producto',
        clienteId: d.clienteId ?? null,
      })
      devuelto = aCentavos(r.total)
      devolucionId = r.devolucionId
    }
    const usaCambio = Math.min(devuelto, calc.total)
    const pagado = d.pagos.reduce((a, p) => a + aCentavos(p.monto), 0)
    if (pagado + usaCambio !== calc.total)
      throw new ErrorVenta(d.cambio ? 'La suma de los pagos no coincide con la diferencia a cobrar.' : 'La suma de los pagos no coincide con el total.')

    const efectivo = d.pagos.filter((p) => p.medio === 'efectivo').reduce((a, p) => a + aCentavos(p.monto), 0)
    let vuelto = 0
    let recibido: number | null = null
    if (efectivo > 0) {
      recibido = aCentavos(d.efectivoRecibido ?? aPesos(efectivo))
      if (recibido < efectivo) throw new ErrorVenta('El efectivo recibido no alcanza.')
      vuelto = recibido - efectivo
    }

    const [v] = await tx<{ id: number }[]>`
      insert into ventas (sucursal_id, deposito_id, caja_id, usuario_id, subtotal, descuento, total, descuento_global_pct,
                          efectivo_recibido, vuelto, cliente_id, para_retirar, forma_precio)
      values (${caja.sucursal_id}, ${dep.id}, ${caja.id}, ${d.usuario.id}, ${aPesos(calc.bruto)}, ${aPesos(calc.descuento)}, ${aPesos(calc.total)},
              ${d.descuentoGlobalPct}, ${recibido === null ? null : aPesos(recibido)}, ${aPesos(vuelto)}, ${d.clienteId ?? null}, ${!!d.paraRetirar}, ${forma})
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
    const pagos = [
      ...d.pagos.map((p) => ({ venta_id: v.id, medio: p.medio, monto: p.monto, cuotas: p.medio === 'credito' ? (p.cuotas ?? 1) : null })),
      ...(usaCambio > 0 ? [{ venta_id: v.id, medio: 'cambio', monto: aPesos(usaCambio), cuotas: null }] : []),
    ]
    if (pagos.length) await tx`insert into venta_pagos ${tx(pagos)}`
    if (aCuenta > 0) await cargarACuenta(tx, { clienteId: d.clienteId!, monto: aPesos(aCuenta), usuario: d.usuario, tipo: 'venta', ventaId: v.id })

    // Si lo devuelto vale más que lo nuevo: la diferencia se le da en efectivo o le queda a favor.
    const sobrante = devuelto - usaCambio
    let reintegro = 0
    let aFavor = 0
    if (sobrante > 0) {
      if (d.cambio!.excedente === 'cuenta_corriente') {
        await tx`
          insert into cuenta_movimientos (cliente_id, tipo, monto, venta_id, devolucion_id, usuario_id, nota)
          values (${d.clienteId!}, 'cambio', ${-aPesos(sobrante)}, ${v.id}, ${devolucionId!}, ${d.usuario.id}, 'Diferencia a favor en un cambio')`
        aFavor = sobrante
      } else {
        await tx`
          insert into movimientos_caja (caja_id, tipo, monto, motivo, usuario_id)
          values (${caja.id}, 'retiro', ${aPesos(sobrante)}, ${`Diferencia devuelta en el cambio de la venta #${d.cambio!.ventaId}`}, ${d.usuario.id})`
        reintegro = sobrante
      }
    }

    if (idsReparacion.length)
      await tx`
        update reparaciones set estado = 'entregado', entregado_en = now(), entregado_por = ${d.usuario.id}, venta_id = ${v.id}, actualizado = now()
        where id = any(${idsReparacion}::int[])`
    for (const id of idsReparacion)
      await tx`insert into reparacion_eventos (reparacion_id, estado, nota, usuario_id) values (${id}, 'entregado', ${`Cobrada en la venta N.º ${v.id}.`}, ${d.usuario.id})`

    // Descontar stock del depósito principal (puede quedar en negativo: la prenda está en la mano).
    const porProducto = new Map<number, number>()
    for (const l of lineas) if (l.producto.id) porProducto.set(l.producto.id, (porProducto.get(l.producto.id) ?? 0) + l.cantidad)
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

    return { ventaId: v.id, total: aPesos(calc.total), vuelto: aPesos(vuelto), devolucionId, aFavor: aPesos(aFavor), reintegro: aPesos(reintegro) }
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
    const [cambio] = await tx`select 1 from venta_pagos where venta_id = ${d.ventaId} and medio = 'cambio'`
    if (cambio) throw new ErrorVenta('Esta venta es parte de un cambio de producto: hacé una devolución en lugar de anularla.')
    await tx`
      update reparaciones set estado = 'listo', entregado_en = null, entregado_por = null, venta_id = null, actualizado = now()
      where venta_id = ${d.ventaId}`
    await tx`
      update ventas set estado = 'anulada', anulada_en = now(), anulada_por = ${d.usuarioId}, motivo_anulacion = ${d.motivo.trim()}
      where id = ${d.ventaId}`
    // Lo que se había cargado a la cuenta del cliente, se descuenta.
    await tx`
      insert into cuenta_movimientos (cliente_id, tipo, monto, venta_id, usuario_id, nota)
      select cliente_id, 'ajuste', -sum(monto), ${d.ventaId}, ${d.usuarioId}, 'Anulación de la venta'
      from cuenta_movimientos where venta_id = ${d.ventaId} and tipo = 'venta' group by cliente_id having sum(monto) <> 0`
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

/** Apartado retirado por la clienta. */
export async function marcarRetirada(sql: Sql, d: { ventaId: number; usuario: Quien; sucursalId: number | null }) {
  const [v] = await sql<{ id: number }[]>`
    update ventas set para_retirar = false, retirada_en = now()
    where id = ${d.ventaId} and para_retirar and estado = 'completada'
      ${d.usuario.rol === 'admin' ? sql`` : sql`and sucursal_id = ${d.sucursalId}`}
    returning id`
  if (!v) throw new ErrorVenta('No encontramos ese apartado pendiente.')
}

// ── Devoluciones ────────────────────────────────────────────────────────

export type ItemVendido = { id: number; producto_id: number | null; nombre: string; cantidad: number; devuelto: number; unitario: number }

/** Lo que se puede devolver de una venta, con el precio efectivo por unidad (descuentos incluidos). */
export async function itemsDevolvibles(sql: Tx, ventaId: number): Promise<ItemVendido[]> {
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

type DatosDevolucion = {
  ventaId: number
  usuario: Quien
  items: { ventaItemId: number; cantidad: number }[]
  /** cuenta_corriente: queda a favor del cliente (o le baja la deuda); cambio: paga una venta nueva. */
  medio: MedioVenta
  motivo: string
  clienteId?: number | null
}

/** Devolución dentro de una transacción ya abierta (la usan la devolución sola y el cambio de producto). */
async function devolverEnTx(tx: Tx, caja: CajaAbierta, depositoId: number, d: DatosDevolucion): Promise<{ devolucionId: number; total: number }> {
  if (!d.motivo.trim()) throw new ErrorVenta('Contá el motivo de la devolución.')
  const pedidos = d.items.filter((i) => i.cantidad > 0)
  if (!pedidos.length) throw new ErrorVenta('Elegí qué productos se devuelven.')
  for (const i of pedidos) if (!Number.isInteger(i.cantidad)) throw new ErrorVenta('Hay una cantidad no válida.')

  const [v] = await tx<{ estado: string; sucursal_id: number; total: number; cliente_id: number | null }[]>`
    select estado, sucursal_id, total, cliente_id from ventas where id = ${d.ventaId} for update`
  if (!v) throw new ErrorVenta('La venta no existe.')
  if (v.estado === 'anulada') throw new ErrorVenta('La venta está anulada.')
  if (d.usuario.rol !== 'admin' && v.sucursal_id !== caja.sucursal_id) throw new ErrorVenta('Solo podés hacer devoluciones o cambios de ventas de tu sucursal.')
  const clienteId = d.clienteId ?? v.cliente_id
  if (d.medio === 'cuenta_corriente' && !clienteId) throw new ErrorVenta('Para dejar el saldo a favor, la venta tiene que tener un cliente.')

  const disponibles = await itemsDevolvibles(tx, d.ventaId)
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
    insert into devoluciones (venta_id, caja_id, deposito_id, usuario_id, total, medio, motivo, cliente_id)
    values (${d.ventaId}, ${caja.id}, ${depositoId}, ${d.usuario.id}, ${aPesos(totalC)}, ${d.medio}, ${d.motivo.trim()}, ${clienteId})
    returning id`
  await tx`insert into devolucion_items ${tx(lineas.map((l) => ({ devolucion_id: dv.id, venta_item_id: l.it.id, cantidad: l.cantidad, subtotal: l.subtotal })))}`
  if (d.medio === 'cuenta_corriente')
    await tx`
      insert into cuenta_movimientos (cliente_id, tipo, monto, venta_id, devolucion_id, usuario_id, nota)
      values (${clienteId}, 'devolucion', ${-aPesos(totalC)}, ${d.ventaId}, ${dv.id}, ${d.usuario.id}, ${d.motivo.trim()})`
  for (const l of [...lineas].sort((a, b) => (a.it.producto_id ?? 0) - (b.it.producto_id ?? 0))) {
    if (!l.it.producto_id) continue
    await tx`
      insert into stock (producto_id, deposito_id, cantidad) values (${l.it.producto_id}, ${depositoId}, ${l.cantidad})
      on conflict (producto_id, deposito_id) do update set cantidad = stock.cantidad + excluded.cantidad`
    await tx`
      insert into movimientos_stock (producto_id, deposito_id, cantidad, tipo, motivo, usuario_id, venta_id)
      values (${l.it.producto_id}, ${depositoId}, ${l.cantidad}, 'devolucion', ${'Devolución: ' + d.motivo.trim()}, ${d.usuario.id}, ${d.ventaId})`
  }
  return { devolucionId: dv.id, total: aPesos(totalC) }
}

export async function registrarDevolucion(sql: Sql, d: Omit<DatosDevolucion, 'medio'> & { medio: MedioPago | 'cuenta_corriente' }): Promise<{ devolucionId: number; total: number }> {
  return sql.begin(async (tx) => {
    const caja = await cajaAbierta(tx as unknown as Sql, d.usuario.id)
    if (!caja) throw new ErrorVenta('Abrí tu caja: la plata de la devolución sale de ahí.')
    const [dep] = await tx<{ id: number }[]>`select id from depositos where sucursal_id = ${caja.sucursal_id} and es_principal and activo`
    if (!dep) throw new ErrorVenta('Tu sucursal no tiene depósito principal activo.')
    return devolverEnTx(tx, caja, dep.id, d)
  })
}
