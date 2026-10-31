/** Dígito verificador EAN-13 para los primeros 12 dígitos. */
export function digitoEan13(doce: string): number {
  let suma = 0
  for (let i = 0; i < 12; i++) suma += Number(doce[i]) * (i % 2 === 0 ? 1 : 3)
  return (10 - (suma % 10)) % 10
}

export function esEan13(codigo: string): boolean {
  return /^\d{13}$/.test(codigo) && digitoEan13(codigo.slice(0, 12)) === Number(codigo[12])
}

/** Código interno EAN-13 del rango de uso en el local ("20" + número + verificador). */
export function codigoInterno(numero: number): string {
  const doce = `20${String(numero).padStart(10, '0')}`
  return doce + digitoEan13(doce)
}
