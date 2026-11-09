'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requerirAdmin } from '@/lib/dal'
import { entero, marcado, mensajeError, texto } from '@/lib/errores'
import { PASSWORD_MIN, hashPassword } from '@/lib/password'
import { DIAS_CODIGO, generarCodigoAcceso } from '@/lib/acceso'
import type { Resultado } from '@/components/form-accion'

const RE_USUARIO = /^[a-z0-9._-]{3,30}$/

function leerDescuento(f: FormData, rol: string | null): number | null {
  if (rol === 'admin') return 100
  const v = Number(String(f.get('descuento_max') ?? '10').replace(',', '.'))
  return Number.isFinite(v) && v >= 0 && v <= 100 ? Math.round(v * 100) / 100 : null
}

function leerRol(f: FormData) {
  const rol = texto(f, 'rol')
  return rol === 'admin' || rol === 'vendedora' || rol === 'deposito' ? rol : null
}

/** El vendedor trabaja en un local u online; el encargado de depósito, en el depósito. */
async function validarLugar(rol: string, sucursalId: number | null): Promise<string | null> {
  if (rol === 'admin') return null
  if (!sucursalId) return rol === 'deposito' ? 'Elegí el depósito.' : 'Elegí en qué sucursal trabaja.'
  const [s] = await db()<{ tipo: string }[]>`select tipo from sucursales where id = ${sucursalId}`
  if (!s) return 'La sucursal no existe.'
  if (rol === 'deposito' && s.tipo !== 'deposito') return 'El encargado de depósito va en el depósito.'
  if (rol === 'vendedora' && s.tipo === 'deposito') return 'En el depósito no se vende: elegí un local o Ventas online.'
  return null
}

const mensajeCodigo = (usuario: string, codigo: string) =>
  `Usuario "${usuario}" listo. Código de acceso: ${codigo} (vence en ${DIAS_CODIGO} días). Pasáselo: entra en "Entrá con tu código de acceso" y crea su propia contraseña.`

export async function crearUsuario(_: Resultado, f: FormData): Promise<Resultado> {
  await requerirAdmin()
  const usuario = texto(f, 'usuario').toLowerCase()
  const nombre = texto(f, 'nombre')
  const rol = leerRol(f)
  const sucursalId = entero(f, 'sucursal_id')
  const password = String(f.get('password') ?? '')
  const descuentoMax = leerDescuento(f, rol)

  if (descuentoMax === null) return { error: 'El descuento máximo va de 0 a 100 %.' }
  if (!RE_USUARIO.test(usuario)) return { error: 'El usuario va en minúsculas, sin espacios, de 3 a 30 letras o números (ej.: sofia).' }
  if (!nombre) return { error: 'Poné el nombre.' }
  if (!rol) return { error: 'Elegí el rol.' }
  const lugar = await validarLugar(rol, sucursalId)
  if (lugar) return { error: lugar }
  if (password && password.length < PASSWORD_MIN) return { error: `La contraseña tiene que tener al menos ${PASSWORD_MIN} caracteres.` }

  let id: number
  try {
    ;[{ id }] = await db()<{ id: number }[]>`
      insert into usuarios (usuario, nombre, password_hash, rol, sucursal_id, descuento_max)
      values (${usuario}, ${nombre}, ${password ? await hashPassword(password) : null}, ${rol}, ${sucursalId}, ${descuentoMax})
      returning id`
  } catch (e) {
    return { error: mensajeError(e, `Ya existe el usuario "${usuario}".`) }
  }
  revalidatePath('/usuarios')
  if (password) return { ok: `Usuario "${usuario}" creado. Ya puede entrar con su contraseña.` }
  return { ok: mensajeCodigo(usuario, await generarCodigoAcceso(db(), id, false)) }
}

export async function editarUsuario(_: Resultado, f: FormData): Promise<Resultado> {
  const yo = await requerirAdmin()
  const id = entero(f, 'id')
  const nombre = texto(f, 'nombre')
  const rol = leerRol(f)
  const sucursalId = entero(f, 'sucursal_id')
  const activo = marcado(f, 'activo')
  const descuentoMax = leerDescuento(f, rol)
  if (!id || !nombre || !rol) return { error: 'Faltan datos.' }
  if (descuentoMax === null) return { error: 'El descuento máximo va de 0 a 100 %.' }
  const lugar = await validarLugar(rol, sucursalId)
  if (lugar) return { error: lugar }
  if (id === yo.id && (!activo || rol !== 'admin')) return { error: 'No podés quitarte el acceso de administradora a vos misma.' }

  try {
    await db()`
      update usuarios set
        nombre = ${nombre}, rol = ${rol}, sucursal_id = ${sucursalId}, activo = ${activo}, descuento_max = ${descuentoMax},
        version_sesion = case when activo <> ${activo} or rol <> ${rol} or sucursal_id is distinct from ${sucursalId} then version_sesion + 1 else version_sesion end
      where id = ${id}`
  } catch (e) {
    return { error: mensajeError(e) }
  }
  revalidatePath('/usuarios')
  return { ok: 'Cambios guardados.' }
}

export async function cambiarPassword(_: Resultado, f: FormData): Promise<Resultado> {
  await requerirAdmin()
  const id = entero(f, 'id')
  const password = String(f.get('password') ?? '')
  if (!id) return { error: 'Falta el usuario.' }
  if (password.length < PASSWORD_MIN) return { error: `La contraseña tiene que tener al menos ${PASSWORD_MIN} caracteres.` }
  // Cambiar la contraseña cierra las sesiones abiertas de ese usuario.
  await db()`update usuarios set password_hash = ${await hashPassword(password)}, version_sesion = version_sesion + 1 where id = ${id}`
  // Si estaba bloqueada por intentos fallidos, con la contraseña nueva ya puede entrar.
  await db()`delete from intentos_login where usuario = (select usuario from usuarios where id = ${id})`
  return { ok: 'Contraseña cambiada. Las sesiones abiertas se cerraron.' }
}

/** Código para que la persona cree (o vuelva a crear) su contraseña. Borra la anterior y cierra sus sesiones. */
export async function codigoAcceso(id: number): Promise<{ codigo?: string; error?: string }> {
  const yo = await requerirAdmin()
  if (!Number.isInteger(id)) return { error: 'Falta el usuario.' }
  if (id === yo.id) return { error: 'Para cambiar tu propia contraseña usá "Cambiar contraseña".' }
  const [u] = await db()<{ activo: boolean }[]>`select activo from usuarios where id = ${id}`
  if (!u?.activo) return { error: 'Ese usuario no tiene acceso: activalo primero.' }
  const codigo = await generarCodigoAcceso(db(), id, true)
  await db()`delete from intentos_login where usuario = (select usuario from usuarios where id = ${id})`
  revalidatePath('/usuarios')
  return { codigo }
}
