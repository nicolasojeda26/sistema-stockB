import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>

/** Devuelve "scrypt$<sal>$<hash>" en base64. */
export async function hashPassword(password: string): Promise<string> {
  const sal = randomBytes(16)
  const hash = await scrypt(password, sal, 64)
  return `scrypt$${sal.toString('base64')}$${hash.toString('base64')}`
}

export async function verificarPassword(password: string, guardado: string): Promise<boolean> {
  const [algo, salB64, hashB64] = guardado.split('$')
  if (algo !== 'scrypt' || !salB64 || !hashB64) return false
  const esperado = Buffer.from(hashB64, 'base64')
  const hash = await scrypt(password, Buffer.from(salB64, 'base64'), esperado.length)
  return hash.length === esperado.length && timingSafeEqual(hash, esperado)
}

export const PASSWORD_MIN = 6
