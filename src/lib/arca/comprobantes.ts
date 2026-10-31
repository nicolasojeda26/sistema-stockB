// Reglas de ARCA que no dependen de la conexión: qué comprobante corresponde,
// cómo se arman los importes y el código QR (RG 4892). Código puro y testeable.

/** Condición frente al IVA de quien factura. */
export type CondicionEmisor = 'RI' | 'MT' | 'EX'
export const CONDICIONES_EMISOR: Record<CondicionEmisor, string> = {
  RI: 'Responsable Inscripto',
  MT: 'Monotributo',
  EX: 'IVA Exento',
}

/** Condición frente al IVA del cliente (tabla FEParamGetCondicionIvaReceptor). */
export const CONDICIONES_RECEPTOR: Record<number, string> = {
  5: 'Consumidor Final',
  1: 'IVA Responsable Inscripto',
  6: 'Responsable Monotributo',
  13: 'Monotributista Social',
  16: 'Monotributo Trabajador Independiente Promovido',
  4: 'IVA Sujeto Exento',
  15: 'IVA No Alcanzado',
}

/** Tipos de documento del cliente. */
export const DOC_TIPOS: Record<number, string> = { 99: 'Sin identificar', 96: 'DNI', 80: 'CUIT', 86: 'CUIL' }

export const TIPOS_CBTE: Record<number, { letra: 'A' | 'B' | 'C'; nombre: string; nc: boolean }> = {
  1: { letra: 'A', nombre: 'Factura A', nc: false },
  6: { letra: 'B', nombre: 'Factura B', nc: false },
  11: { letra: 'C', nombre: 'Factura C', nc: false },
  3: { letra: 'A', nombre: 'Nota de crédito A', nc: true },
  8: { letra: 'B', nombre: 'Nota de crédito B', nc: true },
  13: { letra: 'C', nombre: 'Nota de crédito C', nc: true },
}

/** Letra que corresponde: el monotributista y el exento emiten C; el inscripto, A a otro inscripto y B al resto. */
export function letraComprobante(emisor: CondicionEmisor, condicionReceptor: number): 'A' | 'B' | 'C' {
  if (emisor !== 'RI') return 'C'
  return condicionReceptor === 1 ? 'A' : 'B'
}

export function tipoComprobante(letra: 'A' | 'B' | 'C', notaCredito: boolean): number {
  const t = { A: [1, 3], B: [6, 8], C: [11, 13] }[letra]
  return notaCredito ? t[1] : t[0]
}

const c = (n: number) => Math.round(n * 100)
const p = (n: number) => n / 100

export type Importes = { total: number; neto: number; iva: number; alicuota: number | null }

/**
 * Importes del comprobante a partir del total cobrado (precios con IVA incluido).
 * En A y B el IVA se informa aparte (21 %); en C todo va como neto.
 */
export function importes(total: number, letra: 'A' | 'B' | 'C', alicuota = 21): Importes {
  if (letra === 'C') return { total, neto: total, iva: 0, alicuota: null }
  const neto = Math.round(c(total) / (1 + alicuota / 100))
  return { total, neto: p(neto), iva: p(c(total) - neto), alicuota }
}

/** Id de alícuota de ARCA. */
export const ID_ALICUOTA: Record<number, number> = { 0: 3, 10.5: 4, 21: 5, 27: 6, 5: 8, 2.5: 9 }

export type DatosQR = {
  fecha: string // AAAA-MM-DD
  cuit: number
  ptoVta: number
  tipoCmp: number
  nroCmp: number
  importe: number
  tipoDocRec: number
  nroDocRec: number
  cae: string
}

/** URL del código QR que va impreso en el comprobante (RG 4892). */
export function urlQR(d: DatosQR): string {
  const json = {
    ver: 1,
    fecha: d.fecha,
    cuit: d.cuit,
    ptoVta: d.ptoVta,
    tipoCmp: d.tipoCmp,
    nroCmp: d.nroCmp,
    importe: d.importe,
    moneda: 'PES',
    ctz: 1,
    tipoDocRec: d.tipoDocRec,
    nroDocRec: d.nroDocRec,
    tipoCodAut: 'E',
    codAut: Number(d.cae),
  }
  return `https://www.afip.gob.ar/fe/qr/?p=${Buffer.from(JSON.stringify(json)).toString('base64')}`
}

/** Valida un CUIT/CUIL con su dígito verificador. */
export function cuitValido(cuit: string): boolean {
  const s = cuit.replace(/\D/g, '')
  if (!/^\d{11}$/.test(s)) return false
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
  const suma = pesos.reduce((a, w, i) => a + w * Number(s[i]), 0)
  let dv = 11 - (suma % 11)
  if (dv === 11) dv = 0
  if (dv === 10) dv = 9
  return dv === Number(s[10])
}

export const formatoCuit = (cuit: string | number) => {
  const s = String(cuit).replace(/\D/g, '')
  return s.length === 11 ? `${s.slice(0, 2)}-${s.slice(2, 10)}-${s.slice(10)}` : s
}

/** Número de comprobante como se imprime: 00003-00001234. */
export const numeroComprobante = (ptoVta: number, numero: number) => `${String(ptoVta).padStart(5, '0')}-${String(numero).padStart(8, '0')}`
