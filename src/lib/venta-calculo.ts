// Cálculo de una venta, en centavos para no arrastrar errores de redondeo.
// Lo usan la pantalla (para mostrar) y el servidor (para guardar): dan lo mismo.

export type MedioPago = 'efectivo' | 'transferencia' | 'debito' | 'credito'
export const MEDIOS: Record<MedioPago, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  debito: 'Débito',
  credito: 'Crédito',
}

/** Medios que no son plata: cargar a la cuenta del cliente, o lo devuelto en un cambio. */
export type MedioVenta = MedioPago | 'cuenta_corriente' | 'cambio'
export const MEDIOS_VENTA: Record<MedioVenta, string> = {
  ...MEDIOS,
  cuenta_corriente: 'A cuenta del cliente',
  cambio: 'Cambio de producto',
}

/** Con qué precio se vende: lista (tarjeta), transferencia o efectivo. */
export type FormaPrecio = 'lista' | 'transferencia' | 'efectivo'
export const FORMAS_PRECIO: Record<FormaPrecio, string> = { lista: 'Lista', transferencia: 'Transferencia', efectivo: 'Efectivo' }
export type DescuentosPago = { transferencia: number; efectivo: number }
export type PreciosProducto = { precio: number | string; precio_transferencia?: number | string | null; precio_efectivo?: number | string | null }

/** Precio unitario según la forma: el precio propio del producto si tiene, si no la lista menos el % (redondeado al peso). */
export function precioSegunForma(p: PreciosProducto, forma: FormaPrecio, d: DescuentosPago): number {
  const lista = Number(p.precio)
  if (forma === 'lista') return lista
  const propio = forma === 'transferencia' ? p.precio_transferencia : p.precio_efectivo
  if (propio !== null && propio !== undefined && propio !== '') return Number(propio)
  return Math.round(lista * (1 - d[forma] / 100))
}

/** El precio de efectivo es solo si todo se paga en efectivo; el de transferencia, si se paga con transferencia o efectivo. */
export function formaPermitida(forma: FormaPrecio, medios: readonly string[]): boolean {
  if (forma === 'efectivo') return medios.every((m) => m === 'efectivo')
  if (forma === 'transferencia') return medios.every((m) => m === 'efectivo' || m === 'transferencia')
  return true
}

export type LineaCalculo = { precio: number; cantidad: number; descuentoPct: number }

export const aCentavos = (n: number) => Math.round(n * 100)
export const aPesos = (c: number) => c / 100

export function calcularVenta(lineas: LineaCalculo[], descuentoGlobalPct: number) {
  const subtotales = lineas.map((l) => Math.round(aCentavos(l.precio) * l.cantidad * (1 - l.descuentoPct / 100)))
  const bruto = lineas.reduce((a, l) => a + aCentavos(l.precio) * l.cantidad, 0)
  const neto = subtotales.reduce((a, b) => a + b, 0)
  const descuentoGlobal = Math.round((neto * descuentoGlobalPct) / 100)
  const total = neto - descuentoGlobal
  return {
    /** Subtotal de cada línea, ya con su descuento (centavos). */
    subtotales,
    /** Suma de precios × cantidades, sin descuentos (centavos). */
    bruto,
    /** Todo lo descontado, por línea y general (centavos). */
    descuento: bruto - total,
    total,
  }
}

/** Descuento efectivo de una línea combinando el suyo con el general (%). */
export function descuentoEfectivo(lineaPct: number, globalPct: number): number {
  return Math.round((1 - (1 - lineaPct / 100) * (1 - globalPct / 100)) * 10000) / 100
}

/** Montos de billetes razonables para ofrecer como "pagó con". */
export function montosSugeridos(totalCentavos: number): number[] {
  const total = Math.ceil(totalCentavos / 100)
  const opciones = new Set<number>([total])
  for (const paso of [1000, 2000, 5000, 10000, 20000]) {
    const m = Math.ceil(total / paso) * paso
    if (m > total) opciones.add(m)
  }
  return [...opciones].sort((a, b) => a - b).slice(0, 5)
}
