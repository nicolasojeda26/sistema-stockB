import type { Sql } from 'postgres'
import { verificarPassword } from './password'

export const MAX_INTENTOS = 5
export const MINUTOS_BLOQUEO = 15

export type ResultadoIngreso =
  | { ok: true; id: number; versionSesion: number }
  | { ok: false; motivo: 'incorrecto' | 'bloqueado'; minutos?: number }

/**
 * Verifica usuario y contraseña. Tras 5 intentos fallidos seguidos en 15 minutos,
 * ese usuario queda bloqueado 15 minutos (aunque después ponga la contraseña bien).
 */
export async function verificarIngreso(sql: Sql, usuario: string, password: string): Promise<ResultadoIngreso> {
  const [b] = await sql<{ n: number; ultimo: Date | null }[]>`
    select count(*)::int as n, max(creado) as ultimo from intentos_login
    where usuario = ${usuario} and creado > now() - make_interval(mins => ${MINUTOS_BLOQUEO})`
  if (b.n >= MAX_INTENTOS && b.ultimo) {
    const minutos = Math.max(1, Math.ceil((b.ultimo.getTime() + MINUTOS_BLOQUEO * 60_000 - Date.now()) / 60_000))
    return { ok: false, motivo: 'bloqueado', minutos }
  }
  const [u] = await sql<{ id: number; password_hash: string | null; activo: boolean; version_sesion: number }[]>`
    select id, password_hash, activo, version_sesion from usuarios where usuario = ${usuario}`
  // Sin contraseña todavía (usuario nuevo con código de acceso): no entra hasta crearla.
  const bien = u?.password_hash ? await verificarPassword(password, u.password_hash) : false
  if (!u || !bien || !u.activo) {
    await sql`insert into intentos_login (usuario) values (${usuario})`
    await sql`delete from intentos_login where creado < now() - interval '1 day'`
    return { ok: false, motivo: 'incorrecto' }
  }
  await sql`delete from intentos_login where usuario = ${usuario}`
  return { ok: true, id: u.id, versionSesion: u.version_sesion }
}
