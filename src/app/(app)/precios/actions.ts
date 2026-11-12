'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requerirPermiso } from '@/lib/dal'

const Aumento = z.object({
  categoriaId: z.number().int().nullable(),
  porcentaje: z.number().min(-90).max(500),
  redondeo: z.union([z.literal(0), z.literal(10), z.literal(50), z.literal(100), z.literal(500), z.literal(1000)]),
})
export type DatosAumento = z.input<typeof Aumento>

// Precio nuevo calculado en la base, igual en la vista previa y al aplicar.
const nuevoPrecio = (sql: ReturnType<typeof db>, a: z.output<typeof Aumento>) =>
  a.redondeo > 0
    ? sql`ceil(p.precio * (1 + ${a.porcentaje}::numeric / 100) / ${a.redondeo}) * ${a.redondeo}`
    : sql`round(p.precio * (1 + ${a.porcentaje}::numeric / 100), 2)`

const filtro = (sql: ReturnType<typeof db>, a: z.output<typeof Aumento>) =>
  sql`p.activo and p.precio > 0 ${a.categoriaId ? sql`and p.categoria_id = ${a.categoriaId}` : sql``}`

export async function previsualizar(datos: DatosAumento) {
  await requerirPermiso('productos')
  const r = Aumento.safeParse(datos)
  if (!r.success) return { error: 'Revisá el porcentaje.' }
  const sql = db()
  const [[{ cantidad }], ejemplos] = await Promise.all([
    sql<{ cantidad: number }[]>`select count(*)::int as cantidad from productos p where ${filtro(sql, r.data)}`,
    sql<{ nombre: string; antes: number; despues: number }[]>`
      select p.nombre, p.precio as antes, ${nuevoPrecio(sql, r.data)} as despues
      from productos p where ${filtro(sql, r.data)} order by lower(p.nombre) limit 8`,
  ])
  return { cantidad, ejemplos }
}

export async function aplicar(datos: DatosAumento): Promise<{ actualizados?: number; error?: string }> {
  const u = await requerirPermiso('productos')
  const r = Aumento.safeParse(datos)
  if (!r.success) return { error: 'Revisá el porcentaje.' }
  if (r.data.porcentaje === 0 && r.data.redondeo === 0) return { error: 'Con 0 % y sin redondeo no cambia nada.' }
  const origen = `Actualización masiva ${r.data.porcentaje > 0 ? '+' : ''}${r.data.porcentaje} %`
  const filas = await db().begin(async (tx) => {
    await tx`select set_config('app.usuario_id', ${String(u.id)}, true), set_config('app.origen', ${origen}, true)`
    return tx`
      update productos p set precio = ${nuevoPrecio(tx as unknown as ReturnType<typeof db>, r.data)}, actualizado = now()
      where ${filtro(tx as unknown as ReturnType<typeof db>, r.data)}
      returning p.id`
  })
  revalidatePath('/productos')
  return { actualizados: filas.length }
}
