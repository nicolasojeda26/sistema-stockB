'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requerirAlguno, requerirPermiso } from '@/lib/dal'
import { cancelarPedido, crearPedido, ErrorEnvio } from '@/lib/envios'

const Items = z.array(z.object({ productoId: z.number().int(), cantidad: z.number().int().positive().max(100000) })).min(1).max(500)

export async function nuevoPedido(d: { items: z.input<typeof Items>; nota: string; sucursalId: number | null }): Promise<{ pedidoId?: number; error?: string }> {
  const u = await requerirPermiso('pedidos')
  const items = Items.safeParse(d.items)
  if (!items.success) return { error: 'Revisá las cantidades.' }
  try {
    const r = await crearPedido(db(), { usuario: u, items: items.data, nota: String(d.nota ?? ''), sucursalId: d.sucursalId })
    revalidatePath('/pedidos')
    return r
  } catch (e) {
    if (e instanceof ErrorEnvio) return { error: e.message }
    throw e
  }
}

export async function cancelar(pedidoId: number): Promise<{ error?: string }> {
  const u = await requerirAlguno('pedidos', 'envios')
  try {
    await cancelarPedido(db(), { usuario: u, pedidoId })
  } catch (e) {
    if (e instanceof ErrorEnvio) return { error: e.message }
    throw e
  }
  revalidatePath('/pedidos')
  return {}
}
