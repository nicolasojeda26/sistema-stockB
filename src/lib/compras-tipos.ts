// Constantes y cálculos de compras que también usa el navegador.
import { aCentavos, aPesos } from './venta-calculo'

export type MedioProveedor = 'efectivo' | 'transferencia' | 'cheque' | 'debito' | 'credito'
export const MEDIOS_PROVEEDOR: Record<MedioProveedor, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  cheque: 'Cheque',
  debito: 'Débito',
  credito: 'Tarjeta de crédito',
}
export const TIPOS_COMPROBANTE = { A: 'Factura A', B: 'Factura B', C: 'Factura C', X: 'Remito / sin factura' } as const
export type TipoComprobante = keyof typeof TIPOS_COMPROBANTE

/** Cálculo de los totales de una compra (en pesos, redondeado a centavos). */
export function totalesCompra(items: { cantidad: number; costo: number }[], ivaPct: number, percepciones: number) {
  const netoC = items.reduce((a, i) => a + aCentavos(i.costo) * i.cantidad, 0)
  const ivaC = Math.round((netoC * ivaPct) / 100)
  const percC = aCentavos(percepciones)
  return { neto: aPesos(netoC), iva: aPesos(ivaC), percepciones: aPesos(percC), total: aPesos(netoC + ivaC + percC) }
}

export const MEDIOS_GASTO = { efectivo: 'Efectivo', transferencia: 'Transferencia', debito: 'Débito', credito: 'Tarjeta de crédito', cheque: 'Cheque' } as const
export type MedioGasto = keyof typeof MEDIOS_GASTO
