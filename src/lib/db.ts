import postgres, { type Sql } from 'postgres'

declare global {
  var __sql: Sql | undefined
}

/**
 * Dirección de la base: DATABASE_URL, o la que deja la integración de Supabase en Vercel
 * (POSTGRES_URL, pooler en modo transacción). De la URL se quitan los parámetros que no son
 * de Postgres (la integración agrega algunos propios, que el servidor rechazaría).
 */
export function urlBase(env: Record<string, string | undefined> = process.env): string {
  const cruda = env.DATABASE_URL || env.POSTGRES_URL
  if (!cruda) throw new Error('Falta DATABASE_URL (ver .env.example)')
  const u = new URL(cruda)
  for (const k of [...u.searchParams.keys()]) if (k !== 'sslmode') u.searchParams.delete(k)
  // Supabase siempre con SSL.
  if (u.hostname.endsWith('supabase.com') && !u.searchParams.has('sslmode')) u.searchParams.set('sslmode', 'require')
  // El pooler en modo transacción (6543) no soporta el pipelining del driver: algunas consultas
  // quedan colgadas. En modo sesión (5432, mismo host) cada conexión es propia y anda bien.
  if (u.hostname.endsWith('pooler.supabase.com') && u.port === '6543') u.port = '5432'
  return u.toString()
}

function crear(): Sql {
  return postgres(urlBase(), {
    // El pooler de Supabase en modo transacción no admite sentencias preparadas.
    prepare: false,
    max: 3,
    idle_timeout: 20,
    connect_timeout: 10,
    types: {
      // numeric -> number (los importes caben de sobra en un double).
      numeric: {
        to: 1700,
        from: [1700],
        serialize: (x: number) => String(x),
        parse: (x: string) => Number(x),
      },
    },
  })
}

/** Conexión compartida (se reutiliza entre recargas en desarrollo). */
export function db(): Sql {
  if (!globalThis.__sql) globalThis.__sql = crear()
  return globalThis.__sql
}
