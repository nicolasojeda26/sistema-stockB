import type { Sql, TransactionSql } from 'postgres'
import { codigoInterno } from './codigos'

type Tx = Sql | TransactionSql

export type Curva = { nombre: string; talles: string[] }

/** "Letras: XS, S, M" (una curva por línea) → [{ nombre: 'Letras', talles: ['XS','S','M'] }] */
export function parsearCurvas(texto: string): Curva[] {
  return texto
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [nombre, resto = ''] = l.includes(':') ? [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1)] : ['', l]
      return { nombre: nombre.trim(), talles: separarLista(resto) }
    })
    .filter((c) => c.talles.length)
}

/** "Negro, Blanco ,negro" → ['Negro', 'Blanco'] (sin vacíos ni repetidos, sin importar mayúsculas). */
export function separarLista(texto: string): string[] {
  const vistos = new Set<string>()
  const out: string[] = []
  for (const x of texto.split(/[,;\n]/)) {
    const v = x.trim().replace(/\s+/g, ' ').slice(0, 30)
    if (v && !vistos.has(v.toLowerCase())) {
      vistos.add(v.toLowerCase())
      out.push(v)
    }
  }
  return out
}

/** Nombre de cada variante: "Jean wide leg" + "Negro" + "40" → "Jean wide leg Negro 40". */
export function nombreVariante(articulo: string, color: string | null, talle: string | null): string {
  return [articulo.trim(), color?.trim(), talle?.trim()].filter(Boolean).join(' ')
}

/** Orden natural de talles: los números por valor y las letras según la curva habitual. */
const LETRAS = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '3XL', '4XL', '5XL']
export function ordenTalle(talle: string | null, curva: string[] = []): number {
  if (!talle) return 0
  const i = curva.findIndex((t) => t.toLowerCase() === talle.toLowerCase())
  if (i >= 0) return i + 1
  const n = Number(talle.replace(',', '.'))
  if (Number.isFinite(n)) return Math.round(n * 10)
  const j = LETRAS.indexOf(talle.toUpperCase())
  return j >= 0 ? 1000 + j : 2000
}

export type DatosVariante = {
  talle: string | null
  color: string | null
  codigo?: string | null
  orden: number
}

/**
 * Crea las variantes que faltan de un artículo (las que ya existen se saltean).
 * Las variantes nuevas toman precio, costo y stock mínimo indicados.
 * Devuelve los ids creados.
 */
export async function crearVariantes(
  tx: Tx,
  articulo: { id: number; nombre: string; categoria_id: number | null },
  variantes: DatosVariante[],
  precios: { costo: number; precio: number; stock_minimo: number },
): Promise<number[]> {
  const ids: number[] = []
  for (const v of variantes) {
    const [existe] = await tx<{ id: number }[]>`
      select id from productos where articulo_id = ${articulo.id}
        and lower(coalesce(color, '')) = lower(${v.color ?? ''}) and lower(coalesce(talle, '')) = lower(${v.talle ?? ''})`
    if (existe) continue
    let codigo = v.codigo?.trim() || null
    if (!codigo) {
      const [{ n }] = await tx<{ n: string }[]>`select nextval('codigo_interno_seq')::text as n`
      codigo = codigoInterno(Number(n))
    }
    const [p] = await tx<{ id: number }[]>`
      insert into productos (codigo, nombre, categoria_id, costo, precio, stock_minimo, articulo_id, talle, color, orden_talle)
      values (${codigo}, ${nombreVariante(articulo.nombre, v.color, v.talle)}, ${articulo.categoria_id},
              ${precios.costo}, ${precios.precio}, ${precios.stock_minimo}, ${articulo.id}, ${v.talle}, ${v.color}, ${v.orden})
      returning id`
    ids.push(p.id)
  }
  return ids
}

/** Al renombrar o recategorizar un artículo, sus variantes se actualizan solas. */
export async function sincronizarVariantes(tx: Tx, articuloId: number) {
  const [a] = await tx<{ nombre: string; categoria_id: number | null }[]>`select nombre, categoria_id from articulos where id = ${articuloId}`
  if (!a) return
  const vs = await tx<{ id: number; color: string | null; talle: string | null }[]>`
    select id, color, talle from productos where articulo_id = ${articuloId}`
  for (const v of vs)
    await tx`update productos set nombre = ${nombreVariante(a.nombre, v.color, v.talle)}, categoria_id = ${a.categoria_id}, actualizado = now()
             where id = ${v.id}`
}
