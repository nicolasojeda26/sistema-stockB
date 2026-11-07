'use client'

import { useEffect, useRef } from 'react'
import JsBarcode from 'jsbarcode'

/** Código de barras CODE128 (para el ticket de cambio: se escanea en la caja). */
export function CodigoBarras({ valor, alto = 40 }: { valor: string; alto?: number }) {
  const ref = useRef<SVGSVGElement>(null)
  useEffect(() => {
    if (ref.current) JsBarcode(ref.current, valor, { format: 'CODE128', height: alto, width: 1.6, fontSize: 11, margin: 0 })
  }, [valor, alto])
  return <svg ref={ref} aria-label={`Código ${valor}`} className="mx-auto max-w-full" />
}
