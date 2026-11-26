'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { cambiarEstado } from '../reparaciones/actions'

/** Cambiar el estado desde la lista, sin abrir la ficha. Para marcarla lista (hace falta el importe) se abre la ficha. */
export function CambioRapido({ id, etapaId, etapas, listo }: { id: number; etapaId: number | null; etapas: { id: number; nombre: string }[]; listo: boolean }) {
  const router = useRouter()
  const [elegida, setElegida] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState(false)
  const [guardando, iniciar] = useTransition()
  const opciones = etapas.filter((e) => e.id !== etapaId)

  const guardar = () => {
    if (!elegida) return
    setError(null)
    iniciar(async () => {
      const r = await cambiarEstado(id, { accion: 'etapa', etapaId: Number(elegida) })
      if (r.error) return setError(r.error)
      setElegida('')
      setHecho(true)
      router.refresh()
      setTimeout(() => setHecho(false), 2500)
    })
  }

  return (
    <div className="space-y-2 border-t border-linea pt-3">
      <div className="flex gap-2">
        <select
          value={elegida}
          onChange={(e) => setElegida(e.target.value)}
          aria-label={`Nuevo estado de ${id}`}
          className="h-10 min-w-0 flex-1 rounded-lg border border-linea bg-papel px-2 text-sm focus:border-marca focus:outline-none"
        >
          <option value="">{listo ? 'Reabrir: pasar a…' : 'Pasar a…'}</option>
          {opciones.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nombre}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={guardar}
          disabled={!elegida || guardando}
          className="h-10 shrink-0 rounded-lg bg-marca px-4 text-sm font-semibold text-white hover:bg-marca-oscura disabled:opacity-40"
        >
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        {!listo && (
          <>
            <Link href={`/reparaciones/${id}?hacer=listo`} className="font-semibold text-ok hover:underline">
              ✓ Está lista
            </Link>
            <Link href={`/reparaciones/${id}?hacer=sin_reparacion`} className="font-medium text-tinta-suave hover:text-tinta hover:underline">
              No se repara
            </Link>
          </>
        )}
        {listo && (
          <Link href={`/reparaciones/${id}?hacer=listo`} className="font-medium text-tinta-suave hover:text-tinta hover:underline">
            Cambiar importe o técnico
          </Link>
        )}
        <Link href={`/reparaciones/${id}`} className="ml-auto font-medium text-marca hover:underline">
          Ver ficha
        </Link>
        {hecho && (
          <span className="w-full text-xs font-semibold text-ok" role="status">
            Estado actualizado: la sucursal y el cliente ya lo ven.
          </span>
        )}
        {error && (
          <span className="w-full text-xs font-semibold text-error" role="alert">
            {error}
          </span>
        )}
      </div>
    </div>
  )
}
