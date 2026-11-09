'use client'

import { useRef, useState, type KeyboardEvent } from 'react'
import { Input, tablaCls as t } from '@/components/ui'
import { formatoEntero } from '@/lib/formato'
import { buscarProducto, type ProductoLinea } from '../mercaderia/actions'

export type LineaCantidad = { id: number; codigo: string; nombre: string; stock: number; cantidad: string; pedida?: number }

/** Lista de productos con cantidad: se escanea o se busca. La usan los pedidos y los envíos. */
export function ListaProductos({
  lineas,
  setLineas,
  depositoId,
  etiquetaStock,
  avisarSinStock = false,
}: {
  lineas: LineaCantidad[]
  setLineas: (f: (ls: LineaCantidad[]) => LineaCantidad[]) => void
  depositoId: number | null
  etiquetaStock: string
  avisarSinStock?: boolean
}) {
  const [busqueda, setBusqueda] = useState('')
  const [sugerencias, setSugerencias] = useState<ProductoLinea[]>([])
  const [noHay, setNoHay] = useState<string | null>(null)
  const escaner = useRef<HTMLInputElement>(null)
  const pedido = useRef(0)
  const demora = useRef<ReturnType<typeof setTimeout> | null>(null)

  function agregar(p: ProductoLinea) {
    setSugerencias([])
    setBusqueda('')
    setNoHay(null)
    setLineas((ls) => {
      const i = ls.findIndex((l) => l.id === p.id)
      if (i >= 0) {
        const copia = [...ls]
        copia[i] = { ...copia[i], cantidad: String((Number.parseInt(copia[i].cantidad, 10) || 0) + 1) }
        return [copia[i], ...copia.filter((_, j) => j !== i)]
      }
      return [{ id: p.id, codigo: p.codigo, nombre: p.nombre, stock: Number(p.stock), cantidad: '1' }, ...ls]
    })
    escaner.current?.focus()
  }
  async function buscar(texto: string, enter: boolean) {
    const n = ++pedido.current
    if (!texto.trim()) return setSugerencias([])
    const r = await buscarProducto(texto, depositoId)
    if (n !== pedido.current) return
    if (r.exacto) return enter ? agregar(r.exacto) : setSugerencias([r.exacto])
    setSugerencias(r.sugerencias)
    if (enter && !r.sugerencias.length) setNoHay(texto.trim())
  }
  function tecla(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (sugerencias.length === 1 && busqueda.trim() && !/^\d{6,}$/.test(busqueda.trim())) agregar(sugerencias[0])
      else void buscar(busqueda, true)
    } else if (e.key === 'Escape') setSugerencias([])
  }

  return (
    <div>
      <div className="relative p-5 pb-3">
        <input
          ref={escaner}
          value={busqueda}
          onChange={(e) => {
            const v = e.target.value
            setBusqueda(v)
            setNoHay(null)
            if (demora.current) clearTimeout(demora.current)
            demora.current = setTimeout(() => void buscar(v, false), 200)
          }}
          onKeyDown={tecla}
          aria-label="Escanear o buscar producto"
          autoComplete="off"
          placeholder="Escaneá o escribí el producto (ej.: funda a15)"
          className="h-12 w-full rounded-xl border border-linea bg-fondo px-4 font-mono placeholder:font-sans placeholder:text-apagado focus:border-marca focus:bg-papel focus:outline-none focus:ring-4 focus:ring-marca/10"
        />
        {sugerencias.length > 0 && busqueda && (
          <ul className="absolute inset-x-5 z-10 mt-1 overflow-hidden rounded-xl border border-linea bg-papel shadow-lg" role="listbox">
            {sugerencias.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => agregar(p)} className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-marca-clara">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{p.nombre}</span>
                    <span className="block font-mono text-xs text-apagado">{p.codigo}</span>
                  </span>
                  <span className="num shrink-0 text-xs text-tinta-suave">
                    {etiquetaStock}: {formatoEntero(Number(p.stock))}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {noHay && <p className="mt-2 text-sm text-alerta">No hay ningún producto con «{noHay}».</p>}
      </div>
      {lineas.length === 0 ? (
        <p className="px-5 pb-8 pt-4 text-center text-sm text-apagado">Todavía no agregaste productos.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className={t.tabla}>
            <thead>
              <tr>
                <th className={t.th}>Producto</th>
                <th className={`${t.th} text-right`}>{etiquetaStock}</th>
                <th className={`${t.th} w-28 text-right`}>Cantidad</th>
                <th className={`${t.th} w-0`} />
              </tr>
            </thead>
            <tbody>
              {lineas.map((l) => {
                const n = Number(l.cantidad)
                const mal = !Number.isInteger(n) || n <= 0
                return (
                  <tr key={l.id}>
                    <td className={t.td}>
                      <span className="block font-medium">{l.nombre}</span>
                      <span className="block text-xs text-apagado">
                        <span className="font-mono">{l.codigo}</span>
                        {l.pedida !== undefined && ` · pidieron ${l.pedida}`}
                      </span>
                    </td>
                    <td className={`${t.td} num text-right ${avisarSinStock && !mal && n > l.stock ? 'font-semibold text-alerta' : 'text-tinta-suave'}`}>{formatoEntero(l.stock)}</td>
                    <td className={`${t.td} text-right`}>
                      <Input
                        value={l.cantidad}
                        inputMode="numeric"
                        aria-label={`Cantidad de ${l.nombre}`}
                        onChange={(e) => setLineas((ls) => ls.map((x) => (x.id === l.id ? { ...x, cantidad: e.target.value } : x)))}
                        className={`num text-right ${mal ? 'border-error' : ''}`}
                      />
                    </td>
                    <td className={t.td}>
                      <button
                        type="button"
                        onClick={() => setLineas((ls) => ls.filter((x) => x.id !== l.id))}
                        aria-label={`Quitar ${l.nombre}`}
                        className="h-9 w-9 rounded-lg text-apagado hover:bg-error-claro hover:text-error"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export const cantidadValida = (l: LineaCantidad) => {
  const n = Number(l.cantidad)
  return Number.isInteger(n) && n > 0 ? n : null
}
