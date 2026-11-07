// Pruebas contra un Postgres real. Se saltean si no hay TEST_DATABASE_URL.
// Ej.: TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/belen_test npm test
import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { migrar } from '../scripts/migrate'
import { importarFilas } from '../src/lib/importar-db'
import { hashPassword, verificarPassword } from '../src/lib/password'

const url = process.env.TEST_DATABASE_URL

describe('contraseñas', () => {
  it('verifica la correcta y rechaza la incorrecta', async () => {
    const h = await hashPassword('secreta1')
    expect(await verificarPassword('secreta1', h)).toBe(true)
    expect(await verificarPassword('otra', h)).toBe(false)
    expect(await verificarPassword('secreta1', 'basura')).toBe(false)
  })
})

describe.skipIf(!url)('base de datos', () => {
  const sql = postgres(url!, { prepare: false, max: 2, onnotice: () => {}, types: { numeric: { to: 1700, from: [1700], serialize: String, parse: Number } } })
  let dep: number
  let admin: number

  beforeAll(async () => {
    await sql.unsafe('drop schema public cascade; create schema public;')
    await migrar(url!, () => {})
  })
  afterAll(() => sql.end())
  beforeEach(async () => {
    await sql`truncate movimientos_stock, stock, productos, articulos, categorias, usuarios, depositos, sucursales restart identity cascade`
    const [s] = await sql`insert into sucursales (nombre) values ('Centro') returning id`
    ;[{ id: dep }] = await sql`insert into depositos (nombre, sucursal_id, es_principal) values ('Local', ${s.id}, true) returning id`
    ;[{ id: admin }] = await sql`insert into usuarios (usuario, nombre, password_hash, rol) values ('belen', 'Belen', 'x', 'admin') returning id`
  })

  const fila = (
    codigo: string,
    extra: Partial<{ nombre: string; categoria: string | null; costo: number | null; precio: number | null; stock: number | null; talle: string | null; color: string | null; articulo: string | null }> = {},
  ) => ({
    fila: 1,
    codigo,
    nombre: `Producto ${codigo}`,
    categoria: 'Remeras',
    costo: 100,
    precio: 200,
    stock: 5,
    talle: null,
    color: null,
    articulo: null,
    ...extra,
  })

  it('crea productos, categorías y stock con su movimiento', async () => {
    const r = await importarFilas(sql, { filas: [fila('A'), fila('B', { categoria: 'remeras' }), fila('C', { categoria: null, stock: null })], depositoId: dep, actualizarExistentes: true, usuarioId: admin })
    expect(r).toEqual({ creados: 3, actualizados: 0, omitidos: 0, stock: 2, categorias: 1, articulos: 0 })
    const st = await sql`select p.codigo, s.cantidad from stock s join productos p on p.id = s.producto_id order by p.codigo`
    expect(st.map((x) => [x.codigo, x.cantidad])).toEqual([
      ['A', 5],
      ['B', 5],
    ])
    const [{ n }] = await sql`select count(*)::int as n from movimientos_stock where tipo = 'carga_inicial' and usuario_id = ${admin}`
    expect(n).toBe(2)
  })

  it('al reimportar actualiza precios y registra solo la diferencia de stock', async () => {
    await importarFilas(sql, { filas: [fila('A')], depositoId: dep, actualizarExistentes: true, usuarioId: admin })
    const r = await importarFilas(sql, { filas: [fila('a', { precio: 250, costo: null, stock: 8 })], depositoId: dep, actualizarExistentes: true, usuarioId: admin })
    expect(r).toMatchObject({ creados: 0, actualizados: 1, stock: 1 })
    const [p] = await sql`select precio, costo from productos where codigo = 'A'`
    expect(p).toEqual({ precio: 250, costo: 100 }) // costo vacío no pisa el anterior
    const movs = await sql`select cantidad from movimientos_stock order by id`
    expect(movs.map((m) => m.cantidad)).toEqual([5, 3])
  })

  it('sin "actualizar existentes" no toca los productos que ya estaban', async () => {
    await importarFilas(sql, { filas: [fila('A')], depositoId: dep, actualizarExistentes: true, usuarioId: admin })
    const r = await importarFilas(sql, { filas: [fila('A', { precio: 999, stock: 50 }), fila('Z')], depositoId: dep, actualizarExistentes: false, usuarioId: admin })
    expect(r).toMatchObject({ creados: 1, actualizados: 0, omitidos: 1 })
    const [a] = await sql`select p.precio, s.cantidad from productos p join stock s on s.producto_id = p.id where p.codigo = 'A'`
    expect(a).toEqual({ precio: 200, cantidad: 5 })
  })

  it('agrupa talles y colores en un artículo y lo reutiliza al reimportar', async () => {
    const v = (codigo: string, color: string, talle: string, stock = 1) =>
      fila(codigo, { nombre: `Remera lisa ${color} ${talle}`, articulo: 'Remera lisa', color, talle, stock })
    const r = await importarFilas(sql, { filas: [v('R1', 'Negro', 'M'), v('R2', 'Negro', 'L'), v('R3', 'Blanco', 'M'), fila('X', { nombre: 'Cinturón' })], depositoId: dep, actualizarExistentes: true, usuarioId: admin })
    expect(r.articulos).toBe(1)
    const vs = await sql`select p.codigo, p.talle, p.color, p.orden_talle, a.nombre from productos p join articulos a on a.id = p.articulo_id order by p.codigo`
    expect(vs.map((x) => `${x.nombre}|${x.color}|${x.talle}`)).toEqual(['Remera lisa|Negro|M', 'Remera lisa|Negro|L', 'Remera lisa|Blanco|M'])
    expect(vs[0].orden_talle).toBeLessThan(vs[1].orden_talle)
    expect((await sql`select articulo_id from productos where codigo = 'X'`)[0].articulo_id).toBeNull()
    const r2 = await importarFilas(sql, { filas: [v('R4', 'Blanco', 'L')], depositoId: dep, actualizarExistentes: true, usuarioId: admin })
    expect(r2.articulos).toBe(0)
    expect((await sql`select count(distinct articulo_id)::int n from productos where articulo_id is not null`)[0].n).toBe(1)
  })

  it('no permite dos productos con el mismo código (sin importar mayúsculas)', async () => {
    await sql`insert into productos (codigo, nombre) values ('ABC', 'Uno')`
    await expect(sql`insert into productos (codigo, nombre) values ('abc', 'Dos')`).rejects.toMatchObject({ code: '23505' })
  })

  it('una sucursal tiene un solo depósito principal y las vendedoras necesitan sucursal', async () => {
    const [{ sucursal_id }] = await sql`select sucursal_id from depositos where id = ${dep}`
    await expect(sql`insert into depositos (nombre, sucursal_id, es_principal) values ('Otro', ${sucursal_id}, true)`).rejects.toMatchObject({ code: '23505' })
    await expect(sql`insert into usuarios (usuario, nombre, password_hash, rol) values ('sofia', 'Sofía', 'x', 'vendedora')`).rejects.toMatchObject({ code: '23514' })
  })
})

describe.skipIf(!url)('bloqueo de ingreso', () => {
  const sql = postgres(url!, { prepare: false, max: 1, onnotice: () => {} })
  afterAll(() => sql.end())
  it('bloquea tras 5 intentos fallidos y deja entrar tras limpiar', async () => {
    const { verificarIngreso } = await import('../src/lib/ingreso')
    await sql`truncate intentos_login`
    await sql`insert into usuarios (usuario, nombre, password_hash, rol) values ('lucia', 'Lucía', ${await hashPassword('buena123')}, 'admin') on conflict do nothing`
    for (let i = 0; i < 5; i++) expect(await verificarIngreso(sql, 'lucia', 'mala')).toEqual({ ok: false, motivo: 'incorrecto' })
    expect(await verificarIngreso(sql, 'lucia', 'buena123')).toMatchObject({ ok: false, motivo: 'bloqueado', minutos: 15 })
    await sql`delete from intentos_login where usuario = 'lucia'`
    expect(await verificarIngreso(sql, 'lucia', 'buena123')).toMatchObject({ ok: true })
  })
})
