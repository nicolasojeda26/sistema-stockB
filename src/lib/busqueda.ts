import type { Sql } from 'postgres'

/** Igual que la función `normalizar` de la base: minúsculas y sin acentos. */
export function normalizar(t: string): string {
  return t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

/** Palabras de la búsqueda, ya normalizadas (máximo 6). */
export function palabras(texto: string): string[] {
  return normalizar(texto).split(/\s+/).filter(Boolean).slice(0, 6)
}

const like = (w: string) => `%${w.replace(/[\\%_]/g, '\\$&')}%`

/**
 * Condición SQL: cada palabra tiene que aparecer en el nombre o en el código
 * ("remera negra" encuentra "Remera lisa algodón negra M").
 */
export function coincide(sql: Sql, texto: string, alias = 'p') {
  const ws = palabras(texto)
  if (!ws.length) return sql`true`
  const nombre = sql.unsafe(`normalizar(${alias}.nombre)`)
  const codigo = sql.unsafe(`normalizar(${alias}.codigo)`)
  return ws.reduce((acc, w, i) => sql`${acc} ${i ? sql`and` : sql``} (${nombre} like ${like(w)} or ${codigo} like ${like(w)})`, sql``)
}

/** Orden: primero los que empiezan con lo buscado. */
export function ordenRelevancia(sql: Sql, texto: string, alias = 'p') {
  const ws = palabras(texto)
  return sql`(${sql.unsafe(`normalizar(${alias}.nombre)`)} like ${(ws[0] ?? '') + '%'}) desc, lower(${sql.unsafe(`${alias}.nombre`)})`
}
