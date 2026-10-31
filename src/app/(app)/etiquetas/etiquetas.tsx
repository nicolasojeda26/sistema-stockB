'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import JsBarcode from 'jsbarcode'
import { Aviso, Boton, Campo, Input, Select, Tarjeta, TituloTarjeta, tablaCls as t } from '@/components/ui'
import { esEan13 } from '@/lib/codigos'
import { formatoEntero, formatoPesos } from '@/lib/formato'
import { buscarProducto, type ProductoLinea } from '../mercaderia/actions'

export type LineaEtiqueta = { id: number; codigo: string; nombre: string; precio: number; cantidad: number }

const FORMATOS = {
  a4: { nombre: 'Hoja A4 · 3 × 8 (70 × 37 mm)', pagina: 'A4', ancho: 70, alto: 37, columnas: 3, margen: '4mm 0' },
  termica: { nombre: 'Impresora de etiquetas · 50 × 25 mm', pagina: '50mm 25mm', ancho: 50, alto: 25, columnas: 1, margen: '0' },
} as const
type Formato = keyof typeof FORMATOS

function CodigoBarras({ codigo, alto }: { codigo: string; alto: number }) {
  const ref = useRef<SVGSVGElement>(null)
  // CODE128 acepta letras, números y signos comunes; si no, solo se muestra el texto.
  const valido = /^[\x20-\x7e]+$/.test(codigo)
  useEffect(() => {
    if (!ref.current || !valido) return
    JsBarcode(ref.current, codigo, {
      format: esEan13(codigo) ? 'EAN13' : 'CODE128',
      height: alto,
      width: 1.4,
      fontSize: 11,
      margin: 0,
      textMargin: 1,
      displayValue: true,
    })
  }, [codigo, alto, valido])
  if (!valido) return <span className="font-mono text-[9px]">{codigo}</span>
  return <svg ref={ref} className="mx-auto block max-w-full" />
}

