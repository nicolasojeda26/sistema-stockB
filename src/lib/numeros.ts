/**
 * Lee un número escrito a la argentina o como venga de un Excel:
 * 1234.5 · "1234,50" · "1.234,50" · "$ 1.234" · "1,234.50" · "  12 ".
 * Devuelve null si no es un número.
 */
export function parseNumero(valor: unknown): number | null {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null
  if (valor === null || valor === undefined) return null
  let s = String(valor).trim().replace(/\$|ARS|\s/gi, '')
  if (!s) return null
  let negativo = false
  if (/^\(.*\)$/.test(s)) {
    negativo = true
    s = s.slice(1, -1)
  }
  if (s.startsWith('-')) {
    negativo = !negativo
    s = s.slice(1)
  }
  const ultimaComa = s.lastIndexOf(',')
  const ultimoPunto = s.lastIndexOf('.')
  if (ultimaComa >= 0 && ultimoPunto >= 0) {
    // El separador que aparece último es el decimal.
    s = ultimaComa > ultimoPunto ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if (ultimaComa >= 0) {
    // Solo comas: decimal si hay una sola con 1-2 dígitos detrás; si no, miles.
    const partes = s.split(',')
    s = partes.length === 2 && partes[1].length <= 2 ? partes.join('.') : partes.join('')
  } else if (ultimoPunto >= 0) {
    // Solo puntos: "1.234" o "1.234.567" son miles; "12.5" o "12.50" decimal.
    const partes = s.split('.')
    if (partes.length > 2 || (partes.length === 2 && partes[1].length === 3)) s = partes.join('')
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null
  const n = Number(s)
  return negativo ? -n : n
}

/** Redondea a centavos. */
export const centavos = (n: number) => Math.round(n * 100) / 100
