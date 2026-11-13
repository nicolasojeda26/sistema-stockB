'use client'

import { FormAccion } from '@/components/form-accion'
import { Boton, Campo, Input, Select, Textarea } from '@/components/ui'
import { guardarAjustes, guardarMarca } from './actions'

export function FormAjustes({
  ajustes,
}: {
  ajustes: {
    nombre_negocio: string
    pie_ticket: string
    ancho_ticket: string
    curvas_talles: string
    colores_frecuentes: string
    categorias_gasto: string
    descuento_transferencia: string
    descuento_efectivo: string
    condiciones_reparacion: string
  }
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
          <fieldset className="rounded-lg border border-linea p-4">
            <legend className="px-1 text-sm font-semibold">Precio según cómo paga</legend>
            <p className="mb-3 text-xs text-tinta-suave">
              El precio de cada producto es el de lista (tarjeta). Al vender se elige el precio, y con transferencia o efectivo se descuenta este %. Un producto
              puede tener precios propios para esas formas (en su ficha). Con 0 no se descuenta nada.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo etiqueta="Transferencia (% menos)">
                <Input name="descuento_transferencia" inputMode="decimal" defaultValue={ajustes.descuento_transferencia} />
              </Campo>
              <Campo etiqueta="Efectivo (% menos)">
                <Input name="descuento_efectivo" inputMode="decimal" defaultValue={ajustes.descuento_efectivo} />
              </Campo>
            </div>
          </fieldset>
          <Campo etiqueta="Listas de modelos" ayuda="Una por línea: marca, dos puntos y los modelos separados por coma. Aparecen al crear un producto con variantes.">
            <Textarea name="curvas_talles" defaultValue={ajustes.curvas_talles} rows={5} className="font-mono text-xs" />
          </Campo>
          <Campo etiqueta="Colores frecuentes" ayuda="Separados por coma.">
            <Input name="colores_frecuentes" defaultValue={ajustes.colores_frecuentes} maxLength={1000} />
          </Campo>
          <Campo etiqueta="Categorías de gastos" ayuda="Separadas por coma. Aparecen al cargar un gasto.">
            <Textarea name="categorias_gasto" defaultValue={ajustes.categorias_gasto} rows={2} />
          </Campo>
          <Campo etiqueta="Condiciones de las reparaciones" ayuda="Van al pie del comprobante que se le da al cliente al dejar el equipo.">
            <Textarea name="condiciones_reparacion" defaultValue={ajustes.condiciones_reparacion} rows={3} maxLength={1000} />
          </Campo>
          <Boton type="submit" disabled={enviando}>
            Guardar
          </Boton>
        </>
      )}
    </FormAccion>
  )
}

export function FormMarca({ color, logo }: { color: string; logo: string | null }) {
  return (
    <FormAccion accion={guardarMarca} className="space-y-4 p-5">
      {(_, enviando) => (
        <>
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-40 items-center justify-center rounded-xl bg-negro px-3">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt="Logo actual" className="max-h-12 max-w-full object-contain" />
              ) : (
                <span className="text-xs text-white/60">Sin logo: se usa el nombre</span>
              )}
            </div>
            <Campo etiqueta="Logo" ayuda="PNG, JPG, WEBP o SVG, hasta 500 KB. Mejor con fondo transparente u oscuro." className="flex-1">
              <input type="file" name="logo" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-fondo file:px-3 file:py-2 file:text-sm file:font-medium" />
            </Campo>
          </div>
          {logo && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="quitar_logo" className="h-4 w-4 accent-marca" /> Quitar el logo y usar el nombre
            </label>
          )}
          <Campo etiqueta="Color de marca" ayuda="El de los botones y enlaces. Vacío = el verde de MegaCel+.">
            <span className="flex items-center gap-3">
              <input type="color" name="color_marca" defaultValue={color || '#457540'} className="h-10 w-16 cursor-pointer rounded-lg border border-linea bg-papel p-1" aria-label="Color de marca" />
              <span className="text-xs text-tinta-suave">Elegí uno oscuro: el texto de los botones es blanco.</span>
            </span>
          </Campo>
          <Boton type="submit" disabled={enviando}>
            Guardar marca
          </Boton>
        </>
      )}
    </FormAccion>
  )
}