export function Etiquetas({ iniciales }: { iniciales: LineaEtiqueta[] }) {
  const [lineas, setLineas] = useState<LineaEtiqueta[]>(iniciales)
  const [formato, setFormato] = useState<Formato>('a4')
  const [conPrecio, setConPrecio] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [sugerencias, setSugerencias] = useState<ProductoLinea[]>([])
  const [aviso, setAviso] = useState<string | null>(null)
  const f = FORMATOS[formato]

  function agregar(p: ProductoLinea) {
    setLineas((ls) => {
      const i = ls.findIndex((l) => l.id === p.id)
      if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, cantidad: l.cantidad + 1 } : l))
      return [...ls, { id: p.id, codigo: p.codigo, nombre: p.nombre, precio: p.precio, cantidad: 1 }]
    })
    setBusqueda('')
    setSugerencias([])
    setAviso(null)
  }

  async function tecla(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const r = await buscarProducto(busqueda, null)
    if (r.exacto) agregar(r.exacto)
    else if (r.sugerencias.length === 1) agregar(r.sugerencias[0])
    else if (r.sugerencias.length) setSugerencias(r.sugerencias)
    else setAviso(`No hay ningún producto con «${busqueda}».`)
  }

  const etiquetas = lineas.flatMap((l) => Array.from({ length: Math.max(0, Math.min(l.cantidad, 500)) }, () => l))

  return (
    <>
      {/* @page no se puede cambiar por clase: se arma según el formato elegido. */}
      <style>{`@media print { @page { size: ${f.pagina}; margin: ${f.margen}; } }`}</style>

      <div className="grid gap-5 print:hidden lg:grid-cols-[1fr_320px]">
        <Tarjeta className="overflow-hidden">
          <div className="relative border-b border-linea p-5">
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              onKeyDown={tecla}
              placeholder="Escaneá o buscá un producto y apretá Enter"
              autoFocus
              aria-label="Agregar producto"
              className="h-12 font-mono"
            />
            {sugerencias.length > 0 && (
              <ul className="absolute right-5 left-5 z-10 mt-1 overflow-hidden rounded-xl border border-linea bg-papel shadow-lg">
                {sugerencias.map((p) => (
                  <li key={p.id}>
                    <button onClick={() => agregar(p)} className="block w-full px-4 py-2.5 text-left text-sm hover:bg-marca-clara">
                      {p.nombre} <span className="font-mono text-xs text-apagado">{p.codigo}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {aviso && (
              <div className="mt-3">
                <Aviso tipo="alerta">{aviso}</Aviso>
              </div>
            )}
          </div>
          {lineas.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-apagado">Agregá los productos que querés etiquetar.</p>
          ) : (
            <table className={t.tabla}>
              <thead>
                <tr>
                  <th className={t.th}>Producto</th>
                  <th className={`${t.th} w-32 text-right`}>Etiquetas</th>
                  <th className={`${t.th} w-0`} />
                </tr>
              </thead>
              <tbody>
                {lineas.map((l) => (
                  <tr key={l.id}>
                    <td className={t.td}>
                      <span className="block font-medium">{l.nombre}</span>
                      <span className="block font-mono text-xs text-apagado">
                        {l.codigo} · {formatoPesos(l.precio)}
                      </span>
                    </td>
                    <td className={`${t.td} text-right`}>
                      <Input
                        value={String(l.cantidad)}
                        inputMode="numeric"
                        aria-label={`Etiquetas de ${l.nombre}`}
                        onChange={(e) => {
                          const n = Number.parseInt(e.target.value, 10)
                          setLineas((ls) => ls.map((x) => (x.id === l.id ? { ...x, cantidad: Number.isNaN(n) ? 0 : n } : x)))
                        }}
                        className="num h-9 w-20 text-right"
                      />
                    </td>
                    <td className={t.td}>
                      <button
                        onClick={() => setLineas((ls) => ls.filter((x) => x.id !== l.id))}
                        aria-label={`Quitar ${l.nombre}`}
                        className="flex h-8 w-8 items-center justify-center rounded-md text-apagado hover:bg-error-claro hover:text-error"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Tarjeta>

        <div>
          <Tarjeta>
            <TituloTarjeta>Impresión</TituloTarjeta>
            <div className="space-y-4 p-5">
              <Campo etiqueta="Formato">
                <Select value={formato} onChange={(e) => setFormato(e.target.value as Formato)}>
                  {Object.entries(FORMATOS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.nombre}
                    </option>
                  ))}
                </Select>
              </Campo>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={conPrecio} onChange={(e) => setConPrecio(e.target.checked)} className="h-4 w-4 accent-marca" />
                Mostrar el precio
              </label>
              <Boton onClick={() => window.print()} disabled={etiquetas.length === 0} className="w-full">
                Imprimir {formatoEntero(etiquetas.length)} etiqueta{etiquetas.length === 1 ? '' : 's'}
              </Boton>
              <p className="text-xs text-apagado">En el diálogo de impresión elegí escala 100 % y sin márgenes extra.</p>
            </div>
          </Tarjeta>
        </div>
      </div>

      {etiquetas.length > 0 && (
        <section className="mt-6 print:mt-0" aria-label="Vista previa de etiquetas">
          <h2 className="mb-3 text-sm font-semibold print:hidden">Vista previa</h2>
          <div
            className="zona-etiquetas grid justify-start gap-0 bg-papel ring-1 ring-linea print:ring-0"
            style={{ gridTemplateColumns: `repeat(${f.columnas}, ${f.ancho}mm)` }}
          >
            {etiquetas.map((l, i) => (
              <div
                key={i}
                className="flex flex-col items-center justify-center overflow-hidden px-[3mm] text-center text-black"
                style={{ width: `${f.ancho}mm`, height: `${f.alto}mm`, breakInside: 'avoid', outline: '0.2mm dashed #ddd' }}
              >
                <p className="line-clamp-2 w-full text-[9pt] leading-tight">{l.nombre}</p>
                {conPrecio && <p className="text-[12pt] font-bold leading-tight">{formatoPesos(l.precio)}</p>}
                <CodigoBarras codigo={l.codigo} alto={formato === 'termica' ? 26 : 34} />
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  )
}
