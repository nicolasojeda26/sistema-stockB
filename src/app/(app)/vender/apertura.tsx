'use client'

import { FormAccion } from '@/components/form-accion'
import { Boton, Campo, Input, Select } from '@/components/ui'
import { abrir } from './actions'

export function AperturaCaja({ sucursales, sucursalPropia }: { sucursales: { id: number; nombre: string }[]; sucursalPropia: string | null }) {
  return (
    <FormAccion accion={abrir} className="space-y-4 p-5">
      {(_, enviando) => (
        <>
          {sucursales.length > 0 ? (
            <Campo etiqueta="Sucursal">
              <Select name="sucursal_id" required defaultValue="">
                <option value="" disabled>
                  Elegí dónde vas a vender…
                </option>
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </Select>
            </Campo>
          ) : (
            <p className="text-sm text-tinta-suave">
              Sucursal: <b className="text-tinta">{sucursalPropia}</b>
            </p>
          )}
          <Campo etiqueta="Efectivo inicial" ayuda="Lo que hay en la caja para dar cambio.">
            <Input name="monto_inicial" inputMode="decimal" placeholder="0,00" autoFocus />
          </Campo>
          <Boton type="submit" disabled={enviando} className="w-full">
            Abrir caja
          </Boton>
        </>
      )}
    </FormAccion>
  )
}
