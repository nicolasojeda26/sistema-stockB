'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requerirPermiso } from '@/lib/dal'
import { texto } from '@/lib/errores'
import type { Resultado } from '@/components/form-accion'

export async function guardarAjustes(_: Resultado, f: FormData): Promise<Resultado> {
  await requerirPermiso('configuracion')
  const nombre = texto(f, 'nombre_negocio').slice(0, 60)
  const pie = texto(f, 'pie_ticket').slice(0, 200)
  const ancho = texto(f, 'ancho_ticket') === '58' ? '58' : '80'
  const curvas = f.has('curvas_talles') ? texto(f, 'curvas_talles').slice(0, 2000) : null
  const colores = f.has('colores_frecuentes') ? texto(f, 'colores_frecuentes').slice(0, 1000) : null
  const gastos = f.has('categorias_gasto') ? texto(f, 'categorias_gasto').slice(0, 1000) : null
  if (!nombre) return { error: 'Poné el nombre del negocio.' }
  const pct = (clave: string) => {
    if (!f.has(clave)) return null
    const n = Number(texto(f, clave).replace(',', '.') || '0')
    return Number.isFinite(n) && n >= 0 && n < 100 ? String(Math.round(n * 100) / 100) : undefined
  }
  const descTransf = pct('descuento_transferencia')
  const descEfect = pct('descuento_efectivo')
  if (descTransf === undefined || descEfect === undefined) return { error: 'Los descuentos por forma de pago van de 0 a 99 %.' }
  const filas = [
    { clave: 'nombre_negocio', valor: nombre },
    { clave: 'pie_ticket', valor: pie },
    { clave: 'ancho_ticket', valor: ancho },
    ...(curvas !== null ? [{ clave: 'curvas_talles', valor: curvas }] : []),
    ...(colores !== null ? [{ clave: 'colores_frecuentes', valor: colores }] : []),
    ...(gastos !== null ? [{ clave: 'categorias_gasto', valor: gastos }] : []),
    ...(descTransf !== null ? [{ clave: 'descuento_transferencia', valor: descTransf }] : []),
    ...(descEfect !== null ? [{ clave: 'descuento_efectivo', valor: descEfect }] : []),
  ]
  await db()`insert into ajustes ${db()(filas)} on conflict (clave) do update set valor = excluded.valor`
  revalidatePath('/ajustes')
  revalidatePath('/vender')
  return { ok: 'Guardado.' }
}

const TIPOS_LOGO = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']

/** Logo y color de marca. */
export async function guardarMarca(_: Resultado, f: FormData): Promise<Resultado> {
  await requerirPermiso('configuracion')
  const color = texto(f, 'color_marca').toLowerCase()
  if (color && !/^#[0-9a-f]{6}$/.test(color)) return { error: 'El color no es válido.' }
  const filas: { clave: string; valor: string }[] = [{ clave: 'color_marca', valor: color }]
  const archivo = f.get('logo')
  if (f.get('quitar_logo') === 'on') filas.push({ clave: 'logo', valor: '' })
  else if (archivo instanceof File && archivo.size > 0) {
    if (!TIPOS_LOGO.includes(archivo.type)) return { error: 'El logo tiene que ser PNG, JPG, WEBP o SVG.' }
    if (archivo.size > 500_000) return { error: 'El logo es muy pesado (máximo 500 KB).' }
    const datos = Buffer.from(await archivo.arrayBuffer()).toString('base64')
    filas.push({ clave: 'logo', valor: `data:${archivo.type};base64,${datos}` }, { clave: 'logo_version', valor: String(Date.now()) })
  }
  await db()`insert into ajustes ${db()(filas)} on conflict (clave) do update set valor = excluded.valor`
  revalidatePath('/', 'layout')
  return { ok: 'Marca guardada.' }
}
