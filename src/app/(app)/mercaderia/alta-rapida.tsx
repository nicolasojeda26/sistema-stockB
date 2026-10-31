'use client'

import { useState, useTransition } from 'react'
import { Aviso, Boton, Campo, Input, Select } from '@/components/ui'
import { crearProductoRapido, generarCodigo, type ProductoLinea } from './actions'

/** Producto que no existe todavía: se da de alta sin salir del ingreso. */
export function AltaRapida({
  codigoInicial,
  nombreInicial,
  categorias,
  alCrear,
  alCancelar,
}: {
  codigoInicial: string
  nombreInicial: string
  categorias: { id: number; nombre: string }[]
  alCrear: (p: ProductoLinea) => void
  alCancelar: () => void
}) {
  const [codigo, setCodigo] = useState(codigoInicial)
  const [nombre, setNombre] = useState(nombreInicial)
  const [categoriaId, setCategoriaId] = useState('')
  const [precio, setPrecio] = useState('')
  const [costo, setCosto] = useState('')
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [guardando, iniciar] = useTransition()

  function crear() {
    iniciar(async () => {
      const r = await crearProductoRapido({ codigo, nombre, categoriaId: Number(categoriaId) || null, precio, costo })
      if (r.producto) return alCrear(r.producto)
      setErrores(r.errores ?? {})
      setError(r.error ?? null)
    })
  }

  return (
    <div
      className="rounded-xl border border-acento/40 bg-alerta-claro/40 p-4"
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
          e.preventDefault()
          crear()
        }
      }}
    >
      <p className="mb-4 text-sm">
        <b>Producto nuevo.</b> {codigoInicial ? `El código ${codigoInicial} no está cargado.` : 'No encontramos ese producto.'} Completá los datos y se agrega a la lista.
      </p>
      {error && !Object.keys(errores).length && (
        <div className="mb-3">
          <Aviso tipo="error">{error}</Aviso>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.2fr_2fr]">
        <Campo etiqueta="Código" error={errores.codigo}>
          <div className="flex gap-2">
            <Input name="codigo-nuevo" value={codigo} onChange={(e) => setCodigo(e.target.value)} className="font-mono" />
            <Boton
              type="button"
              variante="secundario"
              className="px-3"
              title="Para productos que no traen código de barras"
              onClick={() => iniciar(async () => setCodigo(await generarCodigo()))}
            >
              Generar
            </Boton>
          </div>
        </Campo>
        <Campo etiqueta="Nombre" error={errores.nombre}>
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus placeholder="Ej.: Remera lisa negra M" />
        </Campo>
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
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Precio de venta" error={errores.precio}>
            <Input value={precio} onChange={(e) => setPrecio(e.target.value)} inputMode="decimal" placeholder="0,00" />
          </Campo>
          <Campo etiqueta="Costo" error={errores.costo} ayuda="Opcional">
            <Input value={costo} onChange={(e) => setCosto(e.target.value)} inputMode="decimal" placeholder="0,00" />
          </Campo>
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <Boton type="button" onClick={crear} disabled={guardando}>
          Crear y agregar
        </Boton>
        <Boton type="button" variante="secundario" onClick={alCancelar}>
          Cancelar
        </Boton>
      </div>
    </div>
  )
}
