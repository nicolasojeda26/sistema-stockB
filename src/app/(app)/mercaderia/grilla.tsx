'use client'

import { useEffect, useRef, useState } from 'react'
import { Boton } from '@/components/ui'
import { buscarArticulos, variantesArticulo, type ArticuloBuscado, type VarianteLinea } from './actions'

/** Cargar cantidades de un artículo por talle y color, en una grilla. */
export function GrillaTalles({
  depositoId,
  articuloInicial,
  mostrarStock,
  alAgregar,
  alCerrar,
}: {
  depositoId: number | null
  articuloInicial?: number | null
  /** En transferencias y ajustes conviene ver cuánto hay en cada casillero. */
  mostrarStock: boolean
  alAgregar: (items: { producto: VarianteLinea; cantidad: number }[]) => void
  alCerrar: () => void
}) {
  const [q, setQ] = useState('')
  const [resultados, setResultados] = useState<ArticuloBuscado[]>([])
  const [articulo, setArticulo] = useState<{ nombre: string; variantes: VarianteLinea[] } | null>(null)
  const [cantidades, setCantidades] = useState<Record<number, string>>({})
  const [cargando, setCargando] = useState(false)
  const pedido = useRef(0)

  async function abrir(id: number) {
    setCargando(true)
    const r = await variantesArticulo(id, depositoId)
    setCargando(false)
    setArticulo(r)
    setCantidades({})
  }

  // Si viene de la ficha del artículo, abrirlo directamente (una sola vez, al montar).
  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => {
    if (articuloInicial) void abrir(articuloInicial)
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  useEffect(() => {
    const n = ++pedido.current
    const t = setTimeout(async () => {
      const r = await buscarArticulos(q)
      if (n === pedido.current) setResultados(r)
    }, 200)
    return () => clearTimeout(t)
  }, [q])

  const vs = articulo?.variantes ?? []
  const talles = [...new Map(vs.map((v) => [String(v.talle ?? ''), v])).values()].sort((a, b) => a.orden_talle - b.orden_talle).map((v) => v.talle)
  const colores = [...new Set(vs.map((v) => v.color))]
  const total = Object.values(cantidades).reduce((a, c) => a + (Number.parseInt(c, 10) || 0), 0)

  function agregar() {
    const items = vs
      .map((v) => ({ producto: v, cantidad: Number.parseInt(cantidades[v.id] ?? '', 10) || 0 }))
      .filter((i) => i.cantidad > 0)
    alAgregar(items)
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-tinta/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal aria-label="Cargar por talle y color">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl bg-papel p-5 shadow-xl sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{articulo ? articulo.nombre : 'Cargar por talle y color'}</h2>
          <button type="button" onClick={alCerrar} className="rounded-lg px-3 py-1.5 text-sm font-medium text-tinta-suave hover:bg-fondo">
            Cerrar
          </button>
        </div>

        {!articulo ? (
          <>
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscá el artículo por nombre"
              aria-label="Buscar artículo"
              className="h-12 w-full rounded-xl border border-linea bg-fondo px-4 focus:border-marca focus:bg-papel focus:outline-none"
            />
            <ul className="mt-3 divide-y divide-linea">
              {resultados.map((a) => (
                <li key={a.id}>
                  <button type="button" onClick={() => void abrir(a.id)} className="flex w-full items-center justify-between px-2 py-3 text-left hover:bg-fondo">
                    <span className="font-medium">{a.nombre}</span>
                    <span className="text-xs text-apagado">{a.variantes} variantes</span>
                  </button>
                </li>
              ))}
              {!resultados.length && <li className="py-6 text-center text-sm text-tinta-suave">{cargando ? 'Cargando…' : 'No hay artículos con talles que coincidan.'}</li>}
            </ul>
          </>
        ) : (
          <>
            <p className="mb-3 text-sm text-tinta-suave">
              Poné cuántas unidades de cada talle y color.{mostrarStock ? ' Abajo de cada casillero, lo que hay ahora.' : ''}
            </p>
            <div className="overflow-x-auto">
              <table className="border-separate border-spacing-1 text-sm">
                <thead>
                  <tr>
                    <th />
                    {talles.map((t) => (
                      <th key={t ?? '-'} className="px-1 text-center text-xs font-semibold text-tinta-suave">
                        {t ?? 'Único'}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {colores.map((c) => (
                    <tr key={c ?? '-'}>
                      <th className="pr-2 text-left font-semibold whitespace-nowrap">{c ?? '—'}</th>
                      {talles.map((t) => {
                        const v = vs.find((x) => x.color === c && x.talle === t)
                        if (!v) return <td key={t ?? '-'} />
                        return (
                          <td key={t ?? '-'} className="text-center align-top">
                            <input
                              value={cantidades[v.id] ?? ''}
                              onChange={(e) => setCantidades({ ...cantidades, [v.id]: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                              onFocus={(e) => e.target.select()}
                              inputMode="numeric"
                              aria-label={`Cantidad de ${[c, t].filter(Boolean).join(' ')}`}
                              placeholder="0"
                              className="num h-11 w-14 rounded-lg border border-linea text-center font-semibold focus:border-marca focus:outline-none focus:ring-2 focus:ring-marca/15"
                            />
                            {mostrarStock && <span className="num mt-0.5 block text-[11px] text-apagado">hay {v.stock}</span>}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-linea pt-4">
              <button type="button" onClick={() => setArticulo(null)} className="text-sm font-medium text-marca hover:underline">
                Elegir otro artículo
              </button>
              <Boton onClick={agregar} disabled={!total}>
                Agregar {total} unidad{total === 1 ? '' : 'es'} a la lista
              </Boton>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
