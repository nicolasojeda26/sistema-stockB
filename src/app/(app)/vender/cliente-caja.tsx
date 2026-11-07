'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { formatoPesos } from '@/lib/formato'
import { buscarClientes, crearClienteRapido, type ClienteBuscado } from '../clientes/actions'

/** Elegir (o cargar) la clienta de la venta. */
export function ClienteCaja({ cliente, setCliente }: { cliente: ClienteBuscado | null; setCliente: (c: ClienteBuscado | null) => void }) {
  const [abierto, setAbierto] = useState(false)
  const [q, setQ] = useState('')
  const [resultados, setResultados] = useState<ClienteBuscado[]>([])
  const [nueva, setNueva] = useState(false)
  const [telefono, setTelefono] = useState('')
  const [doc, setDoc] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, iniciar] = useTransition()
  const pedido = useRef(0)

  useEffect(() => {
    if (!abierto) return
    const n = ++pedido.current
    const t = setTimeout(async () => {
      const r = await buscarClientes(q)
      if (n === pedido.current) setResultados(r)
    }, 200)
    return () => clearTimeout(t)
  }, [q, abierto])

  if (cliente) {
    const s = Number(cliente.saldo)
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-marca/30 bg-marca-clara/60 px-4 py-2.5">
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold" data-testid="clienta">
            {cliente.nombre}
          </span>
          <span className={`block text-xs ${s > 0 ? 'text-error' : s < 0 ? 'text-ok' : 'text-tinta-suave'}`}>
            {s > 0 ? `Debe ${formatoPesos(s)}` : s < 0 ? `Tiene ${formatoPesos(-s)} a favor` : 'Cuenta al día'}
          </span>
        </span>
        <button type="button" onClick={() => setCliente(null)} className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-tinta-suave hover:bg-papel">
          Quitar
        </button>
      </div>
    )
  }

  if (!abierto)
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-linea text-sm font-medium text-tinta-suave hover:border-marca hover:text-marca"
      >
        + Clienta (para cuenta corriente, apartar o cambios)
      </button>
    )

  return (
    <div className="rounded-xl border border-linea bg-papel p-3">
      {!nueva ? (
        <>
          <div className="flex gap-2">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nombre, teléfono o DNI"
              aria-label="Buscar clienta"
              className="h-10 min-w-0 flex-1 rounded-lg border border-linea px-3 text-sm focus:border-marca focus:outline-none"
            />
            <button type="button" onClick={() => setAbierto(false)} className="rounded-lg px-2 text-sm text-tinta-suave hover:bg-fondo">
              Cerrar
            </button>
          </div>
          <ul className="mt-2 max-h-56 overflow-y-auto">
            {resultados.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    setCliente(c)
                    setAbierto(false)
                    setQ('')
                  }}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-marca-clara"
                >
                  <span className="min-w-0 truncate font-medium">{c.nombre}</span>
                  <span className="shrink-0 text-xs text-apagado">{c.telefono ?? c.doc_nro ?? ''}</span>
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => {
              setNueva(true)
              setError(null)
            }}
            className="mt-1 text-sm font-semibold text-marca hover:underline"
          >
            + Cargar clienta nueva{q.trim() && !/^\d+$/.test(q.trim()) ? `: ${q.trim()}` : ''}
          </button>
        </>
      ) : (
        <div className="space-y-2">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nombre y apellido"
            aria-label="Nombre de la clienta nueva"
            className="h-10 w-full rounded-lg border border-linea px-3 text-sm"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="Teléfono"
              inputMode="tel"
              aria-label="Teléfono de la clienta nueva"
              className="h-10 min-w-0 rounded-lg border border-linea px-3 text-sm"
            />
            <input
              value={doc}
              onChange={(e) => setDoc(e.target.value)}
              placeholder="DNI (opcional)"
              inputMode="numeric"
              aria-label="DNI de la clienta nueva"
              className="h-10 min-w-0 rounded-lg border border-linea px-3 text-sm"
            />
          </div>
          {error && <p className="text-sm text-error">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={guardando}
              onClick={() =>
                iniciar(async () => {
                  const r = await crearClienteRapido({ nombre: q, telefono, docNro: doc })
                  if (r.cliente) {
                    setCliente(r.cliente)
                    setAbierto(false)
                    setNueva(false)
                    setQ('')
                    setTelefono('')
                    setDoc('')
                  } else setError(r.error ?? 'No se pudo guardar.')
                })
              }
              className="h-10 flex-1 rounded-lg bg-marca text-sm font-semibold text-white hover:bg-marca-oscura disabled:opacity-60"
            >
              Guardar clienta
            </button>
            <button type="button" onClick={() => setNueva(false)} className="h-10 rounded-lg border border-linea px-3 text-sm">
              Volver
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
