'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { verificarIngreso } from '@/lib/ingreso'
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

  const token = await firmarSesion({ uid: r.id, v: r.versionSesion })
  ;(await cookies()).set(COOKIE_SESION, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: DURACION_SESION_SEG,
  })
  redirect('/')
}

export async function salir() {
  ;(await cookies()).delete(COOKIE_SESION)
  redirect('/login')
}
