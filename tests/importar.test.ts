import { describe, expect, it } from 'vitest'
import { detectarColumnas, detectarColumnasStock, encontrarEncabezado, leerPlanilla, sugerirDeposito } from '../src/lib/importar'
import { parseNumero } from '../src/lib/numeros'

describe('parseNumero', () => {
  it.each([
    [1234.5, 1234.5],
    ['1234,50', 1234.5],
    ['1.234,50', 1234.5],
    ['$ 1.234', 1234],
    ['1,234.50', 1234.5],
    ['12.5', 12.5],
    ['1.234.567', 1234567],
    ['-3', -3],
    ['(15,5)', -15.5],
    ['  42 ', 42],
    ['', null],
    ['abc', null],
    [null, null],
  ])('%s → %s', (entrada, esperado) => {
    expect(parseNumero(entrada)).toBe(esperado)
  })
})

describe('detectarColumnas', () => {
  it('reconoce una exportación típica de Dux', () => {
    const m = detectarColumnas(['Código', 'Cód. Barras', 'Descripción', 'Rubro', 'Sub Rubro', 'Costo', 'Precio Venta', 'Stock Actual'])
    expect(m).toEqual({ codigo_alt: 0, codigo: 1, nombre: 2, categoria: 3, costo: 5, precio: 6, stock: 7 })
  })

  it('no confunde el precio de costo con el de venta', () => {
    const m = detectarColumnas(['SKU', 'Producto', 'Precio Costo', 'Precio'])
    expect(m.costo).toBe(2)
    expect(m.precio).toBe(3)
    expect(m.codigo_alt).toBe(0)
  })

  it('encuentra la fila de títulos aunque haya un título arriba', () => {
    const filas = [['Listado de productos'], [], ['Código', 'Descripción', 'Precio'], ['A1', 'Remera', 100]]
    expect(encontrarEncabezado(filas)).toBe(2)
  })
})

describe('leerPlanilla', () => {
  const filas: unknown[][] = [
    ['Cód. Barras', 'Código', 'Descripción', 'Rubro', 'Precio Venta', 'Stock'],
    [7790001000011, 'R1', 'Remera  negra', 'Remeras', '14.900,00', 5],
    [null, 'R2', 'Remera blanca', 'Remeras', 14900, '3'],
    [null, null, null, null, null, null],
    ['7790001000011', 'R3', 'Duplicada', 'Remeras', 1, 1],
    ['779000', 'R4', '', 'Remeras', 1, 1],
    ['779001', 'R5', 'Precio raro', 'Remeras', 'consultar', 1],
  ]
  const r = leerPlanilla(filas, 0, detectarColumnas(filas[0]))

  it('lee las filas válidas y usa el código interno si falta el de barras', () => {
    expect(r.validas).toEqual([
      { fila: 2, codigo: '7790001000011', nombre: 'Remera negra', categoria: 'Remeras', costo: null, precio: 14900, stock: 5, talle: null, color: null, articulo: null },
      { fila: 3, codigo: 'R2', nombre: 'Remera blanca', categoria: 'Remeras', costo: null, precio: 14900, stock: 3, talle: null, color: null, articulo: null },
    ])
  })

  it('informa las filas con problemas e ignora las vacías', () => {
    expect(r.errores.map((e) => e.fila)).toEqual([5, 6, 7])
    expect(r.errores[0].motivo).toMatch(/repetido/)
  })
})

describe('stock por depósito de Dux', () => {
  const filas = [
    ['Consulta Stock Por Deposito'],
    [],
    ['Código Producto', 'Producto', 'Unidad Medida', 'DEPOT 815', 'DEPOSITO SAN LORENZO 960', 'DEPOSITO CAMPUS', 'MAYORISTA', 'TOTAL'],
    ['9DANTI16', 'VIDRIO TEMPLADO 9D ANTIESPIA INFINIX HOT 50', 'UNIDAD', 75, 0, 2, 0, 77],
    ['BRILLANTINA2', 'FUNDA TIKI BRILLANTINA XIAOMI NOTE 13 5G XS NEGRO', 'UNIDAD', 1, 0, 0, 0, 1],
    ['BRILLANTINA2', 'FUNDA TIKI BRILLANTINA XIAOMI NOTE 13 5G XS BLANCO', 'UNIDAD', 2, 1, 0, 0, 3],
    ['DUP', 'MISMO NOMBRE', 'UNIDAD', 1, 0, 0, 0, 1],
    ['DUP', 'MISMO NOMBRE', 'UNIDAD', 1, 0, 0, 0, 1],
  ]
  const enc = encontrarEncabezado(filas)
  const mapeo = detectarColumnas(filas[enc])
  const cols = detectarColumnasStock(filas[enc], mapeo)

  it('encuentra el encabezado, el código y una columna por depósito (sin TOTAL)', () => {
    expect(enc).toBe(2)
    expect(mapeo).toMatchObject({ codigo_alt: 0, nombre: 1 })
    expect(cols.map((c) => c.encabezado)).toEqual(['DEPOT 815', 'DEPOSITO SAN LORENZO 960', 'DEPOSITO CAMPUS', 'MAYORISTA'])
  })

  it('agrupa las variantes de color que comparten código y lee el stock de cada columna', () => {
    const { validas, errores } = leerPlanilla(filas, enc, mapeo, cols)
    const [vidrio, negro, blanco] = validas
    expect(vidrio).toMatchObject({ codigo: '9DANTI16', stocks: [75, 0, 2, 0], articulo: null })
    expect(vidrio.codigo_origen).toBeFalsy()
    expect(negro).toMatchObject({ codigo: 'BRILLANTINA2-NEGRO', codigo_origen: 'BRILLANTINA2', articulo: 'FUNDA TIKI BRILLANTINA XIAOMI NOTE 13 5G XS', color: 'NEGRO' })
    expect(blanco).toMatchObject({ codigo: 'BRILLANTINA2-BLANCO', stocks: [2, 1, 0, 0] })
    // Mismo código y mismo nombre: no se puede separar, va como repetido.
    expect(errores).toEqual([{ fila: 8, motivo: 'Código repetido (ya está en la fila 7)' }])
  })

  it('sugiere el depósito de cada columna', () => {
    const deps = [
      { id: 1, nombre: 'Depósito central · Depósito', central: true },
      { id: 2, nombre: 'Catamarca 815 · Local', clave: 'Catamarca 815' },
      { id: 3, nombre: 'San Lorenzo 960 · Local', clave: 'San Lorenzo 960' },
      { id: 4, nombre: 'Av. Libertad 5389 · Local', clave: 'Av. Libertad 5389 (Campus)' },
    ]
    expect(sugerirDeposito('DEPOT 815', deps)).toBe(1)
    expect(sugerirDeposito('DEPOSITO CATAMARCA 815', deps)).toBe(2)
    expect(sugerirDeposito('DEPOSITO SAN LORENZO 960', deps)).toBe(3)
    expect(sugerirDeposito('DEPOSITO CAMPUS', deps)).toBe(4)
    expect(sugerirDeposito('MAYORISTA', deps)).toBe(null)
  })
})
