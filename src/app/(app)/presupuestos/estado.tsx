'use client'

import { useState, useTransition } from 'react'
import { Aviso, Boton } from '@/components/ui'
import { cambiarEstadoPresupuesto } from './actions'

export function EstadoPresupuesto({ id, estado }: { id: number; estado: 'abierto' | 'aceptado' | 'rechazado' | 'cancelado' }) {
  const [error, setError] = useState<string | null>(null)
  const [ocupado, iniciar] = useTransition()
  const cambiar = (nuevo: typeof estado) => iniciar(async () => {
    const r = await cambiarEstadoPresupuesto(id, nuevo)
    if (r.error) setError(r.error)
  })

  if (estado === 'cancelado') return null
  return (
    <div className="space-y-3 print:hidden">
      {error && <Aviso tipo="error">{error}</Aviso>}
      <div className="flex flex-wrap gap-2">
        {estado === 'abierto' && <Boton type="button" disabled={ocupado} onClick={() => cambiar('aceptado')}>Marcar aceptado</Boton>}
        {estado === 'abierto' && <Boton type="button" variante="secundario" disabled={ocupado} onClick={() => cambiar('rechazado')}>Rechazar</Boton>}
        {estado === 'rechazado' && <Boton type="button" variante="secundario" disabled={ocupado} onClick={() => cambiar('abierto')}>Reabrir</Boton>}
        {(estado === 'abierto' || estado === 'rechazado') && <Boton type="button" variante="peligro" disabled={ocupado} onClick={() => { if (confirm('¿Cancelar este presupuesto?')) cambiar('cancelado') }}>Cancelar</Boton>}
      </div>
    </div>
  )
}
