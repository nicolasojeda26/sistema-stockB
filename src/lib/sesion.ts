import { SignJWT, jwtVerify } from 'jose'

export const COOKIE_SESION = 'sesion'
export const DURACION_SESION_SEG = 60 * 60 * 14 // un turno largo

export type DatosSesion = { uid: number; v: number }

function clave(): Uint8Array {
  const secreto = process.env.SESSION_SECRET
  if (!secreto || secreto.length < 32) throw new Error('SESSION_SECRET debe tener al menos 32 caracteres')
  return new TextEncoder().encode(secreto)
}

export async function firmarSesion(datos: DatosSesion): Promise<string> {
  return new SignJWT(datos)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${DURACION_SESION_SEG}s`)
    .sign(clave())
}

export async function leerSesion(token: string | undefined): Promise<DatosSesion | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, clave(), { algorithms: ['HS256'] })
    if (typeof payload.uid !== 'number' || typeof payload.v !== 'number') return null
    return { uid: payload.uid, v: payload.v }
  } catch {
    return null
  }
}
