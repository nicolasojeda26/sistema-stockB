'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requerirPermiso } from '@/lib/dal'
import { anularCompra, ErrorCompra, registrarCompra } from '@/lib/compras'
import { ErrorStock } from '@/lib/stock'
import { centavos } from '@/lib/numeros'

const Compra = z.object({
  proveedorId: z.number().int(),
  depositoId: z.number().int(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tipoComprobante: z.enum(['A', 'B', 'C', 'X']),
  numero: z.string().trim().max(30).nullable(),
  items: z
    .array(z.object({ productoId: z.number().int(), cantidad: z.number().int().positive(), costo: z.number().nonnegative() }))
    .min(1)
    .max(500),
  ivaPct: z.number(),
  percepciones: z.number().nonnegative(),
  totalEsperado: z.number().nonnegative(),
  actualizarCostos: z.boolean(),
  nota: z.string().trim().max(300).nullable(),
  pago: z
    .object({ monto: z.number().positive(), medio: z.enum(['efectivo', 'transferencia', 'cheque', 'debito', 'credito']), desdeCaja: z.boolean() })
    .nullable(),
})

export async function confirmarCompra(datos: z.input<typeof Compra>): Promise<{ compraId?: number; operacionId?: number; error?: string }> {
  const u = await requerirPermiso('compras')
  const r = Compra.safeParse(datos)
  if (!r.success) return { error: 'Revisá las cantidades y los costos de la lista.' }
  const d = r.data
  try {
    const c = await registrarCompra(db(), {
      ...d,
      usuario: { id: u.id, rol: u.rol, permisos: u.permisos },
      items: d.items.map((i) => ({ ...i, costo: centavos(i.costo) })),
      percepciones: centavos(d.percepciones),
      pago: d.pago ? { ...d.pago, monto: centavos(d.pago.monto) } : null,
    })
    const [{ operacion_id }] = await db()<{ operacion_id: number }[]>`select operacion_id from compras where id = ${c.compraId}`
    revalidatePath('/compras')
    revalidatePath('/proveedores')
    revalidatePath('/productos')
    revalidatePath('/mercaderia')
    revalidatePath('/caja')
    return { compraId: c.compraId, operacionId: Number(operacion_id) }
  } catch (e) {
    if (e instanceof ErrorCompra || e instanceof ErrorStock) return { error: e.message }
    console.error(e)
    return { error: 'No se pudo guardar. Probá de nuevo.' }
  }
}

export async function anular(compraId: number, motivo: string): Promise<{ error?: string }> {
  const u = await requerirPermiso('compras')
  try {
    await anularCompra(db(), { compraId, usuario: { id: u.id, rol: u.rol, permisos: u.permisos }, motivo: String(motivo ?? '').slice(0, 200) })
  } catch (e) {
    if (e instanceof ErrorCompra || e instanceof ErrorStock) return { error: e.message }
    throw e
  }
  revalidatePath(`/compras/${compraId}`)
  revalidatePath('/compras')
  revalidatePath('/proveedores')
  return {}
}
