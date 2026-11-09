// Lectura de la planilla exportada de Dux (o cualquier Excel/CSV de productos).
// Es código puro: se usa en el navegador para la vista previa y en los tests.
import { parseNumero } from './numeros'

export const CAMPOS = {
  codigo: 'Código de barras',
  codigo_alt: 'Código interno',
  nombre: 'Nombre / descripción',
  categoria: 'Categoría / rubro',
  costo: 'Costo',
  precio: 'Precio de venta',
  stock: 'Stock',
  talle: 'Modelo',
  color: 'Color',
} as const
export type Campo = keyof typeof CAMPOS
export type Mapeo = Partial<Record<Campo, number>>

export type FilaImport = {
  fila: number
  codigo: string
  nombre: string
  categoria: string | null
  costo: number | null
  precio: number | null
  stock: number | null
  talle: string | null
  color: string | null
  /** Nombre del artículo que agrupa los talles y colores (solo si hay talle o color). */
  articulo: string | null
  /** Stock de cada columna de depósito (planilla "stock por depósito" de Dux), en el orden de `columnasStock`. */
  stocks?: (number | null)[] | null
  /** Código original de Dux cuando lo comparten varias variantes (el nuestro le suma el color). */
  codigo_origen?: string | null
}

export type ColumnaStock = { indice: number; encabezado: string }

/** Columnas de stock por depósito ("DEPOSITO SAN LORENZO 960", "DEPOT 815", "ONLINE"…), sin la de TOTAL. */
export function detectarColumnasStock(encabezados: unknown[], mapeo: Mapeo): ColumnaStock[] {
  const usadas = new Set(Object.values(mapeo))
  return encabezados
    .map((h, indice) => ({ indice, encabezado: String(h ?? '').trim(), n: normalizar(h) }))
    .filter((c) => c.n && !usadas.has(c.indice) && /(deposito|depot|online|mayorista|sucursal|local|campus)/.test(c.n) && !/total/.test(c.n))
    .map(({ indice, encabezado }) => ({ indice, encabezado }))
}

/** Sugiere el depósito de cada columna comparando números y palabras ("DEPOSITO SAN LORENZO 960" → "San Lorenzo 960 · Local"). */
export function sugerirDeposito(encabezado: string, depositos: { id: number; nombre: string; clave?: string; central?: boolean }[]): number | null {
  const n = normalizar(encabezado).replace(/\b(deposito|depot|dep)\b/g, ' ').trim()
  const numeros = n.match(/\d+/g) ?? []
  const palabras = n.split(' ').filter((w) => w.length > 2 && !/^\d+$/.test(w))
  let mejor: { id: number; puntos: number } | null = null
  for (const d of depositos) {
    const dn = normalizar(`${d.nombre} ${d.clave ?? ''}`)
    let puntos = 0
    // "DEPOT 815": el depósito central de Dux, aunque comparta número con un local.
    if (/\bdepot\b/.test(normalizar(encabezado)) && d.central) puntos += 10
    for (const x of numeros) if (new RegExp(`\\b${x}\\b`).test(dn)) puntos += 3
    for (const w of palabras) if (dn.includes(w)) puntos += 1
    if (puntos > 0 && (!mejor || puntos > mejor.puntos)) mejor = { id: d.id, puntos }
  }
  return mejor?.id ?? null
}

const normalizar = (s: unknown) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

// En orden de prioridad: el primer patrón que encaja se queda con la columna.
const PATRONES: [Campo, RegExp][] = [
  ['codigo', /(cod(igo)? (de )?barras?|^ean|barcode|^gtin|cod barra)/],
  ['costo', /costo/],
  ['precio', /(^precio( de)? (venta|lista|final|publico)|^p ?venta|^pvp|^precio$|^precio 1$|^lista 1$|^precio lista 1)/],
  ['stock', /(^stock( actual| total| disponible)?$|existencia|^saldo$|^cantidad$)/],
  ['categoria', /(^rubro$|^categoria$|^familia$|^linea$|^rubro principal$)/],
  ['talle', /(^talles?$|^talla$|^size$|^medida$)/],
  ['color', /(^colou?r(es)?$)/],
  ['codigo_alt', /(^cod(igo)?( interno| articulo| producto)?$|^sku$|^cod art$)/],
  ['nombre', /(descripcion|^producto$|^nombre|^articulo$|^detalle$)/],
]

/** Asigna columnas a campos según los encabezados. */
export function detectarColumnas(encabezados: unknown[]): Mapeo {
  const mapeo: Mapeo = {}
  const usadas = new Set<number>()
  for (const [campo, re] of PATRONES) {
    const i = encabezados.findIndex((h, idx) => !usadas.has(idx) && re.test(normalizar(h)))
    if (i >= 0 && mapeo[campo] === undefined) {
      mapeo[campo] = i
      usadas.add(i)
    }
  }
  // Sin columna de categoría exacta, aceptar "sub rubro" o similares.
  if (mapeo.categoria === undefined) {
    const i = encabezados.findIndex((h, idx) => !usadas.has(idx) && /(rubro|categoria)/.test(normalizar(h)))
    if (i >= 0) mapeo.categoria = i
  }
  return mapeo
}

