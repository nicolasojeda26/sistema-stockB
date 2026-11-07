'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requerirAdmin } from '@/lib/dal'
import { crearVariantes, ordenTalle, separarLista, sincronizarVariantes } from '@/lib/articulos'
import { mensajeError } from '@/lib/errores'
import { centavos, parseNumero } from '@/lib/numeros'

export type ResultadoArticulo = { id?: number; ok?: string; error?: string; errores?: Record<string, string> }

function errorUnico(e: unknown): string {
  const c = (e as { constraint_name?: string }).constraint_name
  if (c === 'productos_variante') return 'Esa combinación de talle y color ya existe.'
  if (c === 'productos_codigo') return 'Uno de los códigos ya lo usa otro producto.'
  return mensajeError(e, 'Ya existe un dato igual.')
}

const Nuevo = z.object({
  nombre: z.string().trim().min(1, 'Poné el nombre del artículo.').max(150),
  categoriaId: z.number().int().nullable(),
  marca: z.string().trim().max(60),
  costo: z.string(),
  precio: z.string(),
  stockMinimo: z.string(),
  talles: z.array(z.string().trim().min(1).max(30)).max(40),
  colores: z.array(z.string().trim().min(1).max(30)).max(40),
  /** Códigos de barra propios por variante ("color|talle" → código); los vacíos se generan. */
  codigos: z.record(z.string(), z.string().trim().max(64)),
})

function preciosDe(d: { costo: string; precio: string; stockMinimo: string }, errores: Record<string, string>) {
  const costo = d.costo.trim() ? parseNumero(d.costo) : 0
  const precio = parseNumero(d.precio)
  const stockMinimo = d.stockMinimo.trim() ? parseNumero(d.stockMinimo) : 0
  if (costo === null || costo < 0) errores.costo = 'Costo no válido.'
  if (precio === null || precio < 0) errores.precio = 'Poné el precio de venta.'
  if (stockMinimo === null || stockMinimo < 0 || !Number.isInteger(stockMinimo)) errores.stock_minimo = 'Tiene que ser un número entero.'
  return { costo: centavos(costo ?? 0), precio: centavos(precio ?? 0), stock_minimo: stockMinimo ?? 0 }
}

export async function crearArticulo(datos: z.input<typeof Nuevo>): Promise<ResultadoArticulo> {
  const u = await requerirAdmin()
  const r = Nuevo.safeParse(datos)
  if (!r.success) return { error: r.error.issues[0]?.message ?? 'Revisá los datos.' }
  const d = r.data
  const errores: Record<string, string> = {}
  const precios = preciosDe(d, errores)
  const talles = separarLista(d.talles.join(','))
  const colores = separarLista(d.colores.join(','))
  if (!talles.length && !colores.length) errores.variantes = 'Elegí al menos un talle o un color.'
  const codigos = Object.values(d.codigos).filter(Boolean).map((c) => c.toLowerCase())
  if (new Set(codigos).size !== codigos.length) errores.variantes = 'Hay dos variantes con el mismo código.'
  if (Object.keys(errores).length) return { error: 'Revisá los campos marcados.', errores }

  try {
    const id = await db().begin(async (tx) => {
      await tx`select set_config('app.usuario_id', ${String(u.id)}, true), set_config('app.origen', 'Alta del artículo', true)`
      const [a] = await tx<{ id: number; nombre: string; categoria_id: number | null }[]>`
        insert into articulos (nombre, categoria_id, marca) values (${d.nombre}, ${d.categoriaId}, ${d.marca || null})
        returning id, nombre, categoria_id`
      const cs = colores.length ? colores : [null]
      const ts = talles.length ? talles : [null]
      const variantes = cs.flatMap((color) =>
        ts.map((talle) => ({ color, talle, orden: ordenTalle(talle, talles), codigo: d.codigos[`${color ?? ''}|${talle ?? ''}`] || null })),
      )
      await crearVariantes(tx, a, variantes, precios)
      return a.id
    })
    revalidatePath('/productos')
    return { id }
  } catch (e) {
    return { error: errorUnico(e) }
  }
}

const Edicion = z.object({
  id: z.number().int(),
  nombre: z.string().trim().min(1, 'Poné el nombre del artículo.').max(150),
  categoriaId: z.number().int().nullable(),
  marca: z.string().trim().max(60),
  activo: z.boolean(),
  /** Si vienen, se aplican a todas las variantes. */
  precioTodas: z.string(),
  costoTodas: z.string(),
})

