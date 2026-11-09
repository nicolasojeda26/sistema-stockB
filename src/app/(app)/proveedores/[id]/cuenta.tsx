'use client'

import { useState } from 'react'
import { FormAccion } from '@/components/form-accion'
import { Boton, Campo, Input, Select } from '@/components/ui'
import { MEDIOS_PROVEEDOR } from '@/lib/compras-tipos'
import { ajustarProveedor, pagarProveedor } from '../actions'

export function PagoProveedor({ proveedorId, sugerido, cajaAbierta }: { proveedorId: number; sugerido: number | null; cajaAbierta: boolean }) {
  const [medio, setMedio] = useState('transferencia')
  return (
    <FormAccion accion={pagarProveedor} limpiarAlGuardar className="space-y-4 p-5">
      {({ errores = {} }, enviando) => (
        <>
          <input type="hidden" name="proveedor_id" value={proveedorId} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Monto" error={errores.monto}>
              <Input name="monto" inputMode="decimal" defaultValue={sugerido ? String(sugerido).replace('.', ',') : ''} required />
            </Campo>
            <Campo etiqueta="Cómo se paga">
              <Select name="medio" value={medio} onChange={(e) => setMedio(e.target.value)}>
                {Object.entries(MEDIOS_PROVEEDOR).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Campo>
          </div>
          {medio === 'efectivo' && (
            <label className={`flex items-start gap-2 text-sm ${cajaAbierta ? '' : 'opacity-60'}`}>
              <input type="checkbox" name="desde_caja" defaultChecked={cajaAbierta} disabled={!cajaAbierta} className="mt-0.5 h-4 w-4 accent-marca" />
              <span>
                Sale de mi caja
                <span className="block text-xs text-tinta-suave">{cajaAbierta ? 'Se registra como retiro en tu caja abierta.' : 'No tenés una caja abierta.'}</span>
              </span>
            </label>
          )}
          <Campo etiqueta="Nota" ayuda="Opcional: N.º de transferencia, cheque, etc.">
            <Input name="nota" maxLength={200} />
          </Campo>
          <Boton type="submit" disabled={enviando}>
            Registrar pago
          </Boton>
        </>
      )}
    </FormAccion>
  )
}

export function AjusteProveedor({ proveedorId }: { proveedorId: number }) {
  return (
    <FormAccion accion={ajustarProveedor} limpiarAlGuardar className="space-y-4 p-5">
      {(_, enviando) => (
        <>
          <input type="hidden" name="proveedor_id" value={proveedorId} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Monto">
              <Input name="monto" inputMode="decimal" required />
            </Campo>
            <Campo etiqueta="Tipo">
              <Select name="tipo" defaultValue="nota_credito">
                <option value="nota_credito">Nota de crédito (te descuenta)</option>
                <option value="deuda">Ajuste: le debés más</option>
                <option value="favor">Ajuste: le debés menos</option>
              </Select>
            </Campo>
          </div>
          <Campo etiqueta="Motivo">
            <Input name="nota" required maxLength={200} placeholder="Ej.: NC 0003-00000045 por productos fallados" />
          </Campo>
          <Boton type="submit" variante="secundario" disabled={enviando}>
            Registrar
          </Boton>
        </>
      )}
    </FormAccion>
  )
}
