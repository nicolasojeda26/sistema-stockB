import { describe, expect, it } from 'vitest'
import { nombreVariante, ordenTalle, parsearCurvas, separarLista } from '../src/lib/articulos'

describe('artículos con talles y colores', () => {
  it('lee las curvas de talles de Ajustes', () => {
    expect(parsearCurvas('Letras: S, M, L\n\nJean: 36,38\nÚnico: Único')).toEqual([
      { nombre: 'Letras', talles: ['S', 'M', 'L'] },
      { nombre: 'Jean', talles: ['36', '38'] },
      { nombre: 'Único', talles: ['Único'] },
    ])
  })
  it('separa listas sin vacíos ni repetidos', () => {
    expect(separarLista('Negro, blanco,, NEGRO ; Verde  militar')).toEqual(['Negro', 'blanco', 'Verde militar'])
  })
  it('arma el nombre de la variante', () => {
    expect(nombreVariante('Jean wide leg', 'Negro', '40')).toBe('Jean wide leg Negro 40')
    expect(nombreVariante('Gorra', null, 'Único')).toBe('Gorra Único')
  })
  it('ordena talles de letras y números', () => {
    const t = ['XL', 'S', '42', 'M', '38', 'XS']
    expect([...t].sort((a, b) => ordenTalle(a) - ordenTalle(b))).toEqual(['38', '42', 'XS', 'S', 'M', 'XL'])
    expect(ordenTalle('M', ['S', 'M', 'L'])).toBe(2)
  })
})
