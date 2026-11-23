'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requerirAlguno } from '@/lib/dal'
import { avanzarEntrega, ErrorVenta } from '@/lib/ventas'

export async function avanzar(itemId: number): Promise<{ error?: string }> {
  const u = await requerirAlguno('vender', 'envios')
  try {
    await avanzarEntrega(db(), { itemId, usuario: { id: u.id, rol: u.rol, permisos: u.permisos }, sucursalId: u.sucursal_id })
  } catch (e) {
    if (e instanceof ErrorVenta) return { error: e.message }
    console.error(e)
    return { error: 'No se pudo guardar. Probá de nuevo.' }
  }
  revalidatePath('/entregas')
  return {}
}
