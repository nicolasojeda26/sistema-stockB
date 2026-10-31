'use client'

import { useEffect } from 'react'

export function Imprimir({ automatico }: { automatico: boolean }) {
  useEffect(() => {
    if (automatico) setTimeout(() => window.print(), 300)
  }, [automatico])
  return (
    <>
      <button onClick={() => window.print()} className="h-10 rounded-lg bg-marca px-4 text-sm font-medium text-white hover:bg-marca-oscura">
        Imprimir
      </button>
      <button onClick={() => window.close()} className="h-10 rounded-lg border border-linea bg-papel px-4 text-sm font-medium hover:bg-fondo">
        Cerrar
      </button>
    </>
  )
}
