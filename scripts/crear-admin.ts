// Crea (o resetea) una usuaria administradora.
// Uso: npm run crear-admin -- <usuario> "<Nombre>" <contraseña>
import postgres from 'postgres'
import { hashPassword, PASSWORD_MIN } from '../src/lib/password'

const [usuario, nombre, password] = process.argv.slice(2)
const url = process.env.DATABASE_URL
if (!url) {
  console.error('Falta DATABASE_URL')
  process.exit(1)
}
if (!usuario || !nombre || !password) {
  console.error('Uso: npm run crear-admin -- <usuario> "<Nombre>" <contraseña>')
  process.exit(1)
}
if (password.length < PASSWORD_MIN) {
  console.error(`La contraseña tiene que tener al menos ${PASSWORD_MIN} caracteres`)
  process.exit(1)
}

const sql = postgres(url, { prepare: false, max: 1 })
const hash = await hashPassword(password)
await sql`
  insert into usuarios (usuario, nombre, password_hash, rol)
  values (${usuario.toLowerCase()}, ${nombre}, ${hash}, 'admin')
  on conflict (usuario) do update set
    nombre = excluded.nombre, password_hash = excluded.password_hash, rol = 'admin',
    activo = true, version_sesion = usuarios.version_sesion + 1`
await sql`delete from intentos_login where usuario = ${usuario.toLowerCase()}`
await sql.end()
console.log(`Listo: ${usuario.toLowerCase()} es administradora.`)
