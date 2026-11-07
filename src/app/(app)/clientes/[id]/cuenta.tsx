'use client'

import { FormAccion } from '@/components/form-accion'
import { Boton, Campo, Input, Select } from '@/components/ui'
import { MEDIOS } from '@/lib/venta-calculo'
import { ajustarSaldo, pagarCuenta } from '../actions'

export function PagoCuenta({ clienteId, sugerido }: { clienteId: number; sugerido: number | null }) {
  return (
    <FormAccion accion={pagarCuenta} limpiarAlGuardar className="space-y-4 p-5">
      {({ errores = {} }, enviando) => (
        <>
          <input type="hidden" name="cliente_id" value={clienteId} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Monto" error={errores.monto} ayuda="También sirve para dejar una seña a favor">
              <Input name="monto" inputMode="decimal" defaultValue={sugerido ? String(sugerido).replace('.', ',') : ''} required />
            </Campo>
            <Campo etiqueta="Cómo paga">
              <Select name="medio" defaultValue="efectivo">
                {Object.entries(MEDIOS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Campo>
          </div>
          <Campo etiqueta="Nota" ayuda="Opcional">
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

export function AjusteSaldo({ clienteId }: { clienteId: number }) {
  return (
    <FormAccion accion={ajustarSaldo} limpiarAlGuardar className="space-y-4 p-5">
      {(_, enviando) => (
        <>
          <input type="hidden" name="cliente_id" value={clienteId} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Monto">
              <Input name="monto" inputMode="decimal" required />
            </Campo>
            <Campo etiqueta="Sentido">
              <Select name="sentido" defaultValue="deuda">
                <option value="deuda">Suma a lo que debe</option>
                <option value="favor">Suma a su favor</option>
              </Select>
            </Campo>
          </div>
          <Campo etiqueta="Motivo">
            <Input name="nota" required maxLength={200} placeholder="Ej.: saldo que venía de Dux" />
          </Campo>
          <Boton type="submit" variante="secundario" disabled={enviando}>
            Registrar ajuste
          </Boton>
        </>
      )}
    </FormAccion>
  )
}
