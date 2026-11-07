import { randomBytes } from 'node:crypto'
import { db } from './db'

type Nombre = 'sesion' | 'cifrado'

const ENV: Record<Nombre, string> = { sesion: 'SESSION_SECRET', cifrado: 'CLAVE_CIFRADO' }
const cache = new Map<Nombre, Promise<string>>()

/**
 * Clave interna del sistema. Si está configurada en el hosting (variable de entorno) se usa esa;
 * si no, se genera al azar la primera vez y queda guardada en la base (tabla secretos).
 */
export function secreto(nombre: Nombre): Promise<string> {
  const env = process.env[ENV[nombre]]
  if (env) {
    if (env.length < 32) return Promise.reject(new Error(`${ENV[nombre]} debe tener al menos 32 caracteres`))
    return Promise.resolve(env)
  }
  let p = cache.get(nombre)
  if (!p) {
    p = leerOGenerar(nombre)
    p.catch(() => cache.delete(nombre))
    cache.set(nombre, p)
  }
  return p
}

async function leerOGenerar(nombre: Nombre): Promise<string> {
  const sql = db()
  await sql`insert into secretos (nombre, valor) values (${nombre}, ${randomBytes(32).toString('base64url')})
            on conflict (nombre) do nothing`
  const [r] = await sql<{ valor: string }[]>`select valor from secretos where nombre = ${nombre}`
  return r.valor
}

/** Solo para tests. */
export function olvidarSecretos() {
  cache.clear()
}
