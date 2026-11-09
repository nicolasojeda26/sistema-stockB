'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { verificarIngreso } from '@/lib/ingreso'
import { activarCuenta } from '@/lib/acceso'
import { COOKIE_SESION, DURACION_SESION_SEG, firmarSesion } from '@/lib/sesion'


export type EstadoLogin = { error?: string; usuario?: string }

export async function entrar(_prev: EstadoLogin, form: FormData): Promise<EstadoLogin> {
  const usuario = String(form.get('usuario') ?? '').trim().toLowerCase()
  const password = String(form.get('password') ?? '')
  if (!usuario || !password) return { error: 'Completá usuario y contraseña.', usuario }

  const r = await verificarIngreso(db(), usuario.slice(0, 60), password)
  if (!r.ok && r.motivo === 'bloqueado')
    return { error: `Demasiados intentos fallidos. Esperá ${r.minutos} minuto${r.minutos === 1 ? '' : 's'} o pedile a una administradora que te cambie la contraseña.`, usuario }
  if (!r.ok) return { error: 'Usuario o contraseña incorrectos.', usuario }

  await iniciarSesion(r.id, r.versionSesion)
  redirect('/')
}

async function iniciarSesion(id: number, versionSesion: number) {
  const token = await firmarSesion({ uid: id, v: versionSesion })
  ;(await cookies()).set(COOKIE_SESION, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: DURACION_SESION_SEG,
  })
}

export type EstadoActivar = { error?: string; usuario?: string; codigo?: string }

/** Primera vez (o contraseña olvidada): crea la contraseña con el código de acceso. */
export async function activar(_prev: EstadoActivar, form: FormData): Promise<EstadoActivar> {
  const usuario = String(form.get('usuario') ?? '').trim().toLowerCase().slice(0, 60)
  const codigo = String(form.get('codigo') ?? '').slice(0, 30)
  const password = String(form.get('password') ?? '')
  const repetida = String(form.get('password2') ?? '')
  if (!usuario || !codigo) return { error: 'Completá tu usuario y el código.', usuario, codigo }
  if (password !== repetida) return { error: 'Las dos contraseñas no coinciden.', usuario, codigo }
  const r = await activarCuenta(db(), usuario, codigo, password)
  if (!r.ok) return { error: r.error, usuario, codigo }
  await iniciarSesion(r.id, r.versionSesion)
  redirect('/')
}

export async function salir() {
  ;(await cookies()).delete(COOKIE_SESION)
  redirect('/login')
}
