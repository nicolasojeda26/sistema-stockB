'use client'

import { useState } from 'react'

export type Origen = { sucursalId: number; sucursal: string; entrega: 'envio' | 'retira' }
type Otra = { sucursal_id: number; sucursal: string; stock: number }

/** Resumen corto del stock en otras sucursales: "Maipú 3 · Catamarca 815 1". */
export function StockOtras({ otras, max = 3 }: { otras?: Otra[]; max?: number }) {
  if (!otras?.length) return null
  const resto = otras.length - max
  return (
    <span className="text-tinta-suave">
      Otras: {otras.slice(0, max).map((o) => `${o.sucursal} ${o.stock}`).join(' · ')}
      {resto > 0 ? ` · +${resto}` : ''}
    </span>
  )
}

/** Elegir de qué sucursal sale el producto y si lo mandan o lo retira allá. */
export function ElegirOrigen({
  nombre,
  otras,
  origen,
  alCambiar,
}: {
  nombre: string
  otras: Otra[]
  origen: Origen | null | undefined
  alCambiar: (o: Origen | null) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const [sucursalId, setSucursalId] = useState<number>(origen?.sucursalId ?? otras[0]?.sucursal_id ?? 0)
  const [entrega, setEntrega] = useState<'envio' | 'retira'>(origen?.entrega ?? 'envio')

  if (origen && !abierto)
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5 rounded-md bg-alerta-claro px-2 py-1 text-xs font-medium text-alerta">
        Sale de {origen.sucursal} · {origen.entrega === 'envio' ? 'lo mandan' : 'retira allá'}
        <button type="button" onClick={() => setAbierto(true)} className="underline">
          Cambiar
        </button>
        <button type="button" onClick={() => alCambiar(null)} className="underline" aria-label={`Vender ${nombre} desde este local`}>
          Quitar
        </button>
      </span>
    )
  if (!abierto)
    return (
      <button type="button" onClick={() => setAbierto(true)} className="text-xs font-medium text-marca hover:underline">
        Vender desde otra sucursal
      </button>
    )
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 rounded-lg border border-linea bg-fondo p-2 text-xs" role="group" aria-label={`Origen de ${nombre}`}>
      <select
        value={sucursalId}
        onChange={(e) => setSucursalId(Number(e.target.value))}
        aria-label="Sucursal de donde sale"
        className="h-9 rounded-md border border-linea bg-papel px-2 text-sm"
      >
        {otras.map((o) => (
          <option key={o.sucursal_id} value={o.sucursal_id}>
            {o.sucursal} ({o.stock})
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1">
        <input type="radio" name={`entrega-${nombre}`} checked={entrega === 'envio'} onChange={() => setEntrega('envio')} className="accent-marca" />
        Lo mandan acá
      </label>
      <label className="flex items-center gap-1">
        <input type="radio" name={`entrega-${nombre}`} checked={entrega === 'retira'} onChange={() => setEntrega('retira')} className="accent-marca" />
        Retira allá
      </label>
      <button
        type="button"
        onClick={() => {
          const o = otras.find((x) => x.sucursal_id === sucursalId)
          if (o) alCambiar({ sucursalId: o.sucursal_id, sucursal: o.sucursal, entrega })
          setAbierto(false)
        }}
        className="h-9 rounded-md bg-tinta px-3 text-sm font-semibold text-papel"
      >
        Listo
      </button>
      <button type="button" onClick={() => setAbierto(false)} className="h-9 px-2 text-sm text-tinta-suave">
        Cancelar
      </button>
    </div>
  )
}
