'use client'

import { FormAccion } from '@/components/form-accion'
import { Boton, Campo, Input, Select, Textarea } from '@/components/ui'
import { guardarAjustes } from './actions'

export function FormAjustes({
  ajustes,
}: {
  ajustes: { nombre_negocio: string; pie_ticket: string; ancho_ticket: string; curvas_talles: string; colores_frecuentes: string; categorias_gasto: string }
}) {
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
          <Campo etiqueta="Listas de modelos" ayuda="Una por línea: marca, dos puntos y los modelos separados por coma. Aparecen al crear un producto con variantes.">
            <Textarea name="curvas_talles" defaultValue={ajustes.curvas_talles} rows={5} className="font-mono text-xs" />
          </Campo>
          <Campo etiqueta="Colores frecuentes" ayuda="Separados por coma.">
            <Input name="colores_frecuentes" defaultValue={ajustes.colores_frecuentes} maxLength={1000} />
          </Campo>
          <Campo etiqueta="Categorías de gastos" ayuda="Separadas por coma. Aparecen al cargar un gasto.">
            <Textarea name="categorias_gasto" defaultValue={ajustes.categorias_gasto} rows={2} />
          </Campo>
          <Boton type="submit" disabled={enviando}>
            Guardar
          </Boton>
        </>
      )}
    </FormAccion>
  )
}
