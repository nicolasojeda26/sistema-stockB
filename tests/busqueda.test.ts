import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { migrar } from '../scripts/migrate'
import { coincide, normalizar, ordenRelevancia, palabras } from '../src/lib/busqueda'

describe('normalizar', () => {
  it('saca acentos y pasa a minúsculas', () => {
    expect(normalizar('PAÑUELO Algodón')).toBe('panuelo algodon')
    expect(palabras('  remera   NEGRA ')).toEqual(['remera', 'negra'])
  })
})

const url = process.env.TEST_DATABASE_URL

describe.skipIf(!url)('búsqueda en la base', () => {
  const sql = postgres(url!, { prepare: false, max: 1, onnotice: () => {} })
  beforeAll(async () => {
    await sql.unsafe('drop schema public cascade; create schema public;')
    await migrar(url!, () => {})
    await sql`insert into productos (codigo, nombre) values
      ('779001', 'Remera lisa algodón negra M'), ('779002', 'Remera lisa blanca S'),
      ('779003', 'Pañuelo seda estampado'), ('A_100%', 'Jean negro')`
  })
  afterAll(() => sql.end())
  const buscar = async (t: string) =>
    (await sql<{ nombre: string }[]>`select p.nombre from productos p where ${coincide(sql, t)} order by ${ordenRelevancia(sql, t)}`).map((r) => r.nombre)

  it('encuentra con varias palabras en cualquier orden', async () => {
    expect(await buscar('remera negra')).toEqual(['Remera lisa algodón negra M'])
    expect(await buscar('NEGRA remera')).toEqual(['Remera lisa algodón negra M'])
    expect(await buscar('negr')).toEqual(['Jean negro', 'Remera lisa algodón negra M'])
  })
  it('no le importan los acentos ni la eñe', async () => {
    expect(await buscar('panuelo')).toEqual(['Pañuelo seda estampado'])
    expect(await buscar('algodon')).toEqual(['Remera lisa algodón negra M'])
  })
  it('busca también por código y trata % y _ como texto', async () => {
    expect(await buscar('779002')).toEqual(['Remera lisa blanca S'])
    expect(await buscar('_100%')).toEqual(['Jean negro'])
    expect(await buscar('0%')).toEqual(['Jean negro'])
    expect(await buscar('1%')).toEqual([])
  })
  it('ordena primero lo que empieza con la búsqueda', async () => {
    expect(await buscar('se')).toEqual(['Pañuelo seda estampado'])
    expect(await buscar('r')).toEqual(['Remera lisa algodón negra M', 'Remera lisa blanca S', 'Jean negro'])
  })
})
