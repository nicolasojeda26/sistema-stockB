'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Aviso, Boton, BotonLink, Campo, Input, Select, Tarjeta, TituloTarjeta } from '@/components/ui'
import { margen } from '@/lib/formato'
import { parseNumero } from '@/lib/numeros'
import { crearArticulo } from '../actions'
import { SelectorChips } from '../selector-variantes'

export function FormArticulo({
  categorias,
  curvas,
  tallesSugeridos,
  colores: coloresSugeridos,
}: {
  categorias: { id: number; nombre: string }[]
  curvas: { nombre: string; talles: string[] }[]
  tallesSugeridos: string[]
  colores: string[]
}) {
  const router = useRouter()
  const [nombre, setNombre] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [marca, setMarca] = useState('')
  const [costo, setCosto] = useState('')
  const [precio, setPrecio] = useState('')
  const [stockMinimo, setStockMinimo] = useState('1')
  const [talles, setTalles] = useState<string[]>([])
  const [colores, setColores] = useState<string[]>([])
  const [codigos, setCodigos] = useState<Record<string, string>>({})
  const [propios, setPropios] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [guardando, iniciar] = useTransition()
  const m = margen(parseNumero(costo) ?? 0, parseNumero(precio) ?? 0)

  const cs = colores.length ? colores : [null]
  const ts = talles.length ? talles : [null]
  const combinaciones = talles.length || colores.length ? cs.length * ts.length : 0
  const clave = (c: string | null, t: string | null) => `${c ?? ''}|${t ?? ''}`

  function guardar() {
    setError(null)
    setErrores({})
    iniciar(async () => {
      const r = await crearArticulo({
        nombre,
        categoriaId: Number(categoriaId) || null,
        marca,
        costo,
        precio,
        stockMinimo,
        talles,
        colores,
        codigos: propios ? codigos : {},
      })
      if (r.id) return router.push(`/articulos/${r.id}?creado=1`)
      setError(r.error ?? 'No se pudo guardar.')
      setErrores(r.errores ?? {})
    })
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-5">
        <Tarjeta className="space-y-4 p-5">
          <Campo etiqueta="Nombre del artículo" error={errores.nombre} ayuda="Sin talle ni color: eso se agrega abajo.">
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Jean wide leg tiro alto" autoFocus />
          </Campo>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Categoría">
              <Select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
                <option value="">Sin categoría</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo etiqueta="Marca" ayuda="Opcional">
              <Input value={marca} onChange={(e) => setMarca(e.target.value)} />
            </Campo>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo etiqueta="Costo" error={errores.costo}>
              <Input inputMode="decimal" value={costo} onChange={(e) => setCosto(e.target.value)} placeholder="0" />
            </Campo>
            <Campo
              etiqueta="Precio de venta"
              error={errores.precio}
              ayuda={m !== null ? `Margen sobre el costo: ${m.toLocaleString('es-AR')} %` : 'El mismo para todos los talles; después podés cambiar uno.'}
            >
              <Input inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="0" />
            </Campo>
            <Campo etiqueta="Stock mínimo por variante" error={errores.stock_minimo}>
              <Input inputMode="numeric" value={stockMinimo} onChange={(e) => setStockMinimo(e.target.value)} />
            </Campo>
          </div>
        </Tarjeta>

        <Tarjeta className="space-y-6 p-5">
          <SelectorChips
            titulo="Talles"
            grupos={curvas}
            sugeridos={tallesSugeridos}
            elegidos={talles}
            setElegidos={setTalles}
            placeholder="Otro talle (ej.: 50)"
          />
          <SelectorChips titulo="Colores" sugeridos={coloresSugeridos} elegidos={colores} setElegidos={setColores} placeholder="Otro color (ej.: Verde militar)" />
          {errores.variantes && <p className="text-sm font-medium text-error">{errores.variantes}</p>}
        </Tarjeta>
      </div>

      <div className="min-w-0">
        <Tarjeta className="lg:sticky lg:top-6">
          <TituloTarjeta>Se van a crear {combinaciones} variante{combinaciones === 1 ? '' : 's'}</TituloTarjeta>
          <div className="max-h-[50vh] overflow-y-auto px-5 py-3">
            {combinaciones === 0 ? (
              <p className="py-6 text-center text-sm text-tinta-suave">Elegí talles y colores para ver las variantes.</p>
            ) : (
              <ul className="divide-y divide-linea text-sm">
                {cs.flatMap((c) =>
                  ts.map((t) => (
                    <li key={clave(c, t)} className="flex items-center justify-between gap-2 py-2">
                      <span className="min-w-0 truncate">{[c, t].filter(Boolean).join(' · ')}</span>
                      {propios ? (
                        <input
                          value={codigos[clave(c, t)] ?? ''}
                          onChange={(e) => setCodigos({ ...codigos, [clave(c, t)]: e.target.value })}
                          onKeyDown={(e) => {
                            // El lector manda Enter: pasar a la variante siguiente.
                            if (e.key !== 'Enter') return
                            e.preventDefault()
                            const todos = Array.from(e.currentTarget.closest('ul')?.querySelectorAll('input') ?? [])
                            todos[todos.indexOf(e.currentTarget) + 1]?.focus()
                          }}
                          placeholder="Automático"
                          aria-label={`Código de ${[c, t].filter(Boolean).join(' ')}`}
                          className="h-8 w-40 rounded-md border border-linea px-2 font-mono text-xs"
                        />
                      ) : (
                        <span className="text-xs text-apagado">código automático</span>
                      )}
                    </li>
                  )),
                )}
              </ul>
            )}
          </div>
          <div className="space-y-3 border-t border-linea p-5">
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={propios} onChange={(e) => setPropios(e.target.checked)} className="mt-0.5 h-4 w-4 accent-marca" />
              <span>
                Las prendas ya traen código de barras
                <span className="block text-xs text-apagado">Escaneá cada una en su variante. Si no, el sistema genera los códigos para imprimir.</span>
              </span>
            </label>
            {error && <Aviso tipo="error">{error}</Aviso>}
            <div className="flex gap-2">
              <Boton onClick={guardar} disabled={guardando || !nombre.trim() || combinaciones === 0} className="flex-1">
                {guardando ? 'Creando…' : 'Crear artículo'}
              </Boton>
              <BotonLink href="/productos" variante="secundario">
                Cancelar
              </BotonLink>
            </div>
          </div>
        </Tarjeta>
      </div>
    </div>
  )
}
