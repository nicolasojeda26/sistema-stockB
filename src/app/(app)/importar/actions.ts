'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requerirPermiso } from '@/lib/dal'
import { importarFilas, type ResumenLote } from '@/lib/importar-db'

const Fila = z.object({
  fila: z.number().int(),
  codigo: z.string().trim().min(1).max(64),
  nombre: z.string().trim().min(1).max(200),
  categoria: z.string().trim().max(80).nullable(),
  costo: z.number().nonnegative().max(1e11).nullable(),
  precio: z.number().nonnegative().max(1e11).nullable(),
  stock: z.number().int().min(-1e7).max(1e7).nullable(),
  talle: z.string().trim().max(30).nullable().default(null),
  color: z.string().trim().max(30).nullable().default(null),
  articulo: z.string().trim().max(150).nullable().default(null),
  stocks: z.array(z.number().int().min(-1e7).max(1e7).nullable()).max(30).nullable().optional(),
  codigo_origen: z.string().trim().max(64).nullable().optional(),
})
const Lote = z.object({
  filas: z.array(Fila).max(500),
  depositoId: z.number().int().nullable(),
  depositosStock: z.array(z.number().int().nullable()).max(30).optional(),
  actualizarExistentes: z.boolean(),
})

export async function importarLote(datos: z.input<typeof Lote>): Promise<ResumenLote | { error: string }> {
  const u = await requerirPermiso('configuracion')
  const r = Lote.safeParse(datos)
  if (!r.success) return { error: 'Los datos del lote no son válidos.' }
  const elegidos = [r.data.depositoId, ...(r.data.depositosStock ?? [])].filter((x): x is number => !!x)
  if (elegidos.length) {
    const [{ n }] = await db()<{ n: number }[]>`select count(*)::int as n from depositos where id = any(${[...new Set(elegidos)]}::int[]) and activo`
    if (n !== new Set(elegidos).size) return { error: 'Algún depósito elegido no existe o está inactivo.' }
  }
  try {
    const res = await importarFilas(db(), { ...r.data, usuarioId: u.id })
    revalidatePath('/productos')
    revalidatePath('/categorias')
    return res
  } catch (e) {
    console.error(e)
    return { error: 'No se pudo importar este lote. Probá de nuevo.' }
  }
}
