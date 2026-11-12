'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requerirPermiso } from '@/lib/dal'
import { entero, marcado, mensajeError, texto } from '@/lib/errores'
import type { Resultado } from '@/components/form-accion'

export async function crearCategoria(_: Resultado, f: FormData): Promise<Resultado> {
  await requerirPermiso('productos')
  const nombre = texto(f, 'nombre')
  if (!nombre) return { error: 'Poné el nombre de la categoría.' }
  try {
    await db()`insert into categorias (nombre) values (${nombre})`
  } catch (e) {
    return { error: mensajeError(e, 'Ya existe esa categoría.') }
  }
  revalidatePath('/categorias')
  return { ok: `Categoría "${nombre}" creada.` }
}

export async function editarCategoria(_: Resultado, f: FormData): Promise<Resultado> {
  await requerirPermiso('productos')
  const id = entero(f, 'id')
  const nombre = texto(f, 'nombre')
  if (!id || !nombre) return { error: 'Poné el nombre de la categoría.' }
  try {
    await db()`update categorias set nombre = ${nombre}, activa = ${marcado(f, 'activa')} where id = ${id}`
  } catch (e) {
    return { error: mensajeError(e, 'Ya existe esa categoría.') }
  }
  revalidatePath('/categorias')
  return { ok: 'Guardado.' }
}
