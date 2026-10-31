import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { migrar } from '../scripts/migrate'
import { calcularVenta, descuentoEfectivo, montosSugeridos } from '../src/lib/venta-calculo'
import { abrirCaja, anularVenta, cerrarCaja, ErrorVenta, movimientoCaja, registrarVenta, resumenCaja } from '../src/lib/ventas'

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
    await sql`truncate venta_pagos, venta_items, ventas, movimientos_caja, cajas, operaciones_stock, movimientos_stock, stock, productos, usuarios, depositos, sucursales restart identity cascade`
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
    expect(res.porMedio).toEqual({ efectivo: 21500, transferencia: 0, debito: 30000, credito: 0 })
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
})
