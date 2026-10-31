'use client'

import { FormAccion } from '@/components/form-accion'
import { Boton, Campo, Input, Select } from '@/components/ui'
import { cerrar, cerrarOtra, registrarMovimiento } from './actions'

export function MovimientoCaja() {
  return (
    <FormAccion accion={registrarMovimiento} limpiarAlGuardar className="space-y-3 p-5">
      {(_, enviando) => (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Tipo">
              <Select name="tipo" defaultValue="retiro">
                <option value="retiro">Retiro</option>
                <option value="ingreso">Ingreso</option>
              </Select>
            </Campo>
            <Campo etiqueta="Monto">
              <Input name="monto" inputMode="decimal" placeholder="0,00" required />
            </Campo>
          </div>
          <Campo etiqueta="Motivo">
            <Input name="motivo" placeholder="Ej.: pago al flete, cambio" required maxLength={120} />
          </Campo>
          <Boton type="submit" variante="secundario" disabled={enviando} className="w-full">
            Registrar
          </Boton>
        </>
      )}
    </FormAccion>
  )
}

export function CerrarCaja() {
  return (
    <FormAccion accion={cerrar} className="space-y-3 p-5">
      {(_, enviando) => (
        <>
          <Campo etiqueta="Efectivo contado" ayuda="Contá los billetes que hay en la caja ahora.">
            <Input name="contado" inputMode="decimal" placeholder="0,00" required />
          </Campo>
          <Campo etiqueta="Nota" ayuda="Opcional">
            <Input name="nota" maxLength={200} />
          </Campo>
          <Boton
            type="submit"
            disabled={enviando}
            className="w-full"
            onClick={(e) => {
              if (!confirm('¿Cerrar la caja? Después no se pueden registrar más ventas en ella.')) e.preventDefault()
            }}
          >
            Cerrar caja
          </Boton>
        </>
      )}
    </FormAccion>
  )
}

export function CerrarOtraCaja({ cajaId, usuario }: { cajaId: number; usuario: string }) {
  return (
    <FormAccion accion={cerrarOtra} className="space-y-3 p-5">
      {(_, enviando) => (
        <>
          <p className="text-sm text-tinta-suave">{usuario} dejó esta caja abierta. Contá el efectivo y cerrala desde acá.</p>
          <input type="hidden" name="caja_id" value={cajaId} />
          <Campo etiqueta="Efectivo contado">
            <Input name="contado" inputMode="decimal" placeholder="0,00" required />
          </Campo>
          <Campo etiqueta="Nota" ayuda="Opcional">
            <Input name="nota" maxLength={200} />
          </Campo>
          <Boton
            type="submit"
            variante="secundario"
            disabled={enviando}
            className="w-full"
            onClick={(e) => {
              if (!confirm(`¿Cerrar la caja de ${usuario}?`)) e.preventDefault()
            }}
          >
            Cerrar esta caja
          </Boton>
        </>
      )}
    </FormAccion>
  )
}
