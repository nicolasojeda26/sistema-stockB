'use client'

import { useState, type KeyboardEvent } from 'react'
import { FormAccion } from '@/components/form-accion'
import { Boton, BotonLink, Campo, Input, Select } from '@/components/ui'
import { margen } from '@/lib/formato'
import { parseNumero } from '@/lib/numeros'
import { guardarProducto } from './actions'

export type ProductoForm = {
  id: number
  codigo: string
  nombre: string
  categoria_id: number | null
  costo: number
  precio: number
  stock_minimo: number
  activo: boolean
}

const aTexto = (n: number) => String(n).replace('.', ',')

// Los lectores de código "escriben" el código y mandan Enter: en el campo
// del código, Enter pasa al siguiente campo en vez de enviar el formulario.
function enterPasaAlSiguiente(e: KeyboardEvent<HTMLInputElement>) {
  if (e.key !== 'Enter') return
  e.preventDefault()
  const campos = Array.from(e.currentTarget.form?.querySelectorAll<HTMLElement>('input:not([type=hidden]), select') ?? [])
  campos[campos.indexOf(e.currentTarget) + 1]?.focus()
}

export function FormProducto({ producto, categorias }: { producto?: ProductoForm; categorias: { id: number; nombre: string }[] }) {
  const [costo, setCosto] = useState(producto ? aTexto(producto.costo) : '')
  const [precio, setPrecio] = useState(producto ? aTexto(producto.precio) : '')
  const m = margen(parseNumero(costo) ?? 0, parseNumero(precio) ?? 0)

  return (
    <FormAccion accion={guardarProducto} className="space-y-5 p-5">
      {({ errores = {} }, enviando) => (
        <>
          {producto && <input type="hidden" name="id" value={producto.id} />}
          <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
            <Campo etiqueta="Código de barras" error={errores.codigo} ayuda="Escanealo o escribilo">
              <Input
                name="codigo"
                defaultValue={producto?.codigo}
                autoFocus={!producto}
                onKeyDown={enterPasaAlSiguiente}
                className="font-mono"
                autoComplete="off"
                required
              />
            </Campo>
            <Campo etiqueta="Nombre" error={errores.nombre}>
              <Input name="nombre" defaultValue={producto?.nombre} placeholder="Ej.: Remera lisa algodón M negra" required />
            </Campo>
          </div>
          <Campo etiqueta="Categoría">
            <Select name="categoria_id" defaultValue={producto?.categoria_id ?? ''}>
              <option value="">Sin categoría</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </Select>
          </Campo>
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo etiqueta="Costo" error={errores.costo}>
              <Input name="costo" inputMode="decimal" value={costo} onChange={(e) => setCosto(e.target.value)} placeholder="0,00" />
            </Campo>
            <Campo
              etiqueta="Precio de venta"
              error={errores.precio}
              ayuda={m !== null ? `Margen sobre el costo: ${m.toLocaleString('es-AR')} %` : undefined}
            >
              <Input
                name="precio"
                inputMode="decimal"
                value={precio}
                onChange={(e) => setPrecio(e.target.value)}
                placeholder="0,00"
                required
              />
            </Campo>
            <Campo etiqueta="Stock mínimo" error={errores.stock_minimo} ayuda="Avisa cuando queda esto o menos">
              <Input name="stock_minimo" inputMode="numeric" defaultValue={producto?.stock_minimo ?? 0} />
            </Campo>
          </div>
          {producto && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="activo" defaultChecked={producto.activo} className="h-4 w-4 accent-marca" />
              Activo (si lo desmarcás, se da de baja y no aparece para vender)
            </label>
          )}
          <div className="flex gap-2 border-t border-linea pt-5">
            <Boton type="submit" disabled={enviando}>
              {producto ? 'Guardar cambios' : 'Crear producto'}
            </Boton>
            <BotonLink href="/productos" variante="secundario">
              Volver
            </BotonLink>
          </div>
        </>
      )}
    </FormAccion>
  )
}
