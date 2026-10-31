import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { db } from './db'
import { COOKIE_SESION, leerSesion } from './sesion'

export type Usuario = {
  id: number
  usuario: string
  nombre: string
  rol: 'admin' | 'vendedora'
  sucursal_id: number | null
  sucursal_nombre: string | null
}

/** Usuario logueado, verificado contra la base en cada pedido. */
export const usuarioActual = cache(async (): Promise<Usuario | null> => {
  const sesion = await leerSesion((await cookies()).get(COOKIE_SESION)?.value)
  if (!sesion) return null
  const [u] = await db()<(Usuario & { activo: boolean; version_sesion: number })[]>`
    select u.id, u.usuario, u.nombre, u.rol, u.sucursal_id, s.nombre as sucursal_nombre, u.activo, u.version_sesion
    from usuarios u left join sucursales s on s.id = u.sucursal_id
    where u.id = ${sesion.uid}`
  if (!u || !u.activo || u.version_sesion !== sesion.v) return null
  return {
    id: u.id,
    usuario: u.usuario,
    nombre: u.nombre,
    rol: u.rol,
    sucursal_id: u.sucursal_id,
    sucursal_nombre: u.sucursal_nombre,
  }
})

export async function requerirUsuario(): Promise<Usuario> {
  const u = await usuarioActual()
  if (!u) redirect('/login')
  return u
}

export async function requerirAdmin(): Promise<Usuario> {
  const u = await requerirUsuario()
  if (u.rol !== 'admin') redirect('/')
  return u
}
