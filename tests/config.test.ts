import { describe, expect, it } from 'vitest'
import { urlBase } from '../src/lib/db'

describe('urlBase', () => {
  it('usa DATABASE_URL tal cual', () => {
    expect(urlBase({ DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/x' })).toBe('postgresql://u:p@127.0.0.1:5432/x')
  })
  it('toma POSTGRES_URL de la integración, limpia parámetros ajenos ', () => {
    const url = urlBase({ POSTGRES_URL: 'postgres://postgres.abc:clave@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=require&supa=base-pooler.x' })
    expect(url).toBe('postgres://postgres.abc:clave@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=require')
  })
  it('fuerza SSL en Supabase', () => {
    expect(urlBase({ DATABASE_URL: 'postgresql://postgres.abc:c@aws-0-sa-east-1.pooler.supabase.com:6543/postgres' })).toContain('sslmode=require')
  })
  it('sin ninguna, avisa', () => {
    expect(() => urlBase({})).toThrow('DATABASE_URL')
  })
})

const url = process.env.TEST_DATABASE_URL

describe.skipIf(!url)('secretos generados', () => {
  it('sin variables de entorno, genera una clave al azar, la guarda y la reutiliza', async () => {
    const { migrar } = await import('../scripts/migrate')
    const postgres = (await import('postgres')).default
    const sql = postgres(url!, { prepare: false, max: 1, onnotice: () => {} })
    await sql.unsafe('drop schema public cascade; create schema public;')
    await migrar(url!, () => {})
    const antes = { s: process.env.SESSION_SECRET, c: process.env.CLAVE_CIFRADO, d: process.env.DATABASE_URL }
    delete process.env.SESSION_SECRET
    delete process.env.CLAVE_CIFRADO
    process.env.DATABASE_URL = url
    try {
      const { secreto, olvidarSecretos } = await import('../src/lib/secretos')
      const a = await secreto('sesion')
      olvidarSecretos()
      expect(await secreto('sesion')).toBe(a)
      expect(a.length).toBeGreaterThanOrEqual(32)
      expect(await secreto('cifrado')).not.toBe(a)
      const { firmarSesion, leerSesion } = await import('../src/lib/sesion')
      expect(await leerSesion(await firmarSesion({ uid: 7, v: 1 }))).toEqual({ uid: 7, v: 1 })
      const { cifrar, descifrar } = await import('../src/lib/arca/certificado')
      expect(await descifrar(await cifrar('hola'))).toBe('hola')
      const [{ n }] = await sql`select count(*)::int as n from secretos`
      expect(n).toBe(2)
    } finally {
      Object.assign(process.env, { SESSION_SECRET: antes.s, CLAVE_CIFRADO: antes.c, DATABASE_URL: antes.d })
      for (const [k, v] of Object.entries({ SESSION_SECRET: antes.s, CLAVE_CIFRADO: antes.c, DATABASE_URL: antes.d })) if (v === undefined) delete process.env[k]
      const { db } = await import('../src/lib/db')
      await db().end()
      globalThis.__sql = undefined
      await sql.end()
    }
  })
})
