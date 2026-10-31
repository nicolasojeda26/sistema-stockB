import { describe, expect, it } from 'vitest'
import { detectarColumnas, encontrarEncabezado, leerPlanilla } from '../src/lib/importar'
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
      { fila: 2, codigo: '7790001000011', nombre: 'Remera negra', categoria: 'Remeras', costo: null, precio: 14900, stock: 5 },
      { fila: 3, codigo: 'R2', nombre: 'Remera blanca', categoria: 'Remeras', costo: null, precio: 14900, stock: 3 },
    ])
  })

  it('informa las filas con problemas e ignora las vacías', () => {
    expect(r.errores.map((e) => e.fila)).toEqual([5, 6, 7])
    expect(r.errores[0].motivo).toMatch(/repetido/)
  })
})
