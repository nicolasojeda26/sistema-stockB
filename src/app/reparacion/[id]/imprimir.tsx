'use client'

import { useEffect } from 'react'

/** Botones de la hoja de impresión (no salen en el papel). */
export function BarraImprimir({ automatico, volver }: { automatico: boolean; volver: string }) {
  useEffect(() => {
    if (automatico) {
      const t = setTimeout(() => window.print(), 400)
      return () => clearTimeout(t)
    }
  }, [automatico])
  return (
    <div className="mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-2 px-4 print:hidden">
      <a href={volver} className="inline-flex h-10 items-center rounded-lg border border-linea bg-papel px-4 text-sm font-medium hover:bg-fondo">
        ← Volver a la reparación
      </a>
      <button onClick={() => window.print()} className="h-10 rounded-lg bg-marca px-5 text-sm font-semibold text-white hover:bg-marca-oscura">
        Imprimir
      </button>
    </div>
  )
}