/** Busca la fila de encabezados entre las primeras filas (Dux a veces pone un título arriba). */
export function encontrarEncabezado(filas: unknown[][]): number {
  let mejor = 0
  let puntaje = -1
  for (let i = 0; i < Math.min(filas.length, 15); i++) {
    const n = Object.keys(detectarColumnas(filas[i] ?? [])).length
    if (n > puntaje) {
      mejor = i
      puntaje = n
    }
  }
  return mejor
}

function textoCelda(v: unknown): string {
  if (v === null || v === undefined) return ''
  // Códigos numéricos largos: sin notación científica ni decimales.
  if (typeof v === 'number') return Number.isInteger(v) ? BigInt(v).toString() : String(v)
  return String(v).trim()
}

export type ResultadoFila = { ok: true; fila: FilaImport } | { ok: false; fila: number; motivo: string }

export function leerFila(celdas: unknown[], mapeo: Mapeo, numeroFila: number, columnasStock: ColumnaStock[] = []): ResultadoFila | null {
  const celda = (c: Campo) => (mapeo[c] === undefined ? undefined : celdas[mapeo[c]!])
  const codigo = textoCelda(celda('codigo')) || textoCelda(celda('codigo_alt'))
  const nombre = textoCelda(celda('nombre')).replace(/\s+/g, ' ')
  if (!codigo && !nombre) return null // fila vacía
  if (!codigo) return { ok: false, fila: numeroFila, motivo: 'Sin código' }
  if (codigo.length > 64) return { ok: false, fila: numeroFila, motivo: 'Código demasiado largo' }
  if (!nombre) return { ok: false, fila: numeroFila, motivo: 'Sin nombre' }

  const num = (c: Campo) => {
    const v = celda(c)
    return v === undefined || textoCelda(v) === '' ? null : parseNumero(v)
  }
  const costo = num('costo')
  const precio = num('precio')
  const stockCrudo = num('stock')
  if (mapeo.costo !== undefined && textoCelda(celda('costo')) !== '' && costo === null)
    return { ok: false, fila: numeroFila, motivo: 'Costo no es un número' }
  if (mapeo.precio !== undefined && textoCelda(celda('precio')) !== '' && precio === null)
    return { ok: false, fila: numeroFila, motivo: 'Precio no es un número' }
  if ((costo ?? 0) < 0 || (precio ?? 0) < 0) return { ok: false, fila: numeroFila, motivo: 'Precio o costo negativo' }

  const talle = textoCelda(celda('talle')).replace(/\s+/g, ' ').slice(0, 30) || null
  const color = textoCelda(celda('color')).replace(/\s+/g, ' ').slice(0, 30) || null
  let articulo: string | null = null
  let nombreFinal = nombre
  if (talle || color) {
    // El nombre del artículo es la descripción sin el color ni el talle (Dux a veces los repite al final).
    let base = nombre
    for (const x of [talle, color, talle]) {
      if (!x) continue
      const re = new RegExp(`[\\s\\-/,]+${x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
      base = base.replace(re, '').trim()
    }
    articulo = (base || nombre).slice(0, 150)
    nombreFinal = [articulo, color, talle].filter(Boolean).join(' ')
  }

  return {
    ok: true,
    fila: {
      fila: numeroFila,
      codigo,
      nombre: nombreFinal.slice(0, 200),
      talle,
      color,
      articulo,
      categoria: textoCelda(celda('categoria')).replace(/\s+/g, ' ').slice(0, 80) || null,
      costo: costo === null ? null : Math.round(costo * 100) / 100,
      precio: precio === null ? null : Math.round(precio * 100) / 100,
      stock: stockCrudo === null ? null : Math.trunc(stockCrudo),
      ...(columnasStock.length
        ? {
            stocks: columnasStock.map((c) => {
              const v = celdas[c.indice]
              const n = textoCelda(v) === '' ? null : parseNumero(v)
              return n === null ? null : Math.trunc(n)
            }),
          }
        : {}),
    },
  }
}

// Rubro a partir del nombre, para planillas de Dux sin categoría (accesorios de celular).
const RUBROS: [RegExp, string][] = [
  [/cubrecamara|\b(templado|vidrio|protector) (de )?camara\b|\bcamara\b.*\btemplado\b|^templado camara/, 'Protectores de cámara'],
  [/\b(funda|fundas|silicona|silicon|case|flip|carcasa)\b/, 'Fundas'],
  [/\b(vidrio|templado|hidrogel|ceramico)\b/, 'Vidrios templados'],
  [/\b(cargador|fuente)\b/, 'Cargadores'],
  [/\b(cable|usb)\b/, 'Cables'],
  [/\b(adaptador|otg)\b/, 'Adaptadores'],
  [/\b(auricular|auriculares|earbuds|headset)\b/, 'Auriculares'],
  [/\b(pop ?socket|popsocket|pop)\b/, 'Pop sockets'],
  [/\b(soporte|holder)\b/, 'Soportes'],
  [/\b(malla|pulsera|reloj|band)\b/, 'Mallas y relojes'],
  [/\b(memoria|pendrive|micro ?sd)\b/, 'Memorias y pendrives'],
]
export function rubroPorNombre(nombre: string): string | null {
  const n = normalizar(nombre)
  return RUBROS.find(([re]) => re.test(n))?.[1] ?? null
}

const palabras = (s: string) => s.split(' ').filter(Boolean)
const aCodigo = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, 20)

/**
 * Dux repite el código en las variantes de color ("BRILLANTINA2 … XS NEGRO", "BRILLANTINA2 … XS BLANCO").
 * Se agrupan en un producto con variantes: lo común del nombre es el producto, lo que cambia al final es el color,
 * y cada variante queda con su propio código (BRILLANTINA2-NEGRO) y el de Dux como origen.
 * Devuelve null si los nombres no se pueden separar (son iguales).
 */
export function separarVariantesDux(grupo: FilaImport[]): FilaImport[] | null {
  const ws = grupo.map((f) => palabras(f.nombre))
  let comun = 0
  while (ws.every((w) => comun < w.length - 1 && w[comun].toLowerCase() === ws[0][comun].toLowerCase())) comun++
  if (comun === 0) return null
  const colas = ws.map((w) => w.slice(comun).join(' '))
  if (new Set(colas.map((c) => c.toLowerCase())).size !== colas.length) return null
  const base = ws[0].slice(0, comun).join(' ')
  const usados = new Set<string>()
  return grupo.map((f, i) => {
    let codigo = `${f.codigo}-${aCodigo(colas[i]) || i + 1}`.slice(0, 64)
    for (let n = 2; usados.has(codigo.toLowerCase()); n++) codigo = `${f.codigo}-${aCodigo(colas[i])}${n}`
    usados.add(codigo.toLowerCase())
    return { ...f, codigo, codigo_origen: f.codigo, articulo: base.slice(0, 150), color: colas[i].slice(0, 30), talle: null }
  })
}

/** Lee todas las filas de datos y separa las válidas de las que tienen problemas. */
export function leerPlanilla(filas: unknown[][], encabezado: number, mapeo: Mapeo, columnasStock: ColumnaStock[] = []) {
  const validas: FilaImport[] = []
  const errores: { fila: number; motivo: string }[] = []
  const vistos = new Map<string, number>()
  const variantes = new Map<string, number>()
  const leidas: FilaImport[] = []
  for (let i = encabezado + 1; i < filas.length; i++) {
    const r = leerFila(filas[i] ?? [], mapeo, i + 1, columnasStock)
    if (!r) continue
    if (!r.ok) {
      errores.push({ fila: r.fila, motivo: r.motivo })
      continue
    }
    leidas.push(r.fila)
  }
  // Códigos repetidos sin columnas de talle/color: variantes de Dux (mismo código, distinto color al final del nombre).
  if (mapeo.talle === undefined && mapeo.color === undefined) {
    const grupos = new Map<string, FilaImport[]>()
    for (const f of leidas) grupos.set(f.codigo.toLowerCase(), [...(grupos.get(f.codigo.toLowerCase()) ?? []), f])
    for (const g of grupos.values()) {
      if (g.length < 2) continue
      const separadas = separarVariantesDux(g)
      if (separadas) g.forEach((f, i) => Object.assign(f, separadas[i]))
    }
  }
  // Sin columna de categoría: se deduce del nombre (FUNDA → Fundas, VIDRIO → Vidrios templados…).
  if (mapeo.categoria === undefined) for (const f of leidas) f.categoria = rubroPorNombre(f.nombre)
  for (const fila of leidas) {
    const r = { fila }
    const clave = r.fila.codigo.toLowerCase()
    if (vistos.has(clave)) {
      errores.push({ fila: r.fila.fila, motivo: `Código repetido (ya está en la fila ${vistos.get(clave)})` })
      continue
    }
    vistos.set(clave, r.fila.fila)
    if (r.fila.articulo) {
      const variante = `${r.fila.articulo}|${r.fila.color ?? ''}|${r.fila.talle ?? ''}`.toLowerCase()
      if (variantes.has(variante)) {
        errores.push({ fila: r.fila.fila, motivo: `Modelo y color repetidos para el mismo producto (fila ${variantes.get(variante)})` })
        continue
      }
      variantes.set(variante, r.fila.fila)
    }
    validas.push(r.fila)
  }
  errores.sort((a, b) => a.fila - b.fila)
  return { validas, errores }
}
