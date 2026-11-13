'use client'

import { useState, type KeyboardEvent } from 'react'
import { FormAccion } from '@/components/form-accion'
import { Boton, BotonLink, Campo, Input, Select } from '@/components/ui'
import { formatoPesos, margen } from '@/lib/formato'
import { precioSegunForma, type DescuentosPago } from '@/lib/venta-calculo'
import { parseNumero } from '@/lib/numeros'
import { guardarProducto } from './actions'

export type ProductoForm = {
  id: number
  codigo: string
  nombre: string
  categoria_id: number | null
  costo: number
  precio: number
  /** Precios propios por forma de pago (vacío = lista menos el % de Ajustes). */
  precio_transferencia?: number | null
  precio_efectivo?: number | null
  stock_minimo: number
  activo: boolean
  /** Si es una variante de un artículo. */
  articulo_id?: number | null
  articulo?: string | null
  talle?: string | null
  color?: string | null
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

export function FormProducto({
  producto,
  categorias,
  descuentos = { transferencia: 0, efectivo: 0 },
}: {
  producto?: ProductoForm
  categorias: { id: number; nombre: string }[]
  descuentos?: DescuentosPago
}) {
  const [costo, setCosto] = useState(producto ? aTexto(producto.costo) : '')
  const [precio, setPrecio] = useState(producto ? aTexto(producto.precio) : '')
  const [precioTransf, setPrecioTransf] = useState(producto?.precio_transferencia != null ? aTexto(producto.precio_transferencia) : '')
  const [precioEfect, setPrecioEfect] = useState(producto?.precio_efectivo != null ? aTexto(producto.precio_efectivo) : '')
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
            {producto?.articulo_id ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo etiqueta="Color" error={errores.color}>
                  <Input name="color" defaultValue={producto.color ?? ''} />
                </Campo>
                <Campo etiqueta="Modelo" error={errores.talle}>
                  <Input name="talle" defaultValue={producto.talle ?? ''} />
                </Campo>
              </div>
            ) : (
              <Campo etiqueta="Nombre" error={errores.nombre}>
                <Input name="nombre" defaultValue={producto?.nombre} placeholder="Ej.: Remera lisa algodón M negra" required />
              </Campo>
            )}
          </div>
          {!producto?.articulo_id && (
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
          )}
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
          {(descuentos.transferencia > 0 || descuentos.efectivo > 0) && (
            <details className="rounded-lg border border-linea px-4 py-3" open={!!(producto?.precio_transferencia || producto?.precio_efectivo)}>
              <summary className="cursor-pointer text-sm font-medium">
                Precio con transferencia y en efectivo
                <span className="ml-2 font-normal text-tinta-suave">
                  {(['transferencia', 'efectivo'] as const)
                    .map((f) => `${f === 'transferencia' ? 'Transf.' : 'Efect.'} ${formatoPesos(precioSegunForma({ precio: parseNumero(precio) ?? 0, precio_transferencia: f === 'transferencia' ? parseNumero(precioTransf) : null, precio_efectivo: f === 'efectivo' ? parseNumero(precioEfect) : null }, f, descuentos))}`)
                    .join(' · ')}
                </span>
              </summary>
              <p className="mt-2 text-xs text-tinta-suave">
                Vacío = la lista menos {descuentos.transferencia} % (transferencia) o {descuentos.efectivo} % (efectivo). Completalo solo si este producto tiene otro precio, por ejemplo
                el mismo pague como pague.
              </p>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <Campo etiqueta="Precio con transferencia" error={errores.precio_transferencia}>
                  <Input name="precio_transferencia" inputMode="decimal" value={precioTransf} onChange={(e) => setPrecioTransf(e.target.value)} placeholder={`Automático: ${formatoPesos(precioSegunForma({ precio: parseNumero(precio) ?? 0 }, 'transferencia', descuentos))}`} />
                </Campo>
                <Campo etiqueta="Precio en efectivo" error={errores.precio_efectivo}>
                  <Input name="precio_efectivo" inputMode="decimal" value={precioEfect} onChange={(e) => setPrecioEfect(e.target.value)} placeholder={`Automático: ${formatoPesos(precioSegunForma({ precio: parseNumero(precio) ?? 0 }, 'efectivo', descuentos))}`} />
                </Campo>
              </div>
            </details>
          )}
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
