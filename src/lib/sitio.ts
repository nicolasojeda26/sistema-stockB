import 'server-only'
import { headers } from 'next/headers'

/** Dirección pública del sistema (para armar enlaces que se mandan por WhatsApp). */
export async function origenSitio(): Promise<string> {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https')
  return `${proto}://${host}`
}
