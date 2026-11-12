'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requerirPermiso, requerirUsuario } from '@/lib/dal'
import { cancelarEnvio, crearEnvio, ErrorEnvio, recibirEnvio, resolverDiferencias } from '@/lib/envios'

const Items = z.array(z.object({ productoId: z.number().int(), cantidad: z.number().int().min(0).max(100000) })).max(500)

const refrescar = (id?: number) => {
  revalidatePath('/envios')
  revalidatePath('/pedidos')
  revalidatePath('/', 'layout')
  if (id) revalidatePath(`/envios/${id}`)
}

async function intentar<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof ErrorEnvio) return { error: e.message }
    throw e
  }
}

export async function nuevoEnvio(d: {
  origenId: number
  destinoId: number
  items: z.input<typeof Items>
  nota: string
  pedidoId: number | null
  cerrarPedido: boolean
}): Promise<{ envioId?: number; error?: string }> {
  const u = await requerirPermiso('envios')
  const items = Items.safeParse(d.items)
  if (!items.success || !items.data.some((i) => i.cantidad > 0)) return { error: 'Revisá las cantidades.' }
  const r = await intentar(() =>
    crearEnvio(db(), {
      usuario: u,
      origenId: d.origenId,
      destinoId: d.destinoId,
      items: items.data.filter((i) => i.cantidad > 0),
      nota: String(d.nota ?? ''),
      pedidoId: d.pedidoId,
      cerrarPedido: d.cerrarPedido,
    }),
  )
  refrescar()
  return r
}

export async function recibir(envioId: number, contados: z.input<typeof Items>, nota: string): Promise<{ diferencias?: number; error?: string }> {
  const u = await requerirUsuario()
  const items = Items.safeParse(contados)
  if (!items.success) return { error: 'Revisá lo que contaste.' }
  const r = await intentar(() => recibirEnvio(db(), { usuario: u, envioId, recibidos: items.data, nota }))
  refrescar(envioId)
  return r
}

export async function resolver(envioId: number, accion: 'perdida' | 'devolver', nota: string): Promise<{ error?: string }> {
  const u = await requerirPermiso('diferencias')
  const r = await intentar(() => resolverDiferencias(db(), { usuario: u, envioId, accion: accion === 'devolver' ? 'devolver' : 'perdida', nota }))
  refrescar(envioId)
  return r ?? {}
}

export async function cancelar(envioId: number): Promise<{ error?: string }> {
  const u = await requerirUsuario()
  const r = await intentar(() => cancelarEnvio(db(), { usuario: u, envioId }))
  refrescar(envioId)
  return r ?? {}
}
