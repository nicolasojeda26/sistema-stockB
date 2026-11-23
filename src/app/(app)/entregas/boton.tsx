'use client'

import { useState, useTransition } from 'react'
import { Boton } from '@/components/ui'
import { avanzar } from './actions'

export function BotonEntrega({ id, texto }: { id: number; texto: string }) {
  const [error, setError] = useState<string | null>(null)
  const [enviando, iniciar] = useTransition()
  return (
    <div className="flex flex-col items-end gap-1">
      <Boton
        variante="secundario"
        disabled={enviando}
        onClick={() =>
          iniciar(async () => {
            const r = await avanzar(id)
            setError(r.error ?? null)
          })
        }
      >
        {enviando ? 'Guardando…' : texto}
      </Boton>
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  )
}
