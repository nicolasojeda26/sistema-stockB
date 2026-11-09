import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { migrar } from '../scripts/migrate'
import { calcularVenta, descuentoEfectivo, montosSugeridos } from '../src/lib/venta-calculo'
import { abrirCaja, anularVenta, cerrarCaja, ErrorVenta, movimientoCaja, registrarDevolucion, registrarPagoCuenta, registrarVenta, resumenCaja, saldoCliente } from '../src/lib/ventas'

describe('cálculo de la venta', () => {
  it('aplica descuentos por línea y general sin errores de centavos', () => {
    const r = calcularVenta(
      [
        { precio: 14900, cantidad: 2, descuentoPct: 0 },
        { precio: 333.33, cantidad: 3, descuentoPct: 10 },
      ],
      5,
    )
    expect(r.bruto).toBe(3079999) // $29.800 + $999,99
    expect(r.subtotales).toEqual([2980000, 89999])
    expect(r.total).toBe(3069999 - Math.round(3069999 * 0.05))
    expect(r.descuento).toBe(r.bruto - r.total)
  })
  it('combina los descuentos para controlar el tope', () => {
    expect(descuentoEfectivo(10, 10)).toBe(19)
    expect(descuentoEfectivo(0, 15)).toBe(15)
  })
  it('sugiere billetes para el vuelto', () => {
    expect(montosSugeridos(1234500)).toEqual([12345, 13000, 14000, 15000, 20000])
    expect(montosSugeridos(1000000)).toEqual([10000, 20000])
  })
})

const url = process.env.TEST_DATABASE_URL

