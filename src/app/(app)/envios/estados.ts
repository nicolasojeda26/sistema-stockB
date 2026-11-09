export const ESTADOS_ENVIO = {
  en_camino: { texto: 'En camino', tono: 'alerta' },
  recibido: { texto: 'Recibido', tono: 'ok' },
  con_diferencias: { texto: 'Llegó distinto', tono: 'error' },
  cancelado: { texto: 'Cancelado', tono: 'apagado' },
} as const
export type EstadoEnvio = keyof typeof ESTADOS_ENVIO
