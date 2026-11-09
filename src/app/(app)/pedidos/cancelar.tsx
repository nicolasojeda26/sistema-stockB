'use client'

import { useState, useTransition } from 'react'
import { cancelar } from './actions'

export function CancelarPedido({ id }: { id: number }) {
  const [error, setError] = useState<string | null>(null)
  const [ocupado, iniciar] = useTransition()
  return (
    <span className="inline-flex items-center gap-2">
      {error && <span className="text-xs text-error">{error}</span>}
      <button
        disabled={ocupado}
        onClick={() => {
          if (!confirm(`¿Cancelar el pedido N.º ${id}?`)) return
          iniciar(async () => setError((await cancelar(id)).error ?? null))
        }}
        className="h-10 rounded-lg px-3 text-sm font-medium text-tinta-suave hover:bg-fondo hover:text-error"
      >
        Cancelar pedido
      </button>
    </span>
  )
}
