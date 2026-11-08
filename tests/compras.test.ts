import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { migrar } from '../scripts/migrate'
import { ajustarCuentaProveedor, anularCompra, anularGasto, registrarCompra, registrarGasto, registrarPagoProveedor, saldoProveedor, totalesCompra } from '../src/lib/compras'
import { abrirCaja, resumenCaja } from '../src/lib/ventas'

describe('totales de compra', () => {
  it('calcula neto, IVA y percepciones sin errores de centavos', () => {
    expect(totalesCompra([{ cantidad: 3, costo: 1234.56 }, { cantidad: 1, costo: 0.1 }], 21, 150.5)).toEqual({
      neto: 3703.78,
      iva: 777.79,
      percepciones: 150.5,
      total: 4632.07,
    })
    expect(totalesCompra([{ cantidad: 2, costo: 5000 }], 0, 0).total).toBe(10000)
  })
})

const url = process.env.TEST_DATABASE_URL

describe.skipIf(!url)('compras, proveedores y gastos', () => {
  const sql = postgres(url!, { prepare: false, max: 3, onnotice: () => {}, types: { numeric: { to: 1700, from: [1700], serialize: String, parse: Number } } })
  let suc: number, dep: number, prov: number, remera: number, jean: number
  let admin: { id: number; rol: 'admin'; sucursal_id: number | null }, vend: { id: number; rol: 'vendedora'; sucursal_id: number | null }

  beforeAll(async () => {
    await sql.unsafe('drop schema public cascade; create schema public;')
    await migrar(url!, () => {})
  })
  afterAll(() => sql.end())
  beforeEach(async () => {
    await sql`truncate gastos, proveedor_movimientos, compra_items, compras, proveedores, movimientos_caja, cajas, operaciones_stock, movimientos_stock, stock, cambios_precio, productos, usuarios, depositos, sucursales restart identity cascade`
    ;[{ id: suc }] = await sql`insert into sucursales (nombre) values ('Centro') returning id`
    ;[{ id: dep }] = await sql`insert into depositos (nombre, sucursal_id, es_principal) values ('Local', ${suc}, true) returning id`
    const [a] = await sql`insert into usuarios (usuario, nombre, password_hash, rol) values ('belen', 'Belen', 'x', 'admin') returning id`
    const [v] = await sql`insert into usuarios (usuario, nombre, password_hash, rol, sucursal_id) values ('sofia', 'Sofía', 'x', 'vendedora', ${suc}) returning id`
    admin = { id: a.id, rol: 'admin', sucursal_id: null }
    vend = { id: v.id, rol: 'vendedora', sucursal_id: suc }
    ;[{ id: prov }] = await sql`insert into proveedores (nombre) values ('Textil Sur') returning id`
    ;[{ id: remera }] = await sql`insert into productos (codigo, nombre, precio, costo) values ('R1', 'Remera', 10000, 4000) returning id`
    ;[{ id: jean }] = await sql`insert into productos (codigo, nombre, precio, costo) values ('J1', 'Jean', 35000, 15000) returning id`
    await sql`insert into stock (producto_id, deposito_id, cantidad) values (${remera}, ${dep}, 2)`
  })

  const stock = async (p: number) => (await sql`select coalesce(sum(cantidad), 0)::int n from stock where producto_id = ${p} and deposito_id = ${dep}`)[0].n
  const base = () => ({
    usuario: admin,
    proveedorId: prov,
    depositoId: dep,
    fecha: '2026-11-07',
    tipoComprobante: 'A' as const,
    numero: '0003-00001234',
    items: [
      { productoId: remera, cantidad: 10, costo: 4500 },
      { productoId: jean, cantidad: 4, costo: 16000 },
    ],
    ivaPct: 21,
    percepciones: 1000,
    totalEsperado: 132890, // neto 109.000 + IVA 22.890 + 1.000
    actualizarCostos: true,
  })

  it('ingresa el stock, actualiza costos y suma a la cuenta del proveedor', async () => {
    const r = await registrarCompra(sql, base())
    expect(r).toMatchObject({ neto: 109000, iva: 22890, total: 132890 })
    expect(await stock(remera)).toBe(12)
    expect(await stock(jean)).toBe(4)
    const costos = await sql`select costo from productos order by id`
    expect(costos.map((c) => c.costo)).toEqual([4500, 16000])
    expect((await sql`select origen from cambios_precio limit 1`)[0].origen).toBe('compra')
    expect(await saldoProveedor(sql, prov)).toBe(132890)
    await expect(registrarCompra(sql, base())).rejects.toThrow('ya está cargada')
    await expect(registrarCompra(sql, { ...base(), numero: '9', totalEsperado: 999 })).rejects.toThrow('no coincide')
    await expect(registrarCompra(sql, { ...base(), usuario: vend })).rejects.toThrow('administradora')
    await expect(registrarCompra(sql, { ...base(), numero: '9', tipoComprobante: 'C' })).rejects.toThrow('discrimina IVA')
  })

  it('pago inicial desde la caja, pagos posteriores, nota de crédito y anulación', async () => {
    const caja = await abrirCaja(sql, { usuarioId: admin.id, sucursalId: suc, montoInicial: 200000 })
    await registrarCompra(sql, { ...base(), actualizarCostos: false, pago: { monto: 32890, medio: 'efectivo', desdeCaja: true } })
    expect(await saldoProveedor(sql, prov)).toBe(100000)
    expect((await sql`select costo from productos where id = ${remera}`)[0].costo).toBe(4000)
    expect((await resumenCaja(sql, caja)).efectivoEsperado).toBe(200000 - 32890)
    await registrarPagoProveedor(sql, { proveedorId: prov, usuario: admin, monto: 60000, medio: 'transferencia', desdeCaja: false })
    await ajustarCuentaProveedor(sql, { proveedorId: prov, usuario: admin, monto: 5000, tipo: 'nota_credito', nota: 'prendas falladas' })
    expect(await saldoProveedor(sql, prov)).toBe(35000)
    await expect(registrarPagoProveedor(sql, { proveedorId: prov, usuario: admin, monto: 1, medio: 'transferencia', desdeCaja: true })).rejects.toThrow('solo sale efectivo')

    const [c] = await sql`select id from compras`
    await anularCompra(sql, { compraId: c.id, usuario: admin, motivo: 'factura mal hecha' })
    expect(await stock(remera)).toBe(2)
    expect(await stock(jean)).toBe(0)
    expect(await saldoProveedor(sql, prov)).toBe(35000 - 132890) // lo pagado queda a favor
    await expect(anularCompra(sql, { compraId: c.id, usuario: admin, motivo: 'x' })).rejects.toThrow('ya estaba anulada')
    // Se puede volver a cargar la misma factura bien hecha.
    await registrarCompra(sql, base())
  })

  it('gastos: de la caja, por transferencia, permisos y anulación', async () => {
    await expect(
      registrarGasto(sql, { usuario: vend, sucursalId: null, fecha: '2026-11-07', categoria: 'Limpieza', monto: 3000, medio: 'efectivo', desdeCaja: true }),
    ).rejects.toThrow('abrí tu caja')
    const caja = await abrirCaja(sql, { usuarioId: vend.id, sucursalId: suc, montoInicial: 10000 })
    const g = await registrarGasto(sql, { usuario: vend, sucursalId: null, fecha: '2026-11-07', categoria: 'Limpieza', descripcion: 'lavandina', monto: 3000, medio: 'efectivo', desdeCaja: true })
    expect((await resumenCaja(sql, caja)).efectivoEsperado).toBe(7000)
    expect((await sql`select sucursal_id from gastos where id = ${g.gastoId}`)[0].sucursal_id).toBe(suc)
    await expect(
      registrarGasto(sql, { usuario: vend, sucursalId: null, fecha: '2026-11-07', categoria: 'Alquiler', monto: 1, medio: 'transferencia', desdeCaja: false }),
    ).rejects.toThrow('salen de tu caja')
    await registrarGasto(sql, { usuario: admin, sucursalId: suc, fecha: '2026-11-01', categoria: 'Alquiler', monto: 450000, medio: 'transferencia', desdeCaja: false })
    await expect(anularGasto(sql, { gastoId: g.gastoId, usuario: vend })).rejects.toThrow('administradora')
    await anularGasto(sql, { gastoId: g.gastoId, usuario: admin })
    expect((await resumenCaja(sql, caja)).efectivoEsperado).toBe(10000)
    expect((await sql`select sum(monto) s from gastos where not anulado`)[0].s).toBe(450000)
  })
})
