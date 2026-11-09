'use client'

import { useState, useTransition } from 'react'
import { Aviso, Boton } from '@/components/ui'
import { formatoPesos } from '@/lib/formato'
import { aCentavos, aPesos } from '@/lib/venta-calculo'
import { ventaParaCambio, type VentaParaCambio } from './actions'

export type CambioCarrito = {
  ventaId: number
  items: { ventaItemId: number; nombre: string; cantidad: number; unitario: number }[]
  /** En centavos. */
  total: number
}

/** Cambio de producto: elegir qué devuelve de una venta anterior. */
export function ElegirCambio({ alUsar, alCerrar }: { alUsar: (c: CambioCarrito, venta: VentaParaCambio) => void; alCerrar: () => void }) {
  const [q, setQ] = useState('')
  const [venta, setVenta] = useState<VentaParaCambio | null>(null)
  const [cantidades, setCantidades] = useState<Record<number, number>>({})
  const [error, setError] = useState<string | null>(null)
  const [buscando, iniciar] = useTransition()

  const buscar = () =>
    iniciar(async () => {
      setError(null)
      const r = await ventaParaCambio(q)
      if (r.venta) {
        setVenta(r.venta)
        // Si hay una sola prenda, ya queda marcada.
        setCantidades(r.venta.items.length === 1 && r.venta.items[0].disponibles === 1 ? { [r.venta.items[0].ventaItemId]: 1 } : {})
      } else setError(r.error ?? 'No se encontró.')
    })

  const elegidos = venta?.items.filter((i) => (cantidades[i.ventaItemId] ?? 0) > 0) ?? []
  const total = elegidos.reduce((a, i) => a + aCentavos(i.unitario) * cantidades[i.ventaItemId], 0)

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-tinta/40 sm:items-center sm:p-4" role="dialog" aria-modal aria-label="Cambio de producto">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-papel p-5 shadow-xl sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Cambio de producto</h2>
          <button type="button" onClick={alCerrar} className="rounded-lg px-3 py-1.5 text-sm text-tinta-suave hover:bg-fondo">
            Cerrar
          </button>
        </div>
        <p className="mb-3 text-sm text-tinta-suave">Escaneá el ticket de cambio (o escribí el número de venta) y marcá lo que trae para cambiar.</p>
        <div className="flex gap-2">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                buscar()
              }
            }}
            placeholder="Ticket o N.º de venta"
            aria-label="Ticket o número de venta"
            className="h-12 min-w-0 flex-1 rounded-xl border border-linea bg-fondo px-4 font-mono focus:border-marca focus:bg-papel focus:outline-none"
          />
          <Boton onClick={buscar} disabled={buscando || !q.trim()} className="h-12">
            Buscar
          </Boton>
        </div>
        {error && (
          <div className="mt-3">
            <Aviso tipo="error">{error}</Aviso>
          </div>
        )}
        {venta && (
          <>
            <p className="mt-4 text-sm font-medium">
              Venta N.º {venta.ventaId}
              {venta.cliente ? `, de ${venta.cliente.nombre}` : ''}
            </p>
            <ul className="mt-2 divide-y divide-linea rounded-xl border border-linea">
              {venta.items.map((i) => (
                <li key={i.ventaItemId} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{i.nombre}</span>
                    <span className="num text-xs text-apagado">{formatoPesos(i.unitario)} c/u</span>
                  </span>
                  <select
                    value={cantidades[i.ventaItemId] ?? 0}
                    onChange={(e) => setCantidades({ ...cantidades, [i.ventaItemId]: Number(e.target.value) })}
                    aria-label={`Unidades que cambia de ${i.nombre}`}
                    className="h-10 rounded-lg border border-linea px-2 text-sm"
                  >
                    {Array.from({ length: i.disponibles + 1 }, (_, n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="text-sm">
                Vale <b className="num">{formatoPesos(aPesos(total))}</b>
              </span>
              <Boton
                disabled={!total}
                onClick={() =>
                  alUsar(
                    {
                      ventaId: venta.ventaId,
                      items: elegidos.map((i) => ({ ventaItemId: i.ventaItemId, nombre: i.nombre, cantidad: cantidades[i.ventaItemId], unitario: i.unitario })),
                      total,
                    },
                    venta,
                  )
                }
              >
                Usar en el cambio
              </Boton>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
