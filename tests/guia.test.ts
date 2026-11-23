import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CASOS, PREGUNTAS, SECCIONES, puedeVerGuia, seccionDeRuta } from '../src/lib/guia'

const raiz = join(__dirname, '../src/app/(app)')

/** Rutas de todas las pantallas del sistema, con los tramos [id] como `123`. */
function pantallas(dir = raiz, base = ''): string[] {
  const salida: string[] = []
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) salida.push(...pantallas(p, `${base}/${n.startsWith('[') ? '123' : n}`))
    else if (n === 'page.tsx') salida.push(base || '/')
  }
  return salida
}

describe('guía del sistema', () => {
  it('cada pantalla (menos la guía) tiene su ayuda', () => {
    const sinAyuda = pantallas().filter((r) => r !== '/guia' && !seccionDeRuta(r))
    expect(sinAyuda).toEqual([])
  })

  it('elige la ruta exacta antes que la de un número', () => {
    expect(seccionDeRuta('/reparaciones/nueva')?.id).toBe('recibir-equipo')
    expect(seccionDeRuta('/reparaciones/configuracion')?.id).toBe('config-taller')
    expect(seccionDeRuta('/reparaciones/45')?.id).toBe('ficha-reparacion')
    expect(seccionDeRuta('/reparaciones')?.id).toBe('reparaciones')
    expect(seccionDeRuta('/mercaderia/ajuste')?.id).toBe('ajustes-stock')
    expect(seccionDeRuta('/mercaderia/12')?.id).toBe('movimientos')
    expect(seccionDeRuta('/')?.id).toBe('inicio')
  })

  it('los ids son únicos y los «ver también» existen', () => {
    const ids = SECCIONES.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const s of SECCIONES) for (const v of s.ver ?? []) expect(ids, `${s.id} → ${v}`).toContain(v)
    const casos = CASOS.map((c) => c.id)
    expect(new Set(casos).size).toBe(casos.length)
    expect(PREGUNTAS.length).toBeGreaterThan(5)
  })

  it('filtra por permisos', () => {
    expect(puedeVerGuia(undefined, [])).toBe(true)
    expect(puedeVerGuia(['vender', 'envios'], ['envios'])).toBe(true)
    expect(puedeVerGuia(['personal'], ['vender'])).toBe(false)
  })
})
