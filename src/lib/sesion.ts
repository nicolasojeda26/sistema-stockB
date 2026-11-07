import { SignJWT, jwtVerify } from 'jose'
import { secreto } from './secretos'

export const COOKIE_SESION = 'sesion'
export const DURACION_SESION_SEG = 60 * 60 * 14 // un turno largo

export type DatosSesion = { uid: number; v: number }

async function clave(): Promise<Uint8Array> {
  return new TextEncoder().encode(await secreto('sesion'))
}

export async function firmarSesion(datos: DatosSesion): Promise<string> {
  return new SignJWT(datos)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${DURACION_SESION_SEG}s`)
    .sign(await clave())
}

export async function leerSesion(token: string | undefined): Promise<DatosSesion | null> {
  if (!token) return null
  const k = await clave()
  try {
    const { payload } = await jwtVerify(token, k, { algorithms: ['HS256'] })
    if (typeof payload.uid !== 'number' || typeof payload.v !== 'number') return null
    return { uid: payload.uid, v: payload.v }
  } catch {
    return null
  }
}
