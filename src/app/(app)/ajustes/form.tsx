'use client'

import { FormAccion } from '@/components/form-accion'
import { Boton, Campo, Input, Select } from '@/components/ui'
import { guardarAjustes } from './actions'

export function FormAjustes({ ajustes }: { ajustes: { nombre_negocio: string; pie_ticket: string; ancho_ticket: string } }) {
  return (
    <FormAccion accion={guardarAjustes} className="space-y-4 p-5">
      {(_, enviando) => (
        <>
          <Campo etiqueta="Nombre del negocio">
            <Input name="nombre_negocio" defaultValue={ajustes.nombre_negocio} required maxLength={60} />
          </Campo>
          <Campo etiqueta="Texto al pie del ticket" ayuda="Ej.: política de cambios, Instagram.">
            <Input name="pie_ticket" defaultValue={ajustes.pie_ticket} maxLength={200} />
          </Campo>
          <Campo etiqueta="Ancho del papel" ayuda="El de la impresora de tickets.">
            <Select name="ancho_ticket" defaultValue={ajustes.ancho_ticket}>
              <option value="80">80 mm</option>
              <option value="58">58 mm</option>
            </Select>
          </Campo>
          <Boton type="submit" disabled={enviando}>
            Guardar
          </Boton>
        </>
      )}
    </FormAccion>
  )
}
