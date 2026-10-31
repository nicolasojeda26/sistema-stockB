'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requerirAdmin } from '@/lib/dal'
import { entero, marcado, mensajeError, texto } from '@/lib/errores'
import { PASSWORD_MIN, hashPassword } from '@/lib/password'
import type { Resultado } from '@/components/form-accion'

const RE_USUARIO = /^[a-z0-9._-]{3,30}$/

function leerDescuento(f: FormData, rol: string | null): number | null {
  if (rol === 'admin') return 100
  const v = Number(String(f.get('descuento_max') ?? '10').replace(',', '.'))
  return Number.isFinite(v) && v >= 0 && v <= 100 ? Math.round(v * 100) / 100 : null
}

function leerRol(f: FormData) {
  const rol = texto(f, 'rol')
  return rol === 'admin' || rol === 'vendedora' ? rol : null
}

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
  if (rol === 'vendedora' && !sucursalId) return { error: 'Elegí en qué sucursal trabaja.' }
  if (password.length < PASSWORD_MIN) return { error: `La contraseña tiene que tener al menos ${PASSWORD_MIN} caracteres.` }

  try {
    await db()`
      insert into usuarios (usuario, nombre, password_hash, rol, sucursal_id, descuento_max)
      values (${usuario}, ${nombre}, ${await hashPassword(password)}, ${rol}, ${sucursalId}, ${descuentoMax})`
  } catch (e) {
    return { error: mensajeError(e, `Ya existe el usuario "${usuario}".`) }
  }
  revalidatePath('/usuarios')
  return { ok: `Usuario "${usuario}" creado. Ya puede entrar con su contraseña.` }
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
  if (rol === 'vendedora' && !sucursalId) return { error: 'Elegí en qué sucursal trabaja.' }
  if (id === yo.id && (!activo || rol !== 'admin')) return { error: 'No podés quitarte el acceso de administradora a vos misma.' }

  try {
    await db()`
      update usuarios set
        nombre = ${nombre}, rol = ${rol}, sucursal_id = ${sucursalId}, activo = ${activo}, descuento_max = ${descuentoMax},
        version_sesion = case when activo <> ${activo} or rol <> ${rol} then version_sesion + 1 else version_sesion end
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
  return { ok: 'Contraseña cambiada. Las sesiones abiertas se cerraron.' }
}