describe.skipIf(!url)('ventas y caja', () => {
  const sql = postgres(url!, { prepare: false, max: 3, onnotice: () => {}, types: { numeric: { to: 1700, from: [1700], serialize: String, parse: Number } } })
  let suc: number, dep: number, vend: { id: number; rol: 'vendedora' }, admin: { id: number; rol: 'admin' }, remera: number, jean: number

  beforeAll(async () => {
    await sql.unsafe('drop schema public cascade; create schema public;')
    await migrar(url!, () => {})
  })
  afterAll(() => sql.end())
  beforeEach(async () => {
    await sql`truncate cuenta_movimientos, clientes, devolucion_items, devoluciones, venta_pagos, venta_items, ventas, movimientos_caja, cajas, operaciones_stock, movimientos_stock, stock, productos, usuarios, depositos, sucursales restart identity cascade`
    ;[{ id: suc }] = await sql`insert into sucursales (nombre) values ('Centro') returning id`
    ;[{ id: dep }] = await sql`insert into depositos (nombre, sucursal_id, es_principal) values ('Local', ${suc}, true) returning id`
    const [v] = await sql`insert into usuarios (usuario, nombre, password_hash, rol, sucursal_id, descuento_max) values ('sofia', 'Sofía', 'x', 'vendedora', ${suc}, 10) returning id`
    const [a] = await sql`insert into usuarios (usuario, nombre, password_hash, rol) values ('belen', 'Belen', 'x', 'admin') returning id`
    vend = { id: v.id, rol: 'vendedora' }
    admin = { id: a.id, rol: 'admin' }
    ;[{ id: remera }] = await sql`insert into productos (codigo, nombre, precio) values ('R1', 'Remera', 10000) returning id`
    ;[{ id: jean }] = await sql`insert into productos (codigo, nombre, precio) values ('J1', 'Jean', 35000) returning id`
    await sql`insert into stock (producto_id, deposito_id, cantidad) values (${remera}, ${dep}, 5), (${jean}, ${dep}, 1)`
  })

  const stock = async (p: number) => (await sql`select cantidad from stock where producto_id = ${p} and deposito_id = ${dep}`)[0].cantidad

  it('no deja vender sin caja abierta', async () => {
    await expect(
      registrarVenta(sql, { usuario: vend, items: [{ productoId: remera, cantidad: 1, descuentoPct: 0 }], descuentoGlobalPct: 0, pagos: [{ medio: 'efectivo', monto: 10000 }], totalEsperado: 10000 }),
    ).rejects.toThrow('Abrí la caja')
  })

  it('vende con pago combinado, calcula el vuelto y descuenta stock', async () => {
    const caja = await abrirCaja(sql, { usuarioId: vend.id, sucursalId: suc, montoInicial: 5000 })
    const r = await registrarVenta(sql, {
      usuario: vend,
      items: [
        { productoId: remera, cantidad: 2, descuentoPct: 0 },
        { productoId: jean, cantidad: 1, descuentoPct: 10 },
      ],
      descuentoGlobalPct: 0,
      pagos: [
        { medio: 'debito', monto: 30000 },
        { medio: 'efectivo', monto: 21500 },
      ],
      efectivoRecibido: 25000,
      totalEsperado: 51500,
    })
    expect(r).toMatchObject({ total: 51500, vuelto: 3500 })
    expect(await stock(remera)).toBe(3)
    expect(await stock(jean)).toBe(0)
    const res = await resumenCaja(sql, caja)
    expect(res).toMatchObject({ ventas: 1, total: 51500, efectivoEsperado: 5000 + 21500 })
    expect(res.porMedio).toEqual({ efectivo: 21500, transferencia: 0, debito: 30000, credito: 0, cuenta_corriente: 0, cambio: 0 })
  })

  it('rechaza descuentos por encima del tope de la vendedora, pero no a la administradora', async () => {
    await abrirCaja(sql, { usuarioId: vend.id, sucursalId: suc, montoInicial: 0 })
    await expect(
      registrarVenta(sql, { usuario: vend, items: [{ productoId: remera, cantidad: 1, descuentoPct: 10 }], descuentoGlobalPct: 5, pagos: [{ medio: 'efectivo', monto: 8550 }], totalEsperado: 8550 }),
    ).rejects.toThrow('supera tu máximo')
    await abrirCaja(sql, { usuarioId: admin.id, sucursalId: suc, montoInicial: 0 })
    const r = await registrarVenta(sql, { usuario: admin, items: [{ productoId: remera, cantidad: 1, descuentoPct: 50 }], descuentoGlobalPct: 0, pagos: [{ medio: 'transferencia', monto: 5000 }], totalEsperado: 5000 })
    expect(r.total).toBe(5000)
  })

  it('avisa si cambió un precio o si los pagos no cierran, sin guardar nada', async () => {
    await abrirCaja(sql, { usuarioId: vend.id, sucursalId: suc, montoInicial: 0 })
    const base = { usuario: vend, items: [{ productoId: remera, cantidad: 1, descuentoPct: 0 }], descuentoGlobalPct: 0 }
    await expect(registrarVenta(sql, { ...base, pagos: [{ medio: 'efectivo', monto: 9000 }], totalEsperado: 9000 })).rejects.toThrow('Cambió el precio')
    await expect(registrarVenta(sql, { ...base, pagos: [{ medio: 'efectivo', monto: 9000 }], totalEsperado: 10000 })).rejects.toThrow('no coincide')
    await expect(registrarVenta(sql, { ...base, pagos: [{ medio: 'efectivo', monto: 10000 }], efectivoRecibido: 5000, totalEsperado: 10000 })).rejects.toThrow('no alcanza')
    const [{ n }] = await sql`select count(*)::int as n from ventas`
    expect(n).toBe(0)
    expect(await stock(remera)).toBe(5)
  })

  it('al anular devuelve el stock y la venta no cuenta en la caja', async () => {
    const caja = await abrirCaja(sql, { usuarioId: vend.id, sucursalId: suc, montoInicial: 0 })
    const { ventaId } = await registrarVenta(sql, { usuario: vend, items: [{ productoId: remera, cantidad: 2, descuentoPct: 0 }], descuentoGlobalPct: 0, pagos: [{ medio: 'efectivo', monto: 20000 }], totalEsperado: 20000 })
    await anularVenta(sql, { ventaId, usuarioId: admin.id, motivo: 'Se cobró mal' })
    expect(await stock(remera)).toBe(5)
    expect(await resumenCaja(sql, caja)).toMatchObject({ ventas: 0, anuladas: 1, total: 0, efectivoEsperado: 0 })
    await expect(anularVenta(sql, { ventaId, usuarioId: admin.id, motivo: 'otra vez' })).rejects.toBeInstanceOf(ErrorVenta)
  })

  it('cierra la caja con retiros e ingresos y calcula la diferencia', async () => {
    const caja = await abrirCaja(sql, { usuarioId: vend.id, sucursalId: suc, montoInicial: 10000 })
    await expect(abrirCaja(sql, { usuarioId: vend.id, sucursalId: suc, montoInicial: 0 })).rejects.toThrow('Ya tenés una caja abierta')
    await registrarVenta(sql, { usuario: vend, items: [{ productoId: remera, cantidad: 1, descuentoPct: 0 }], descuentoGlobalPct: 0, pagos: [{ medio: 'efectivo', monto: 10000 }], efectivoRecibido: 20000, totalEsperado: 10000 })
    await movimientoCaja(sql, { cajaId: caja, usuarioId: vend.id, tipo: 'retiro', monto: 3000, motivo: 'Pago al flete' })
    await movimientoCaja(sql, { cajaId: caja, usuarioId: vend.id, tipo: 'ingreso', monto: 500, motivo: 'Cambio' })
    const r = await cerrarCaja(sql, { cajaId: caja, usuarioId: vend.id, efectivoContado: 17000 })
    expect(r.efectivoEsperado).toBe(10000 + 10000 - 3000 + 500)
    expect(r.diferencia).toBe(-500)
    await expect(movimientoCaja(sql, { cajaId: caja, usuarioId: vend.id, tipo: 'retiro', monto: 1, motivo: 'x' })).rejects.toThrow('cerrada')
    // Cerrada la caja, ya puede abrir otra.
    expect(await abrirCaja(sql, { usuarioId: vend.id, sucursalId: suc, montoInicial: 0 })).toBeGreaterThan(caja)
  })

  it('ventas simultáneas del mismo producto no pierden unidades', async () => {
    await abrirCaja(sql, { usuarioId: vend.id, sucursalId: suc, montoInicial: 0 })
    await abrirCaja(sql, { usuarioId: admin.id, sucursalId: suc, montoInicial: 0 })
    await Promise.all(
      [vend, admin, vend, admin].map((u) =>
        registrarVenta(sql, { usuario: u, items: [{ productoId: remera, cantidad: 1, descuentoPct: 0 }], descuentoGlobalPct: 0, pagos: [{ medio: 'efectivo', monto: 10000 }], totalEsperado: 10000 }),
      ),
    )
    expect(await stock(remera)).toBe(1)
  })

  const item = (productoId: number, cantidad = 1) => ({ productoId, cantidad, descuentoPct: 0 })

  it('cuenta corriente: sin clienta o sin límite no deja; con límite carga, cobra y suma a la caja', async () => {
    const caja = await abrirCaja(sql, { usuarioId: vend.id, sucursalId: suc, montoInicial: 0 })
    const [{ id: ana }] = await sql`insert into clientes (nombre) values ('Ana') returning id`
    const base = { usuario: vend, items: [item(remera)], descuentoGlobalPct: 0, totalEsperado: 10000 }
    await expect(registrarVenta(sql, { ...base, pagos: [{ medio: 'cuenta_corriente', monto: 10000 }] })).rejects.toThrow('Elegí el cliente')
    await expect(registrarVenta(sql, { ...base, clienteId: ana, pagos: [{ medio: 'cuenta_corriente', monto: 10000 }] })).rejects.toThrow('no tiene saldo a favor')
    await sql`update clientes set limite_credito = 20000 where id = ${ana}`
    // Seña de 4.000 en efectivo y el resto a cuenta, apartada.
    const v = await registrarVenta(sql, { ...base, clienteId: ana, paraRetirar: true, pagos: [{ medio: 'efectivo', monto: 4000 }, { medio: 'cuenta_corriente', monto: 6000 }] })
    expect(await saldoCliente(sql, ana)).toBe(6000)
    expect((await sql`select para_retirar from ventas where id = ${v.ventaId}`)[0].para_retirar).toBe(true)
    await registrarPagoCuenta(sql, { clienteId: ana, usuario: vend, monto: 6000, medio: 'efectivo' })
    expect(await saldoCliente(sql, ana)).toBe(0)
    const r = await resumenCaja(sql, caja)
    expect(r.porMedio.cuenta_corriente).toBe(6000)
    expect(r.cobrosCuenta.efectivo).toBe(6000)
    expect(r.efectivoEsperado).toBe(10000)
    // Anular devuelve lo cargado a la cuenta.
    const v2 = await registrarVenta(sql, { ...base, clienteId: ana, pagos: [{ medio: 'cuenta_corriente', monto: 10000 }] })
    await anularVenta(sql, { ventaId: v2.ventaId, usuarioId: admin.id, motivo: 'error' })
    expect(await saldoCliente(sql, ana)).toBe(0)
  })

  it('cambio de prenda: paga la diferencia, vuelve el stock y la caja cierra bien', async () => {
    const caja = await abrirCaja(sql, { usuarioId: vend.id, sucursalId: suc, montoInicial: 0 })
    const v = await registrarVenta(sql, { usuario: vend, items: [item(remera)], descuentoGlobalPct: 0, pagos: [{ medio: 'efectivo', monto: 10000 }], totalEsperado: 10000 })
    const [it] = await sql`select id from venta_items where venta_id = ${v.ventaId}`
    const c = await registrarVenta(sql, {
      usuario: vend,
      items: [item(jean)],
      descuentoGlobalPct: 0,
      pagos: [{ medio: 'efectivo', monto: 25000 }],
      totalEsperado: 35000,
      cambio: { ventaId: v.ventaId, items: [{ ventaItemId: it.id, cantidad: 1 }], excedente: 'efectivo' },
    })
    expect(await stock(remera)).toBe(5)
    expect(await stock(jean)).toBe(0)
    expect((await sql`select medio, total from devoluciones where id = ${c.devolucionId!}`)[0]).toEqual({ medio: 'cambio', total: 10000 })
    const r = await resumenCaja(sql, caja)
    expect(r.total).toBe(35000)
    expect(r.efectivoEsperado).toBe(35000)
    // Lo mismo no se puede volver a cambiar.
    await expect(
      registrarVenta(sql, { usuario: vend, items: [item(remera)], descuentoGlobalPct: 0, pagos: [], totalEsperado: 10000, cambio: { ventaId: v.ventaId, items: [{ ventaItemId: it.id, cantidad: 1 }], excedente: 'efectivo' } }),
    ).rejects.toThrow('como mucho 0')
  })

  it('cambio por algo más barato: la diferencia se devuelve o queda a favor', async () => {
    const caja = await abrirCaja(sql, { usuarioId: vend.id, sucursalId: suc, montoInicial: 50000 })
    const [{ id: ana }] = await sql`insert into clientes (nombre) values ('Ana') returning id`
    await sql`update stock set cantidad = 3 where producto_id = ${jean}`
    const v = await registrarVenta(sql, { usuario: vend, clienteId: ana, items: [item(jean, 2)], descuentoGlobalPct: 0, pagos: [{ medio: 'debito', monto: 70000 }], totalEsperado: 70000 })
    const [it] = await sql`select id from venta_items where venta_id = ${v.ventaId}`
    const cambio = (excedente: 'efectivo' | 'cuenta_corriente') => ({ ventaId: v.ventaId, items: [{ ventaItemId: it.id, cantidad: 1 }], excedente })
    const a = await registrarVenta(sql, { usuario: vend, clienteId: ana, items: [item(remera)], descuentoGlobalPct: 0, pagos: [], totalEsperado: 10000, cambio: cambio('cuenta_corriente') })
    expect(a.aFavor).toBe(25000)
    expect(await saldoCliente(sql, ana)).toBe(-25000)
    const b = await registrarVenta(sql, { usuario: vend, clienteId: ana, items: [item(remera)], descuentoGlobalPct: 0, pagos: [], totalEsperado: 10000, cambio: cambio('efectivo') })
    expect(b.reintegro).toBe(25000)
    const r = await resumenCaja(sql, caja)
    expect(r.efectivoEsperado).toBe(25000) // 50.000 inicial − 25.000 devueltos
    // Usa el saldo a favor para pagar.
    await registrarVenta(sql, { usuario: vend, clienteId: ana, items: [item(remera)], descuentoGlobalPct: 0, pagos: [{ medio: 'cuenta_corriente', monto: 10000 }], totalEsperado: 10000 })
    expect(await saldoCliente(sql, ana)).toBe(-15000)
    // Devolución a favor de la clienta.
    const [it2] = await sql`select i.id, i.venta_id from venta_items i join ventas v on v.id = i.venta_id where v.cliente_id = ${ana} order by i.id desc limit 1`
    await registrarDevolucion(sql, { ventaId: it2.venta_id, usuario: vend, items: [{ ventaItemId: it2.id, cantidad: 1 }], medio: 'cuenta_corriente', motivo: 'no le gustó' })
    expect(await saldoCliente(sql, ana)).toBe(-25000)
  })
})
