import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { db } from './db'
import { COOKIE_SESION, leerSesion } from './sesion'
import { permisosDeRol, tienePermiso, type Base, type Permiso } from './permisos'

export type Usuario = {
  id: number
  usuario: string
  nombre: string
  /** Dónde trabaja: admin = todas las sucursales, vendedora = un local u online, deposito = el depósito. */
  rol: Base
  rol_id: number
  rol_nombre: string
  permisos: Permiso[]
  sucursal_id: number | null
  sucursal_nombre: string | null
  /** Tipo de punto donde trabaja (local, online o depósito). */
  sucursal_tipo: 'local' | 'online' | 'deposito' | null
}

/** Usuario logueado, verificado contra la base en cada pedido (así un cambio de permisos rige al instante). */
export const usuarioActual = cache(async (): Promise<Usuario | null> => {
  const sesion = await leerSesion((await cookies()).get(COOKIE_SESION)?.value)
  if (!sesion) return null
  const [u] = await db()<
    {
      id: number
      usuario: string
      nombre: string
      rol: Base
      rol_id: number
      rol_nombre: string
      rol_sistema: boolean
      rol_permisos: string[]
      sucursal_id: number | null
      sucursal_nombre: string | null
      sucursal_tipo: Usuario['sucursal_tipo']
      activo: boolean
      version_sesion: number
    }[]
  >`
    select u.id, u.usuario, u.nombre, r.base as rol, r.id as rol_id, r.nombre as rol_nombre, r.sistema as rol_sistema,
      r.permisos as rol_permisos, u.sucursal_id, s.nombre as sucursal_nombre, s.tipo as sucursal_tipo, u.activo, u.version_sesion
    from usuarios u
    join roles r on r.id = u.rol_id
    left join sucursales s on s.id = u.sucursal_id
    where u.id = ${sesion.uid}`
  if (!u || !u.activo || u.version_sesion !== sesion.v) return null
  return {
    id: u.id,
    usuario: u.usuario,
    nombre: u.nombre,
    rol: u.rol,
    rol_id: u.rol_id,
    rol_nombre: u.rol_nombre,
    permisos: permisosDeRol({ base: u.rol, sistema: u.rol_sistema, permisos: u.rol_permisos }),
    sucursal_id: u.sucursal_id,
    sucursal_nombre: u.sucursal_nombre,
    sucursal_tipo: u.sucursal_tipo,
  }
})

export async function requerirUsuario(): Promise<Usuario> {
  const u = await usuarioActual()
  if (!u) redirect('/login')
  return u
}

/** Corta si la persona no tiene el permiso (la manda al inicio). */
export async function requerirPermiso(p: Permiso): Promise<Usuario> {
  const u = await requerirUsuario()
  if (!tienePermiso(u, p)) redirect('/')
  return u
}

/** Corta si no tiene ninguno de esos permisos. */
export async function requerirAlguno(...ps: Permiso[]): Promise<Usuario> {
  const u = await requerirUsuario()
  if (!ps.some((p) => tienePermiso(u, p))) redirect('/')
  return u
}

export const puede = tienePermiso

/** Trabaja en todas las sucursales (ve los datos de todas). */
export const veTodas = (u: Pick<Usuario, 'rol'>) => u.rol === 'admin'

/** Puede vender y manejar caja. */
export const puedeVender = (u: Usuario) => tienePermiso(u, 'vender')

/** Para pantallas de venta. */
export const requerirVendedor = () => requerirPermiso('vender')
