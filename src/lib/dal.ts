import 'server-only'
import { cache } from 'react'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { db } from './db'
import { COOKIE_SESION, leerSesion } from './sesion'
import { permisosDePersona, soloTaller, tienePermiso, type Base, type Permiso } from './permisos'

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
  /** Tope de descuento en productos (el de su rol, o el suyo si tiene uno propio). */
  descuento_max: number
  /** Tope de descuento al cobrar reparaciones (el de su rol). */
  descuento_max_reparacion: number
  /** Si es uno de los técnicos de la lista: al informar un estado queda como técnico. */
  tecnico_id: number | null
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
      permisos_extra: string[]
      permisos_quitados: string[]
      descuento_max: number
      descuento_max_reparacion: number
      tecnico_id: number | null
    }[]
  >`
    select u.id, u.usuario, u.nombre, r.base as rol, r.id as rol_id, r.nombre as rol_nombre, r.sistema as rol_sistema,
      r.permisos as rol_permisos, u.sucursal_id, s.nombre as sucursal_nombre, s.tipo as sucursal_tipo, u.activo, u.version_sesion,
      u.permisos_extra, u.permisos_quitados, coalesce(u.descuento_max, r.descuento_max)::float as descuento_max,
      r.descuento_max_reparacion::float as descuento_max_reparacion, u.tecnico_id
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
    permisos: permisosDePersona({ base: u.rol, sistema: u.rol_sistema, permisos: u.rol_permisos }, u.permisos_extra, u.permisos_quitados),
    descuento_max: u.descuento_max,
    descuento_max_reparacion: u.descuento_max_reparacion,
    sucursal_id: u.sucursal_id,
    sucursal_nombre: u.sucursal_nombre,
    sucursal_tipo: u.sucursal_tipo,
    tecnico_id: u.tecnico_id,
  }
})

/** Lo que puede abrir un técnico (perfil «Área técnica»); el resto lo manda a su pantalla. */
const RUTAS_TALLER = [/^\/taller$/, /^\/reparaciones\/(\d+|reporte|configuracion)$/, /^\/guia$/, /^\/solicitudes(\/.*)?$/]

/**
 * `guardia`: a un técnico lo devuelve al área técnica si abre otra pantalla. El layout la apaga
 * (un redirect desde el layout deja la página en blanco al navegar): la hace cada página.
 */
export async function requerirUsuario(guardia = true): Promise<Usuario> {
  const u = await usuarioActual()
  // La cookie puede seguir firmada aunque la sesión ya no valga (persona desactivada,
  // movida de sucursal o con otra contraseña): el login la borra, si no quedaría en un bucle.
  if (!u) redirect('/login?salir=1')
  // Un técnico solo ve el área técnica. `x-ruta` la pone el proxy en cada pedido (no la manda el navegador).
  if (guardia && soloTaller(u)) {
    const ruta = (await headers()).get('x-ruta')
    if (ruta && !RUTAS_TALLER.some((r) => r.test(ruta))) redirect('/taller')
  }
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
