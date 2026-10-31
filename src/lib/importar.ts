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

export function leerFila(celdas: unknown[], mapeo: Mapeo, numeroFila: number): ResultadoFila | null {
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

  return {
    ok: true,
    fila: {
      fila: numeroFila,
      codigo,
      nombre: nombre.slice(0, 200),
      categoria: textoCelda(celda('categoria')).replace(/\s+/g, ' ').slice(0, 80) || null,
      costo: costo === null ? null : Math.round(costo * 100) / 100,
      precio: precio === null ? null : Math.round(precio * 100) / 100,
      stock: stockCrudo === null ? null : Math.trunc(stockCrudo),
    },
  }
}

/** Lee todas las filas de datos y separa las válidas de las que tienen problemas. */
export function leerPlanilla(filas: unknown[][], encabezado: number, mapeo: Mapeo) {
  const validas: FilaImport[] = []
  const errores: { fila: number; motivo: string }[] = []
  const vistos = new Map<string, number>()
  for (let i = encabezado + 1; i < filas.length; i++) {
    const r = leerFila(filas[i] ?? [], mapeo, i + 1)
    if (!r) continue
    if (!r.ok) {
      errores.push({ fila: r.fila, motivo: r.motivo })
      continue
    }
    const clave = r.fila.codigo.toLowerCase()
    if (vistos.has(clave)) {
      errores.push({ fila: r.fila.fila, motivo: `Código repetido (ya está en la fila ${vistos.get(clave)})` })
      continue
    }
    vistos.set(clave, r.fila.fila)
    validas.push(r.fila)
  }
  return { validas, errores }
}
