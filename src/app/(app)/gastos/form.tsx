'use client'

import { useState, useTransition } from 'react'
import { FormAccion } from '@/components/form-accion'
import { Boton, Campo, Input, Select } from '@/components/ui'
import { MEDIOS_GASTO } from '@/lib/compras-tipos'
import { anular, cargarGasto } from './actions'

export function FormGasto({
  categorias,
  sucursales,
  esAdmin,
  cajaAbierta,
  hoy,
}: {
  categorias: string[]
  sucursales: { id: number; nombre: string }[]
  esAdmin: boolean
  cajaAbierta: boolean
  hoy: string
}) {
  const [medio, setMedio] = useState(esAdmin ? 'transferencia' : 'efectivo')
  if (!esAdmin && !cajaAbierta) return <p className="p-5 text-sm text-tinta-suave">Abrí tu caja en Vender para cargar un gasto pagado con la plata de la caja.</p>
  return (
    <FormAccion accion={cargarGasto} limpiarAlGuardar className="space-y-4 p-5">
      {({ errores = {} }, enviando) => (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Categoría">
              <Select name="categoria" required defaultValue="">
                <option value="" disabled>
                  Elegí…
                </option>
                {categorias.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Campo>
            <Campo etiqueta="Monto" error={errores.monto}>
              <Input name="monto" inputMode="decimal" required />
            </Campo>
          </div>
          <Campo etiqueta="Detalle" ayuda="Opcional">
            <Input name="descripcion" maxLength={200} placeholder="Ej.: factura de luz de octubre" />
          </Campo>
          {esAdmin ? (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <Campo etiqueta="Fecha" error={errores.fecha}>
                  <Input type="date" name="fecha" defaultValue={hoy} max={hoy} />
                </Campo>
                <Campo etiqueta="Sucursal">
                  <Select name="sucursal_id" defaultValue="">
                    <option value="">General</option>
                    {sucursales.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nombre}
                      </option>
                    ))}
                  </Select>
                </Campo>
                <Campo etiqueta="Cómo se pagó">
                  <Select name="medio" value={medio} onChange={(e) => setMedio(e.target.value)}>
                    {Object.entries(MEDIOS_GASTO).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                </Campo>
              </div>
              {medio === 'efectivo' && (
                <label className={`flex items-center gap-2 text-sm ${cajaAbierta ? '' : 'opacity-60'}`}>
                  <input type="checkbox" name="desde_caja" defaultChecked={cajaAbierta} disabled={!cajaAbierta} className="h-4 w-4 accent-marca" />
                  {cajaAbierta ? 'Sale de mi caja (la sucursal es la de la caja)' : 'No tenés una caja abierta: no se descuenta de ninguna caja'}
                </label>
              )}
            </>
          ) : (
            <p className="text-xs text-tinta-suave">Sale en efectivo de tu caja y queda registrado como retiro.</p>
          )}
          <Boton type="submit" disabled={enviando}>
            Registrar gasto
          </Boton>
        </>
      )}
    </FormAccion>
  )
}

export function AnularGasto({ id }: { id: number }) {
  const [error, setError] = useState<string | null>(null)
  const [ocupado, iniciar] = useTransition()
  return (
    <span className="inline-flex items-center gap-2">
      {error && <span className="text-xs text-error">{error}</span>}
      <button
        disabled={ocupado}
        onClick={() => {
          if (!confirm('¿Anular este gasto?')) return
          iniciar(async () => setError((await anular(id)).error ?? null))
        }}
        className="text-xs font-medium text-tinta-suave hover:text-error"
      >
        Anular
      </button>
    </span>
  )
}
