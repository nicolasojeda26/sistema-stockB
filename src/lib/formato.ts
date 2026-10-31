const pesos = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 })
const entero = new Intl.NumberFormat('es-AR')

export const formatoPesos = (n: number) => pesos.format(n)
export const formatoEntero = (n: number) => entero.format(n)

const fecha = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Argentina/Buenos_Aires',
})
export const formatoFecha = (d: Date) => fecha.format(d)

/** Margen sobre el costo, en %. */
export function margen(costo: number, precio: number): number | null {
  if (!costo) return null
  return Math.round(((precio - costo) / costo) * 1000) / 10
}
