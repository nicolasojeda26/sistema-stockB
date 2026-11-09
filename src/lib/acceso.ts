import { createHash, randomInt } from 'node:crypto'
import type { Sql } from 'postgres'
import { MAX_INTENTOS, MINUTOS_BLOQUEO } from './ingreso'
import { hashPassword, PASSWORD_MIN } from './password'

/**
 * Código de acceso: la administradora lo genera y se lo pasa a la persona,
 * que con él crea su propia contraseña. Así nadie tiene que mandar contraseñas por WhatsApp.
 */
const LETRAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // sin 0/O ni 1/I
export const DIAS_CODIGO = 7

export const hashCodigo = (codigo: string) => createHash('sha256').update(normalizarCodigo(codigo)).digest('hex')
export const normalizarCodigo = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, '')

export function nuevoCodigo(): string {
  const c = Array.from({ length: 8 }, () => LETRAS[randomInt(LETRAS.length)]).join('')
  return `${c.slice(0, 4)}-${c.slice(4)}`
}

/** Genera un código nuevo. Si `reiniciar`, borra la contraseña actual y cierra sus sesiones. */
export async function generarCodigoAcceso(sql: Sql, usuarioId: number, reiniciar: boolean): Promise<string> {
  const codigo = nuevoCodigo()
  await sql`
    update usuarios set codigo_acceso = ${hashCodigo(codigo)}, codigo_vence = now() + make_interval(days => ${DIAS_CODIGO}),
      password_hash = case when ${reiniciar} then null else password_hash end,
      version_sesion = case when ${reiniciar} then version_sesion + 1 else version_sesion end
    where id = ${usuarioId}`
  return codigo
}

export type ResultadoActivacion =
  | { ok: true; id: number; versionSesion: number }
  | { ok: false; error: string }

/** La persona crea su contraseña con el código. Usa el mismo bloqueo por intentos que el login. */
export async function activarCuenta(sql: Sql, usuario: string, codigo: string, password: string): Promise<ResultadoActivacion> {
  if (password.length < PASSWORD_MIN) return { ok: false, error: `La contraseña tiene que tener al menos ${PASSWORD_MIN} caracteres.` }
  const [b] = await sql<{ n: number }[]>`
    select count(*)::int as n from intentos_login where usuario = ${usuario} and creado > now() - make_interval(mins => ${MINUTOS_BLOQUEO})`
  if (b.n >= MAX_INTENTOS) return { ok: false, error: `Demasiados intentos. Esperá ${MINUTOS_BLOQUEO} minutos o pedí un código nuevo.` }
  const [u] = await sql<{ id: number; version_sesion: number }[]>`
    select id, version_sesion from usuarios
    where usuario = ${usuario} and activo and codigo_acceso = ${hashCodigo(codigo)} and codigo_vence > now()`
  if (!u) {
    await sql`insert into intentos_login (usuario) values (${usuario})`
    return { ok: false, error: 'El usuario o el código no son correctos, o el código ya venció. Pedile uno nuevo a la administradora.' }
  }
  const [r] = await sql<{ version_sesion: number }[]>`
    update usuarios set password_hash = ${await hashPassword(password)}, codigo_acceso = null, codigo_vence = null,
      version_sesion = version_sesion + 1
    where id = ${u.id} returning version_sesion`
  await sql`delete from intentos_login where usuario = ${usuario}`
  return { ok: true, id: u.id, versionSesion: r.version_sesion }
}
