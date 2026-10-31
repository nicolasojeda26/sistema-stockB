'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requerirAdmin } from '@/lib/dal'
import { anularVenta, ErrorVenta } from '@/lib/ventas'
import type { Resultado } from '@/components/form-accion'

export async function anular(_: Resultado, f: FormData): Promise<Resultado> {
  const u = await requerirAdmin()
  const id = Number(f.get('id'))
  if (!Number.isInteger(id)) return { error: 'Falta la venta.' }
  try {
    await anularVenta(db(), { ventaId: id, usuarioId: u.id, motivo: String(f.get('motivo') ?? '') })
  } catch (e) {
    if (e instanceof ErrorVenta) return { error: e.message }
    throw e
  }
  revalidatePath(`/ventas/${id}`)
  revalidatePath('/ventas')
  revalidatePath('/caja')
  return { ok: 'Venta anulada. El stock volvió al local.' }
}
