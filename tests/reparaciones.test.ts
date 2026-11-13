import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { migrar } from '../scripts/migrate'
import { cambiarEstadoReparacion, ingresarReparacion, linkWhatsApp, reparacionesCobrables } from '../src/lib/reparaciones'
import { abrirCaja, anularVenta, registrarVenta } from '../src/lib/ventas'

describe('link de WhatsApp', () => {
  it('arma el número argentino', () => {
    expect(linkWhatsApp('379 4-123456', 'hola')).toBe('https://wa.me/5493794123456?text=hola')
    expect(linkWhatsApp('0379 15 4123456', 'x')).toBe('https://wa.me/5493794123456?text=x')
    expect(linkWhatsApp('+54 9 379 4123456', 'x')).toBe('https://wa.me/5493794123456?text=x')
    expect(linkWhatsApp('123', 'x')).toBeNull()
    expect(linkWhatsApp(null, 'x')).toBeNull()
  })
})

const url = process.env.TEST_DATABASE_URL

describe.skipIf(!url)('reparaciones', () => {
  const sql = postgres(url!, { prepare: false, max: 3, onnotice: () => {}, types: { numeric: { to: 1700, from: [1700], serialize: String, parse: Number } } })
  let suc: number, otra: number, funda: number
  type U = { id: number; rol: 'admin' | 'vendedora' | 'deposito'; sucursal_id: number | null }
  let vend: U, ajena: U

  beforeAll(async () => {
    await sql.unsafe('drop schema public cascade; create schema public;')
    await migrar(url!, () => {})
    ;[{ id: suc }] = await sql`insert into sucursales (nombre) values ('San Lorenzo 960') returning id`
    ;[{ id: otra }] = await sql`insert into sucursales (nombre) values ('Catamarca 815') returning id`
    await sql`insert into depositos (nombre, sucursal_id, es_principal) values ('Local', ${suc}, true), ('Local', ${otra}, true)`
    const [v] = await sql`insert into usuarios (usuario, nombre, password_hash, rol, sucursal_id) values ('clarisa', 'Clarisa', 'x', 'vendedora', ${suc}) returning id`
    const [o] = await sql`insert into usuarios (usuario, nombre, password_hash, rol, sucursal_id) values ('marianela', 'Marianela', 'x', 'vendedora', ${otra}) returning id`
    vend = { id: v.id, rol: 'vendedora', sucursal_id: suc }
    ajena = { id: o.id, rol: 'vendedora', sucursal_id: otra }
    ;[{ id: funda }] = await sql`insert into productos (codigo, nombre, precio) values ('F1', 'Funda', 10000) returning id`
  })
  afterAll(() => sql.end())

  it('ingresa, se repara, se cobra en la caja junto con una funda y queda entregada', async () => {
    await expect(ingresarReparacion(sql, { usuario: vend, sucursalId: otra, clienteNombre: 'Ana', equipo: 'A15', falla: 'Pantalla' })).rejects.toThrow('tu sucursal')
    const id = await ingresarReparacion(sql, {
      usuario: vend,
      sucursalId: suc,
      clienteNombre: 'Ana Gómez',
      clienteTelefono: '3794 123456',
      equipo: 'Samsung A15',
      falla: 'Pantalla rota, no da imagen',
      estadoEquipo: 'Con funda, sin chip',
      presupuesto: 45000,
    })
    await expect(cambiarEstadoReparacion(sql, { usuario: ajena, id, cambio: { accion: 'empezar' } })).rejects.toThrow('No encontramos')
    await cambiarEstadoReparacion(sql, { usuario: vend, id, cambio: { accion: 'empezar' } })
    await abrirCaja(sql, { usuarioId: vend.id, sucursalId: suc, montoInicial: 0 })
    // Todavía no está lista: no se puede cobrar.
    await expect(
      registrarVenta(sql, { usuario: vend, items: [], reparaciones: [id], descuentoGlobalPct: 0, pagos: [{ medio: 'efectivo', monto: 1 }], totalEsperado: 1 }),
    ).rejects.toThrow('no está lista')
    await expect(cambiarEstadoReparacion(sql, { usuario: vend, id, cambio: { accion: 'listo', precio: 0 } })).rejects.toThrow('cuánto se cobra')
    await cambiarEstadoReparacion(sql, { usuario: vend, id, cambio: { accion: 'listo', precio: 48000, diagnostico: 'Cambio de módulo' } })
    expect((await reparacionesCobrables(sql, suc, 'gómez')).map((r) => r.id)).toEqual([id])
    expect(await reparacionesCobrables(sql, otra)).toEqual([])

    // Precio de efectivo: la funda baja 30 %, la reparación no (precio fijo).
    const r = await registrarVenta(sql, {
      usuario: vend,
      items: [{ productoId: funda, cantidad: 1, descuentoPct: 0 }],
      reparaciones: [id],
      descuentoGlobalPct: 0,
      pagos: [{ medio: 'efectivo', monto: 55000 }],
      totalEsperado: 55000,
      formaPrecio: 'efectivo',
    })
    const its = await sql`select producto_id, codigo, nombre, precio_unitario from venta_items where venta_id = ${r.ventaId} order by id`
    expect(its.map((i) => [i.producto_id === null, i.codigo, Number(i.precio_unitario)])).toEqual([[false, 'F1', 7000], [true, 'R-' + String(id).padStart(5, '0'), 48000]])
    expect(its[1].nombre).toContain('Samsung A15')
    const [rep] = await sql`select estado, venta_id from reparaciones where id = ${id}`
    expect(rep).toMatchObject({ estado: 'entregado', venta_id: r.ventaId })
    // La reparación no mueve stock.
    expect((await sql`select count(*)::int n from movimientos_stock where venta_id = ${r.ventaId}`)[0].n).toBe(1)
    // No se cobra dos veces.
    await expect(
      registrarVenta(sql, { usuario: vend, items: [], reparaciones: [id], descuentoGlobalPct: 0, pagos: [{ medio: 'efectivo', monto: 48000 }], totalEsperado: 48000 }),
    ).rejects.toThrow('no está lista')

    // Si se anula la venta, la reparación vuelve a "lista".
    await anularVenta(sql, { ventaId: r.ventaId, usuarioId: vend.id, motivo: 'Error de cobro' })
    expect((await sql`select estado, venta_id from reparaciones where id = ${id}`)[0]).toMatchObject({ estado: 'listo', venta_id: null })
  })

  it('sin reparación y sin cargo se entrega sin pasar por la caja', async () => {
    const id = await ingresarReparacion(sql, { usuario: vend, sucursalId: suc, clienteNombre: 'Leo', equipo: 'Moto G54', falla: 'No carga' })
    await expect(cambiarEstadoReparacion(sql, { usuario: vend, id, cambio: { accion: 'entregar_sin_cobro' } })).rejects.toThrow('Primero')
    await cambiarEstadoReparacion(sql, { usuario: vend, id, cambio: { accion: 'sin_reparacion', diagnostico: 'Placa dañada' } })
    await cambiarEstadoReparacion(sql, { usuario: vend, id, cambio: { accion: 'entregar_sin_cobro' } })
    expect((await sql`select estado from reparaciones where id = ${id}`)[0].estado).toBe('entregado')
    await expect(cambiarEstadoReparacion(sql, { usuario: vend, id, cambio: { accion: 'empezar' } })).rejects.toThrow('cerrada')
    const eventos = await sql`select estado from reparacion_eventos where reparacion_id = ${id} order by id`
    expect(eventos.map((e) => e.estado)).toEqual(['ingresado', 'sin_reparacion', 'entregado'])
  })
})
