'use client'

import { FormAccion } from '@/components/form-accion'
import { Boton, Campo, Input, Select, Textarea } from '@/components/ui'
import { guardarProveedor } from './actions'

export type ProveedorForm = {
  id: number
  nombre: string
  cuit: string | null
  condicion_iva: number | null
  telefono: string | null
  email: string | null
  contacto: string | null
  notas: string | null
  activo: boolean
}

export function FormProveedor({ proveedor }: { proveedor?: ProveedorForm }) {
  return (
    <FormAccion accion={guardarProveedor} className="space-y-4 p-5">
      {({ errores = {} }, enviando) => (
        <>
          {proveedor && <input type="hidden" name="id" value={proveedor.id} />}
          <Campo etiqueta="Nombre o razón social" error={errores.nombre}>
            <Input name="nombre" defaultValue={proveedor?.nombre} required autoFocus={!proveedor} />
          </Campo>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="CUIT" error={errores.cuit} ayuda="Opcional; sirve para el libro IVA">
              <Input name="cuit" defaultValue={proveedor?.cuit ?? ''} inputMode="numeric" />
            </Campo>
            <Campo etiqueta="Condición frente al IVA">
              <Select name="condicion_iva" defaultValue={proveedor?.condicion_iva ?? ''}>
                <option value="">Sin dato</option>
                <option value={1}>Responsable inscripto</option>
                <option value={6}>Monotributista</option>
                <option value={4}>Exento</option>
              </Select>
            </Campo>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Teléfono / WhatsApp">
              <Input name="telefono" defaultValue={proveedor?.telefono ?? ''} inputMode="tel" />
            </Campo>
            <Campo etiqueta="Email">
              <Input name="email" type="email" defaultValue={proveedor?.email ?? ''} />
            </Campo>
          </div>
          <Campo etiqueta="Persona de contacto">
            <Input name="contacto" defaultValue={proveedor?.contacto ?? ''} />
          </Campo>
          <Campo etiqueta="Notas" ayuda="Qué trae, días de visita, CBU, etc.">
            <Textarea name="notas" defaultValue={proveedor?.notas ?? ''} rows={2} />
          </Campo>
          {proveedor && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="activo" defaultChecked={proveedor.activo} className="h-4 w-4 accent-marca" />
              Activo
            </label>
          )}
          <Boton type="submit" disabled={enviando}>
            {proveedor ? 'Guardar cambios' : 'Crear proveedor'}
          </Boton>
        </>
      )}
    </FormAccion>
  )
}
