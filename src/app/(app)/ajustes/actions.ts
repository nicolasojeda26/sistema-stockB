'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requerirAdmin } from '@/lib/dal'
import { texto } from '@/lib/errores'
import type { Resultado } from '@/components/form-accion'

export async function guardarAjustes(_: Resultado, f: FormData): Promise<Resultado> {
  await requerirAdmin()
  const nombre = texto(f, 'nombre_negocio').slice(0, 60)
  const pie = texto(f, 'pie_ticket').slice(0, 200)
  const ancho = texto(f, 'ancho_ticket') === '58' ? '58' : '80'
  const curvas = f.has('curvas_talles') ? texto(f, 'curvas_talles').slice(0, 2000) : null
  const colores = f.has('colores_frecuentes') ? texto(f, 'colores_frecuentes').slice(0, 1000) : null
  if (!nombre) return { error: 'Poné el nombre del negocio.' }
  const filas = [
    { clave: 'nombre_negocio', valor: nombre },
    { clave: 'pie_ticket', valor: pie },
    { clave: 'ancho_ticket', valor: ancho },
    ...(curvas !== null ? [{ clave: 'curvas_talles', valor: curvas }] : []),
    ...(colores !== null ? [{ clave: 'colores_frecuentes', valor: colores }] : []),
  ]
  await db()`insert into ajustes ${db()(filas)} on conflict (clave) do update set valor = excluded.valor`
  revalidatePath('/ajustes')
  return { ok: 'Guardado.' }
}
