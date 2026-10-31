import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { migrar } from '../scripts/migrate'
import { codigoInterno, esEan13 } from '../src/lib/codigos'
import { ErrorStock, nuevoCodigoInterno, registrarOperacion } from '../src/lib/stock'

describe('códigos', () => {
  it('genera EAN-13 válidos del rango interno', () => {
    expect(codigoInterno(1)).toBe('2000000000015')
    expect(esEan13(codigoInterno(1))).toBe(true)
    expect(esEan13('7790001000011')).toBe(false)
    expect(esEan13('7790070012050')).toBe(true)
  })
})

const url = process.env.TEST_DATABASE_URL

describe.skipIf(!url)('operaciones de stock', () => {
  const sql = postgres(url!, { prepare: false, max: 3, onnotice: () => {}, types: { numeric: { to: 1700, from: [1700], serialize: String, parse: Number } } })
  let local: number, trastienda: number, otraSucursal: number, admin: number, remera: number, jean: number

  beforeAll(async () => {
    await sql.unsafe('drop schema public cascade; create schema public;')
    await migrar(url!, () => {})
  })
  afterAll(() => sql.end())
  beforeEach(async () => {
    await sql`truncate operaciones_stock, cambios_precio, movimientos_stock, stock, productos, categorias, usuarios, depositos, sucursales restart identity cascade`
    const [s1] = await sql`insert into sucursales (nombre) values ('Centro') returning id`
    const [s2] = await sql`insert into sucursales (nombre) values ('Shopping') returning id`
    ;[{ id: local }] = await sql`insert into depositos (nombre, sucursal_id, es_principal) values ('Local', ${s1.id}, true) returning id`
    ;[{ id: trastienda }] = await sql`insert into depositos (nombre, sucursal_id) values ('Trastienda', ${s1.id}) returning id`
    ;[{ id: otraSucursal }] = await sql`insert into depositos (nombre, sucursal_id, es_principal) values ('Local', ${s2.id}, true) returning id`
    ;[{ id: admin }] = await sql`insert into usuarios (usuario, nombre, password_hash, rol) values ('belen', 'Belen', 'x', 'admin') returning id`
    ;[{ id: remera }] = await sql`insert into productos (codigo, nombre, precio) values ('R1', 'Remera', 1000) returning id`
    ;[{ id: jean }] = await sql`insert into productos (codigo, nombre, precio) values ('J1', 'Jean', 3000) returning id`
  })

  const stock = async (p: number, d: number) => (await sql`select cantidad from stock where producto_id = ${p} and deposito_id = ${d}`)[0]?.cantidad ?? 0

  it('un ingreso suma stock, junta productos repetidos y queda registrado', async () => {
    const r = await registrarOperacion(sql, {
      tipo: 'ingreso',
      destinoId: local,
      usuarioId: admin,
      nota: 'Remito 123',
      items: [{ productoId: remera, cantidad: 3 }, { productoId: jean, cantidad: 2 }, { productoId: remera, cantidad: 1 }],
    })
    expect(r.movimientos).toBe(2)
    expect(await stock(remera, local)).toBe(4)
    expect(await stock(jean, local)).toBe(2)
    const [op] = await sql`select tipo, nota, usuario_id from operaciones_stock where id = ${r.operacionId}`
    expect(op).toEqual({ tipo: 'ingreso', nota: 'Remito 123', usuario_id: admin })
  })

  it('una transferencia saca del origen y suma en el destino', async () => {
    await registrarOperacion(sql, { tipo: 'ingreso', destinoId: trastienda, usuarioId: admin, items: [{ productoId: remera, cantidad: 10 }] })
    await registrarOperacion(sql, { tipo: 'transferencia', origenId: trastienda, destinoId: otraSucursal, usuarioId: admin, items: [{ productoId: remera, cantidad: 4 }] })
    expect(await stock(remera, trastienda)).toBe(6)
    expect(await stock(remera, otraSucursal)).toBe(4)
    const movs = await sql`select deposito_id, cantidad from movimientos_stock where tipo = 'transferencia' order by cantidad`
    expect(movs).toEqual([
      { deposito_id: trastienda, cantidad: -4 },
      { deposito_id: otraSucursal, cantidad: 4 },
    ])
  })

  it('el recuento registra solo la diferencia contra el stock real', async () => {
    await registrarOperacion(sql, { tipo: 'ingreso', destinoId: local, usuarioId: admin, items: [{ productoId: remera, cantidad: 10 }, { productoId: jean, cantidad: 5 }] })
    const r = await registrarOperacion(sql, {
      tipo: 'ajuste',
      motivo: 'Recuento',
      destinoId: local,
      usuarioId: admin,
      items: [{ productoId: remera, contado: 7 }, { productoId: jean, contado: 5 }],
    })
    expect(r.movimientos).toBe(1) // el jean coincidía
    expect(await stock(remera, local)).toBe(7)
    const [m] = await sql`select cantidad, motivo from movimientos_stock where tipo = 'ajuste'`
    expect(m).toEqual({ cantidad: -3, motivo: 'Recuento' })
  })

  it('una baja por rotura descuenta', async () => {
    await registrarOperacion(sql, { tipo: 'ajuste', motivo: 'Rotura', destinoId: local, usuarioId: admin, items: [{ productoId: jean, cantidad: -2 }] })
    expect(await stock(jean, local)).toBe(-2)
  })

  it('rechaza cantidades inválidas y no deja nada a medias', async () => {
    await expect(registrarOperacion(sql, { tipo: 'ingreso', destinoId: local, usuarioId: admin, items: [{ productoId: remera, cantidad: 0 }] })).rejects.toBeInstanceOf(ErrorStock)
    await expect(registrarOperacion(sql, { tipo: 'ingreso', destinoId: local, usuarioId: admin, items: [{ productoId: remera, cantidad: -1 }] })).rejects.toBeInstanceOf(ErrorStock)
    await expect(registrarOperacion(sql, { tipo: 'transferencia', origenId: local, destinoId: local, usuarioId: admin, items: [{ productoId: remera, cantidad: 1 }] })).rejects.toBeInstanceOf(ErrorStock)
    await expect(
      registrarOperacion(sql, { tipo: 'ingreso', destinoId: local, usuarioId: admin, items: [{ productoId: remera, cantidad: 1 }, { productoId: 9999, cantidad: 1 }] }),
    ).rejects.toBeInstanceOf(ErrorStock)
    const [{ n }] = await sql`select count(*)::int as n from operaciones_stock`
    expect(n).toBe(0)
  })

  it('dos ingresos al mismo tiempo no pierden unidades', async () => {
    await Promise.all(
      Array.from({ length: 6 }, () => registrarOperacion(sql, { tipo: 'ingreso', destinoId: local, usuarioId: admin, items: [{ productoId: remera, cantidad: 1 }, { productoId: jean, cantidad: 1 }] })),
    )
    expect(await stock(remera, local)).toBe(6)
    expect(await stock(jean, local)).toBe(6)
  })

  it('guarda el historial de precios con quién lo cambió', async () => {
    await sql.begin(async (tx) => {
      await tx`select set_config('app.usuario_id', ${String(admin)}, true), set_config('app.origen', 'Prueba', true)`
      await tx`update productos set precio = 1200 where id = ${remera}`
    })
    await sql`update productos set nombre = 'Remera nueva' where id = ${remera}` // no cambia precio: no registra
    const cambios = await sql`select precio_anterior, precio_nuevo, origen, usuario_id from cambios_precio`
    expect(cambios).toEqual([{ precio_anterior: 1000, precio_nuevo: 1200, origen: 'Prueba', usuario_id: admin }])
  })

  it('genera códigos internos que no chocan con productos existentes', async () => {
    await sql`insert into productos (codigo, nombre) values (${codigoInterno(1)}, 'Ya usado')`
    expect(await nuevoCodigoInterno(sql)).toBe(codigoInterno(2))
  })
})
