'use client'

import { FormAccion } from '@/components/form-accion'
import { Boton, Campo, Input, Select, Textarea } from '@/components/ui'
import { nuevaReparacion } from '../actions'

export function FormReparacion({
  sucursales,
  sucursalPropia,
  modelos,
}: {
  sucursales: { id: number; nombre: string }[]
  sucursalPropia: string | null
  modelos: string[]
}) {
  return (
    <FormAccion accion={nuevaReparacion} className="space-y-5 p-5">
      {(estado, enviando) => {
        const e = estado.errores ?? {}
        return (
          <>
            {sucursalPropia === null && (
              <Campo etiqueta="Sucursal donde se recibe">
                <Select name="sucursal_id" required defaultValue="">
                  <option value="">Elegí…</option>
                  {sucursales.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </Select>
              </Campo>
            )}
            <fieldset className="grid gap-4 sm:grid-cols-2">
              <legend className="mb-2 text-xs font-semibold tracking-wide text-apagado uppercase">Cliente</legend>
              <Campo etiqueta="Nombre y apellido">
                <Input name="cliente_nombre" required maxLength={120} autoComplete="off" />
              </Campo>
              <Campo etiqueta="Teléfono / WhatsApp" ayuda="Para avisarle cuando esté listo.">
                <Input name="cliente_telefono" inputMode="tel" maxLength={40} placeholder="Ej.: 379 4123456" autoComplete="off" />
              </Campo>
            </fieldset>
            <fieldset className="grid gap-4 sm:grid-cols-2">
              <legend className="mb-2 text-xs font-semibold tracking-wide text-apagado uppercase">Equipo</legend>
              <Campo etiqueta="Marca y modelo">
                <Input name="equipo" list="modelos-equipo" required maxLength={120} placeholder="Ej.: Samsung A15" autoComplete="off" />
                <datalist id="modelos-equipo">
                  {modelos.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </Campo>
              <Campo etiqueta="IMEI o n.º de serie" ayuda="Opcional.">
                <Input name="imei" maxLength={40} inputMode="numeric" autoComplete="off" />
              </Campo>
              <div className="sm:col-span-2">
                <Campo etiqueta="Qué le pasa">
                  <Textarea name="falla" required rows={3} maxLength={1000} placeholder="Ej.: pantalla rota, no da imagen. No carga." />
                </Campo>
              </div>
              <div className="sm:col-span-2">
                <Campo etiqueta="Cómo se recibe" ayuda="Rayas, golpes, con funda, con chip o memoria. Queda en el comprobante.">
                  <Textarea name="estado_equipo" rows={2} maxLength={1000} placeholder="Ej.: tapa rayada, sin chip, con funda." />
                </Campo>
              </div>
            </fieldset>
            <fieldset className="grid gap-4 sm:grid-cols-2">
              <legend className="mb-2 text-xs font-semibold tracking-wide text-apagado uppercase">Presupuesto</legend>
              <Campo etiqueta="Presupuesto estimado" ayuda="Opcional. Lo que se cobra se pone al terminar." error={e.presupuesto}>
                <Input name="presupuesto" inputMode="decimal" placeholder="0" />
              </Campo>
              <Campo etiqueta="Para cuándo" ayuda="Opcional.">
                <Input name="prometido" type="date" />
              </Campo>
            </fieldset>
            <Boton type="submit" disabled={enviando} className="h-12 w-full text-base sm:w-auto sm:px-8">
              {enviando ? 'Guardando…' : 'Guardar e imprimir comprobante'}
            </Boton>
          </>
        )
      }}
    </FormAccion>
  )
}
