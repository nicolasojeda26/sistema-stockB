'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { verificarPassword } from '@/lib/password'
import { COOKIE_SESION, DURACION_SESION_SEG, firmarSesion } from '@/lib/sesion'

export type EstadoLogin = { error?: string; usuario?: string }

export async function entrar(_prev: EstadoLogin, form: FormData): Promise<EstadoLogin> {
  const usuario = String(form.get('usuario') ?? '').trim().toLowerCase()
  const password = String(form.get('password') ?? '')
  if (!usuario || !password) return { error: 'Completá usuario y contraseña.', usuario }

  const [u] = await db()<{ id: number; password_hash: string; activo: boolean; version_sesion: number }[]>`
    select id, password_hash, activo, version_sesion from usuarios where usuario = ${usuario}`
  const ok = u ? await verificarPassword(password, u.password_hash) : false
  if (!u || !ok || !u.activo) return { error: 'Usuario o contraseña incorrectos.', usuario }

  const token = await firmarSesion({ uid: u.id, v: u.version_sesion })
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