export async function guardarArticulo(datos: z.input<typeof Edicion>): Promise<ResultadoArticulo> {
  const u = await requerirAdmin()
  const r = Edicion.safeParse(datos)
  if (!r.success) return { error: r.error.issues[0]?.message ?? 'Revisá los datos.' }
  const d = r.data
  const errores: Record<string, string> = {}
  const precio = d.precioTodas.trim() ? parseNumero(d.precioTodas) : null
  const costo = d.costoTodas.trim() ? parseNumero(d.costoTodas) : null
  if (d.precioTodas.trim() && (precio === null || precio < 0)) errores.precio = 'Precio no válido.'
  if (d.costoTodas.trim() && (costo === null || costo < 0)) errores.costo = 'Costo no válido.'
  if (Object.keys(errores).length) return { error: 'Revisá los campos marcados.', errores }
  try {
    await db().begin(async (tx) => {
      await tx`select set_config('app.usuario_id', ${String(u.id)}, true), set_config('app.origen', 'Edición del artículo', true)`
      const [a] = await tx`
        update articulos set nombre = ${d.nombre}, categoria_id = ${d.categoriaId}, marca = ${d.marca || null},
          activo = ${d.activo}, actualizado = now()
        where id = ${d.id} returning id`
      if (!a) throw new Error('no existe')
      await sincronizarVariantes(tx, d.id)
      if (precio !== null) await tx`update productos set precio = ${centavos(precio)}, actualizado = now() where articulo_id = ${d.id}`
      if (costo !== null) await tx`update productos set costo = ${centavos(costo)}, actualizado = now() where articulo_id = ${d.id}`
      // Dar de baja el artículo da de baja todas sus variantes (y al reactivarlo, vuelven).
      await tx`update productos set activo = ${d.activo} where articulo_id = ${d.id} and activo <> ${d.activo}`
    })
  } catch (e) {
    return { error: mensajeError(e) }
  }
  revalidatePath(`/articulos/${d.id}`)
  revalidatePath('/productos')
  return { ok: 'Cambios guardados.' }
}

const Agregar = z.object({
  id: z.number().int(),
  talles: z.array(z.string().trim().min(1).max(30)).max(40),
  colores: z.array(z.string().trim().min(1).max(30)).max(40),
})

/** Agrega talles o colores: crea las combinaciones que falten con el precio y costo más usados del artículo. */
export async function agregarVariantes(datos: z.input<typeof Agregar>): Promise<ResultadoArticulo> {
  const u = await requerirAdmin()
  const r = Agregar.safeParse(datos)
  if (!r.success) return { error: 'Revisá los talles y colores.' }
  const { id } = r.data
  const sql = db()
  const [a] = await sql<{ id: number; nombre: string; categoria_id: number | null }[]>`select id, nombre, categoria_id from articulos where id = ${id}`
  if (!a) return { error: 'No existe ese artículo.' }
  const actuales = await sql<{ talle: string | null; color: string | null; orden_talle: number }[]>`
    select talle, color, orden_talle from productos where articulo_id = ${id} order by orden_talle`
  const talles = separarLista([...actuales.map((v) => v.talle ?? ''), ...r.data.talles].join(','))
  const colores = separarLista([...actuales.map((v) => v.color ?? ''), ...r.data.colores].join(','))
  const [base] = await sql<{ costo: number; precio: number; stock_minimo: number }[]>`
    select costo, precio, stock_minimo from productos where articulo_id = ${id}
    group by costo, precio, stock_minimo order by count(*) desc limit 1`
  const cs = colores.length ? colores : [null]
  const ts = talles.length ? talles : [null]
  try {
    const nuevos = await sql.begin(async (tx) => {
      await tx`select set_config('app.usuario_id', ${String(u.id)}, true)`
      return crearVariantes(
        tx,
        a,
        cs.flatMap((color) => ts.map((talle) => ({ color, talle, orden: ordenTalle(talle, talles) }))),
        base ?? { costo: 0, precio: 0, stock_minimo: 0 },
      )
    })
    revalidatePath(`/articulos/${id}`)
    revalidatePath('/productos')
    return { ok: nuevos.length ? `Se agregaron ${nuevos.length} variantes.` : 'Esas variantes ya existían.' }
  } catch (e) {
    return { error: errorUnico(e) }
  }
}
