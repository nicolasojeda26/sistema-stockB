const pesos = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 })
const pesosRedondo = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
const entero = new Intl.NumberFormat('es-AR')

/** Importe para pantalla: sin ",00" cuando es redondo ($ 14.900), con centavos si los tiene ($ 13.410,50). */
export const formatoPesos = (n: number) => (Number.isInteger(Math.round(n * 100) / 100) ? pesosRedondo : pesos).format(n)
/** Importe siempre con centavos: tickets y comprobantes fiscales. */
export const formatoPesosExacto = (n: number) => pesos.format(n)
export const formatoEntero = (n: number) => entero.format(n)

const fecha = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'America/Argentina/Buenos_Aires',
})
export const formatoFecha = (d: Date) => fecha.format(d)

/** Margen sobre el costo, en %. */
export function margen(costo: number, precio: number): number | null {
  if (!costo) return null
  return Math.round(((precio - costo) / costo) * 1000) / 10
}

const dia = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })
/** Columnas `date` (la base las devuelve a las 0 h UTC): sin hora ni corrimiento de zona. */
export const formatoDia = (d: Date | string) => dia.format(typeof d === 'string' ? new Date(d + 'T00:00:00Z') : d)
/** Hoy en Argentina, como "2026-11-07". */
export const hoyAR = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date())
