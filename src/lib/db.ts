import postgres, { type Sql } from 'postgres'

declare global {
  var __sql: Sql | undefined
}

function crear(): Sql {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('Falta DATABASE_URL (ver .env.example)')
  return postgres(url, {
    // El pooler de Supabase en modo transacción no admite sentencias preparadas.
    prepare: false,
    max: process.env.NODE_ENV === 'production' ? 5 : 3,
    idle_timeout: 20,
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
