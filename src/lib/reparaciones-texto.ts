/** Textos y ayudas del área técnica que se usan también en el navegador. */

export const ESTADOS_REPARACION = {
  ingresado: { texto: 'Ingresado', tono: 'neutro' },
  en_reparacion: { texto: 'En reparación', tono: 'alerta' },
  listo: { texto: 'Listo para retirar', tono: 'ok' },
  sin_reparacion: { texto: 'Sin reparación', tono: 'error' },
  entregado: { texto: 'Entregado', tono: 'apagado' },
  cancelado: { texto: 'Cancelado', tono: 'apagado' },
} as const
export type EstadoReparacion = keyof typeof ESTADOS_REPARACION

/** Estados en los que el equipo sigue en el local. */
export const EN_LOCAL: EstadoReparacion[] = ['ingresado', 'en_reparacion', 'listo', 'sin_reparacion']

export const numeroReparacion = (id: number) => `R-${String(id).padStart(5, '0')}`

/** Por qué no se reparó (para el reporte y el comprobante de entrega). */
export const MOTIVOS_CIERRE = {
  sin_solucion: 'Sin solución (no se pudo reparar)',
  no_acepto: 'No aceptó el presupuesto',
  sin_repuesto: 'No se consiguió el repuesto',
  devolucion: 'Devolución (lo retira sin reparar)',
} as const
export type MotivoCierre = keyof typeof MOTIVOS_CIERRE

export type FaseEtapa = 'ingresado' | 'en_reparacion' | 'listo'
export const FASES_ETAPA: Record<FaseEtapa, string> = {
  ingresado: 'En el local, sin empezar',
  en_reparacion: 'En reparación o esperando',
  listo: 'Listo para retirar',
}

/** Texto de la línea de la venta. */
export const lineaReparacion = (r: { id: number; equipo: string; falla: string }) =>
  `Reparación ${numeroReparacion(r.id)} · ${r.equipo} · ${r.falla.replace(/\s+/g, ' ').slice(0, 60)}`

/** Link de WhatsApp para avisar al cliente (Argentina: 54 9 + característica + número). */
export function linkWhatsApp(telefono: string | null, texto: string): string | null {
  if (!telefono) return null
  // Lo que viene después de una letra o barra ("int 2", "/ otro número") no es parte del número.
  let n = telefono.split(/[a-zA-Z/]/)[0].replace(/\D/g, '')
  if (n.length < 8) return null
  if (n.startsWith('54')) n = n.slice(2)
  if (n.startsWith('0')) n = n.slice(1)
  n = n.replace(/^(\d{2,4})15(\d{6,8})$/, '$1$2')
  if (!n.startsWith('9')) n = '9' + n
  return `https://wa.me/54${n}?text=${encodeURIComponent(texto)}`
}
