'use client'

import { useEffect, useState, useTransition } from 'react'
import { Aviso } from '@/components/ui'
import { formatoPesos } from '@/lib/formato'
import { buscarReparaciones, type ReparacionVenta } from './actions'

/** Elegir una reparación lista para cobrarla (se entrega el equipo con la venta). */
export function ElegirReparacion({
  enCarrito,
  alElegir,
  alCerrar,
}: {
  enCarrito: number[]
  alElegir: (r: ReparacionVenta) => void
  alCerrar: () => void
}) {
  const [q, setQ] = useState('')
  const [lista, setLista] = useState<ReparacionVenta[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [buscando, iniciar] = useTransition()

  const buscar = (texto: string) =>
    iniciar(async () => {
      const r = await buscarReparaciones(texto)
      setError(r.error ?? null)
      setLista(r.reparaciones)
    })

  // Al abrir, muestra todas las que están para retirar.
  useEffect(() => {
    buscar('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-tinta/40 sm:items-center sm:p-4" role="dialog" aria-modal aria-label="Cobrar reparación">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-papel p-5 shadow-xl sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Cobrar reparación</h2>
          <button type="button" onClick={alCerrar} className="rounded-lg px-3 py-1.5 text-sm text-tinta-suave hover:bg-fondo">
            Cerrar
          </button>
        </div>
        <p className="mb-3 text-sm text-tinta-suave">Equipos listos para retirar en este local. Al cobrar, la reparación queda entregada.</p>
        <input
          autoFocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            buscar(e.target.value)
          }}
          placeholder="N.º (R-00012), cliente, teléfono o equipo"
          aria-label="Buscar reparación"
          className="h-11 w-full rounded-lg border border-linea bg-papel px-3 text-sm focus:border-marca focus:outline-none focus:ring-4 focus:ring-marca/10"
        />
        {error && (
          <div className="mt-3">
            <Aviso tipo="error">{error}</Aviso>
          </div>
        )}
        <ul className="mt-3 divide-y divide-linea rounded-xl border border-linea">
          {lista === null || (buscando && !lista.length) ? (
            <li className="px-4 py-6 text-center text-sm text-apagado">Buscando…</li>
          ) : lista.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-apagado">{q ? 'No hay reparaciones listas con esa búsqueda.' : 'No hay equipos listos para retirar.'}</li>
          ) : (
            lista.map((r) => {
              const ya = enCarrito.includes(r.id)
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    disabled={ya}
                    onClick={() => alElegir(r)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-marca-clara disabled:opacity-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        <span className="font-mono text-sm text-marca">{r.codigo}</span> · {r.cliente}
                      </span>
                      <span className="block truncate text-xs text-tinta-suave">{r.nombre.split(' · ').slice(1).join(' · ')}</span>
                    </span>
                    <span className="num shrink-0 font-semibold">{ya ? 'En el carrito' : formatoPesos(r.precio)}</span>
                  </button>
                </li>
              )
            })
          )}
        </ul>
      </div>
    </div>
  )
}
