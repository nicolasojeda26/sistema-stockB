'use client'

import { useEffect, useMemo, useRef, useState, useTransition, type KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Aviso, Boton, Campo, Input, Select, Tarjeta, tablaCls as t } from '@/components/ui'
import { formatoPesos } from '@/lib/formato'
import { calcularVenta } from '@/lib/venta-calculo'
import { buscarProductosPresupuesto, crearPresupuesto, type ProductoPresupuesto } from './actions'

type Linea = ProductoPresupuesto & { cantidad: number; descuentoPct: number }

function fechaInicial() {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date())
  const fecha = new Date(`${hoy}T00:00:00Z`)
  fecha.setUTCDate(fecha.getUTCDate() + 15)
  return fecha.toISOString().slice(0, 10)
}

export function FormPresupuesto({
  sucursales,
  sucursalPropia,
  clientes,
}: {
  sucursales: { id: number; nombre: string }[]
  sucursalPropia: number | null
  clientes: { id: number; nombre: string }[]
}) {
  const router = useRouter()
  const [sucursalId, setSucursalId] = useState(String(sucursalPropia ?? sucursales[0]?.id ?? ''))
  const [clienteId, setClienteId] = useState('')
  const [validoHasta, setValidoHasta] = useState(fechaInicial)
  const [descuentoGlobalPct, setDescuentoGlobalPct] = useState(0)
  const [nota, setNota] = useState('')
  const [q, setQ] = useState('')
  const [resultados, setResultados] = useState<ProductoPresupuesto[]>([])
  const [buscando, setBuscando] = useState(false)
  const [lineas, setLineas] = useState<Linea[]>([])
  const [error, setError] = useState<string | null>(null)
  const [guardando, iniciar] = useTransition()
  const pedido = useRef(0)

  useEffect(() => {
    const n = ++pedido.current
    const texto = q.trim()
    if (!texto) { setResultados([]); setBuscando(false); return }
    setBuscando(true)
    const demora = setTimeout(async () => {
      const r = await buscarProductosPresupuesto(texto)
      if (n === pedido.current) { setResultados(r); setBuscando(false) }
    }, 180)
    return () => clearTimeout(demora)
  }, [q])

  const calculo = useMemo(
    () => calcularVenta(lineas.map((l) => ({ precio: l.precio, cantidad: l.cantidad, descuentoPct: l.descuentoPct })), descuentoGlobalPct),
    [lineas, descuentoGlobalPct],
  )

  function agregar(producto: ProductoPresupuesto) {
    setLineas((actuales) => {
      const existente = actuales.find((l) => l.id === producto.id)
      if (existente) return actuales.map((l) => (l.id === producto.id ? { ...l, cantidad: l.cantidad + 1 } : l))
      return [{ ...producto, cantidad: 1, descuentoPct: 0 }, ...actuales]
    })
    setQ('')
    setResultados([])
    setError(null)
  }

  function teclaBuscar(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && resultados.length === 1) {
      e.preventDefault()
      agregar(resultados[0])
    }
  }

  function guardar() {
    setError(null)
    if (!sucursalId) return setError('Elegí la sucursal.')
    if (!lineas.length) return setError('Agregá por lo menos un producto.')
    iniciar(async () => {
      const r = await crearPresupuesto({
        sucursalId: Number(sucursalId),
        clienteId: Number(clienteId) || null,
        validoHasta: validoHasta || null,
        descuentoGlobalPct,
        nota: nota.trim() || null,
        items: lineas.map(({ id, cantidad, descuentoPct }) => ({ productoId: id, cantidad, descuentoPct })),
      })
      if (r.error || !r.id) return setError(r.error ?? 'No se pudo guardar el presupuesto.')
      router.push(`/presupuestos/${r.id}`)
    })
  }

  return (
    <div className="space-y-5">
      <Tarjeta className="p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          {sucursalPropia === null && (
            <Campo etiqueta="Sucursal">
              <Select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)}>
                {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </Select>
            </Campo>
          )}
          <Campo etiqueta="Cliente" ayuda="Opcional; podés dejarlo como presupuesto general.">
            <Select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
              <option value="">Sin cliente</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </Select>
          </Campo>
          <Campo etiqueta="Válido hasta" ayuda="Dejalo vacío si no querés indicar vencimiento.">
            <Input type="date" value={validoHasta} onChange={(e) => setValidoHasta(e.target.value)} />
          </Campo>
        </div>
      </Tarjeta>

      <Tarjeta className="p-5">
        <Campo etiqueta="Agregar productos" ayuda="Buscá por nombre o escribí el código de barras. Enter agrega el único resultado.">
          <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={teclaBuscar} placeholder="Código o nombre del producto" autoComplete="off" />
        </Campo>
        {q.trim() && (
          <ul className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-linea bg-papel">
            {resultados.length ? resultados.map((p) => (
              <li key={p.id} className="border-b border-linea last:border-0">
                <button type="button" onClick={() => agregar(p)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-marca-clara">
                  <span className="min-w-0"><span className="block truncate font-medium">{p.nombre}</span><span className="font-mono text-xs text-apagado">{p.codigo}</span></span>
                  <span className="num shrink-0 font-semibold">{formatoPesos(Number(p.precio))}</span>
                </button>
              </li>
            )) : <li className="px-4 py-3 text-sm text-tinta-suave">{buscando ? 'Buscando productos…' : 'No encontramos productos.'}</li>}
          </ul>
        )}
      </Tarjeta>

      <Tarjeta className="overflow-hidden">
        {lineas.length ? (
          <div className="overflow-x-auto">
            <table className={t.tabla}>
              <thead><tr><th className={t.th}>Producto</th><th className={`${t.th} text-right`}>Cantidad</th><th className={`${t.th} text-right`}>Precio</th><th className={`${t.th} text-right`}>Desc. %</th><th className={`${t.th} text-right`}>Subtotal</th><th className={t.th} /></tr></thead>
              <tbody>
                {lineas.map((l, i) => (
                  <tr key={l.id}>
                    <td className={t.td}><span className="block font-medium">{l.nombre}</span><span className="font-mono text-xs text-apagado">{l.codigo}</span></td>
                    <td className={`${t.td} text-right`}><Input aria-label={`Cantidad de ${l.nombre}`} type="number" min="1" step="1" value={l.cantidad} onChange={(e) => setLineas((xs) => xs.map((x) => x.id === l.id ? { ...x, cantidad: Math.max(1, Number(e.target.value) || 1) } : x))} className="w-20 text-right" /></td>
                    <td className={`${t.td} num text-right whitespace-nowrap`}>{formatoPesos(Number(l.precio))}</td>
                    <td className={`${t.td} text-right`}><Input aria-label={`Descuento de ${l.nombre}`} type="number" min="0" max="100" step="0.1" value={l.descuentoPct} onChange={(e) => setLineas((xs) => xs.map((x) => x.id === l.id ? { ...x, descuentoPct: Math.min(100, Math.max(0, Number(e.target.value) || 0)) } : x))} className="w-20 text-right" /></td>
                    <td className={`${t.td} num text-right font-medium whitespace-nowrap`}>{formatoPesos(calculo.subtotales[i] / 100)}</td>
                    <td className={t.td}><button type="button" aria-label={`Quitar ${l.nombre}`} onClick={() => setLineas((xs) => xs.filter((x) => x.id !== l.id))} className="rounded-lg px-2 py-1 text-apagado hover:bg-error-claro hover:text-error">×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="px-5 py-10 text-center text-sm text-tinta-suave">Agregá productos para armar el presupuesto. No modifica el stock.</p>}
        {lineas.length > 0 && (
          <div className="flex flex-col gap-3 border-t border-linea p-5 sm:ml-auto sm:max-w-sm">
            <label className="flex items-center justify-between gap-3 text-sm text-tinta-suave">Descuento general (%) <Input type="number" min="0" max="100" step="0.1" value={descuentoGlobalPct} onChange={(e) => setDescuentoGlobalPct(Math.min(100, Math.max(0, Number(e.target.value) || 0)))} className="w-24 text-right" /></label>
            <label className="flex items-center justify-between text-sm text-tinta-suave">Subtotal sin descuentos <span className="num">{formatoPesos(calculo.bruto / 100)}</span></label>
            {calculo.descuento > 0 && <label className="flex items-center justify-between text-sm text-tinta-suave">Descuentos <span className="num">−{formatoPesos(calculo.descuento / 100)}</span></label>}
            <p className="flex items-center justify-between border-t border-linea pt-3 font-semibold">Total <span className="num text-xl text-marca">{formatoPesos(calculo.total / 100)}</span></p>
          </div>
        )}
      </Tarjeta>

      <Tarjeta className="space-y-4 p-5">
        <Campo etiqueta="Nota para el cliente" ayuda="Opcional. Aparece en la copia impresa del presupuesto.">
          <textarea value={nota} onChange={(e) => setNota(e.target.value)} maxLength={500} rows={3} className="w-full rounded-lg border border-linea bg-papel px-3 py-2 text-sm text-tinta focus:border-marca focus:outline-none focus:ring-2 focus:ring-marca/15" />
        </Campo>
        {error && <Aviso tipo="error">{error}</Aviso>}
        <div className="flex flex-wrap justify-end gap-2">
          <Boton type="button" variante="secundario" onClick={() => router.push('/presupuestos')}>Cancelar</Boton>
          <Boton type="button" onClick={guardar} disabled={guardando || !lineas.length}>{guardando ? 'Guardando…' : 'Guardar presupuesto'}</Boton>
        </div>
      </Tarjeta>
    </div>
  )
}
