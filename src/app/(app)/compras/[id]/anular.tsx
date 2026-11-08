'use client'

import { useState, useTransition } from 'react'
import { Aviso, Boton, Campo, Input } from '@/components/ui'
import { anular } from '../actions'

export function AnularCompra({ compraId }: { compraId: number }) {
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, iniciar] = useTransition()
  return (
    <div className="space-y-3 p-5">
      <p className="text-sm text-tinta-suave">Saca del stock lo que había entrado y descuenta la deuda con el proveedor. Si ya la pagaste, ese pago queda a tu favor.</p>
      <Campo etiqueta="Motivo">
        <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: la cargué dos veces" />
      </Campo>
      {error && <Aviso tipo="error">{error}</Aviso>}
      <Boton
        variante="peligro"
        disabled={ocupado || !motivo.trim()}
        onClick={() => {
          if (!confirm('¿Anular la compra? Se descuenta el stock que había ingresado.')) return
          iniciar(async () => {
            const r = await anular(compraId, motivo)
            setError(r.error ?? null)
          })
        }}
      >
        Anular compra
      </Boton>
    </div>
  )
}
