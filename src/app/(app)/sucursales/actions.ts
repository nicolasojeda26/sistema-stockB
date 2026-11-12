'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requerirPermiso } from '@/lib/dal'
import { entero, marcado, mensajeError, texto } from '@/lib/errores'
import type { Resultado } from '@/components/form-accion'

const leerTipo = (f: FormData) => {
  const t = texto(f, 'tipo')
  return t === 'online' || t === 'deposito' ? t : 'local'
}

const listo = (ok: string): Resultado => {
  revalidatePath('/sucursales')
  return { ok }
}

export async function crearSucursal(_: Resultado, f: FormData): Promise<Resultado> {
  await requerirPermiso('configuracion')
  const nombre = texto(f, 'nombre')
  const direccion = texto(f, 'direccion') || null
  const tipo = leerTipo(f)
  if (!nombre) return { error: 'Poné el nombre de la sucursal.' }
  const deposito = tipo === 'deposito' ? 'Depósito' : tipo === 'online' ? 'Stock online' : 'Local'
  try {
    await db().begin(async (tx) => {
      const [s] = await tx<{ id: number }[]>`insert into sucursales (nombre, direccion, tipo) values (${nombre}, ${direccion}, ${tipo}) returning id`
      // Toda sucursal nace con su depósito principal: de ahí salen las ventas.
      await tx`insert into depositos (nombre, sucursal_id, es_principal) values (${deposito}, ${s.id}, true)`
    })
  } catch (e) {
    return { error: mensajeError(e, 'Ya hay una sucursal con ese nombre.') }
  }
  return listo(`"${nombre}" creada con su depósito ${deposito}.`)
}

export async function editarSucursal(_: Resultado, f: FormData): Promise<Resultado> {
  await requerirPermiso('configuracion')
  const id = entero(f, 'id')
  const nombre = texto(f, 'nombre')
  const direccion = texto(f, 'direccion') || null
  const activa = marcado(f, 'activa')
  const tipo = leerTipo(f)
  if (!id || !nombre) return { error: 'Poné el nombre de la sucursal.' }
  const [{ choca }] = await db()<{ choca: number }[]>`
    select count(*)::int as choca from usuarios where sucursal_id = ${id} and activo
      and ((rol = 'deposito' and ${tipo} <> 'deposito') or (rol = 'vendedora' and ${tipo} = 'deposito'))`
  if (choca > 0) return { error: 'Hay personal asignado que no corresponde a ese tipo (vendedores en un depósito o encargados en un local). Movelos primero.' }
  if (!activa) {
    const [{ n }] = await db()<{ n: number }[]>`
      select count(*)::int as n from usuarios where sucursal_id = ${id} and activo`
    if (n > 0) return { error: `Hay ${n} usuario(s) activos en esta sucursal. Pasalos a otra antes de desactivarla.` }
  }
  try {
    await db()`update sucursales set nombre = ${nombre}, direccion = ${direccion}, activa = ${activa}, tipo = ${tipo} where id = ${id}`
  } catch (e) {
    return { error: mensajeError(e, 'Ya hay una sucursal con ese nombre.') }
  }
  return listo('Cambios guardados.')
}

export async function crearDeposito(_: Resultado, f: FormData): Promise<Resultado> {
  await requerirPermiso('configuracion')
  const nombre = texto(f, 'nombre')
  const sucursalId = entero(f, 'sucursal_id') // vacío = depósito central
  if (!nombre) return { error: 'Poné el nombre del depósito.' }
  try {
    await db().begin(async (tx) => {
      // Si la sucursal no tiene principal (caso raro), este pasa a serlo.
      const [{ tiene }] = sucursalId
        ? await tx<{ tiene: boolean }[]>`select exists(select 1 from depositos where sucursal_id = ${sucursalId} and es_principal) as tiene`
        : [{ tiene: true }]
      await tx`insert into depositos (nombre, sucursal_id, es_principal) values (${nombre}, ${sucursalId}, ${!tiene})`
    })
  } catch (e) {
    return { error: mensajeError(e, 'Ya hay un depósito con ese nombre ahí.') }
  }
  return listo(`Depósito "${nombre}" creado.`)
}

export async function editarDeposito(_: Resultado, f: FormData): Promise<Resultado> {
  await requerirPermiso('configuracion')
  const id = entero(f, 'id')
  const nombre = texto(f, 'nombre')
  const activo = marcado(f, 'activo')
  if (!id || !nombre) return { error: 'Poné el nombre del depósito.' }
  const [dep] = await db()<{ es_principal: boolean; stock: number }[]>`
    select d.es_principal, coalesce((select sum(cantidad) from stock where deposito_id = d.id), 0)::int as stock
    from depositos d where d.id = ${id}`
  if (!dep) return { error: 'El depósito no existe.' }
  if (!activo && dep.es_principal) return { error: 'Es el depósito principal de la sucursal: elegí otro como principal antes de desactivarlo.' }
  if (!activo && dep.stock !== 0) return { error: `Tiene ${dep.stock} unidades en stock. Transferilas antes de desactivarlo.` }
  try {
    await db()`update depositos set nombre = ${nombre}, activo = ${activo} where id = ${id}`
  } catch (e) {
    return { error: mensajeError(e, 'Ya hay un depósito con ese nombre ahí.') }
  }
  return listo('Cambios guardados.')
}

export async function marcarPrincipal(f: FormData) {
  await requerirPermiso('configuracion')
  const id = entero(f, 'id')
  if (!id) return
  await db().begin(async (tx) => {
    const [d] = await tx<{ sucursal_id: number | null }[]>`select sucursal_id from depositos where id = ${id} and activo`
    if (!d?.sucursal_id) return
    await tx`update depositos set es_principal = false where sucursal_id = ${d.sucursal_id}`
    await tx`update depositos set es_principal = true where id = ${id}`
  })
  revalidatePath('/sucursales')
}
