'use client'

import { FormAccion } from '@/components/form-accion'
import { Boton, Campo, Input, Select, Textarea } from '@/components/ui'
import { guardarCliente } from './actions'

export type ClienteForm = {
  id: number
  nombre: string
  telefono: string | null
  email: string | null
  doc_nro: string | null
  domicilio: string | null
  condicion_iva: number
  notas: string | null
  limite_credito: number
  activo: boolean
}

export function FormCliente({ cliente, esAdmin }: { cliente?: ClienteForm; esAdmin: boolean }) {
  return (
    <FormAccion accion={guardarCliente} className="space-y-4 p-5">
      {({ errores = {} }, enviando) => (
        <>
          {cliente && <input type="hidden" name="id" value={cliente.id} />}
          <Campo etiqueta="Nombre y apellido" error={errores.nombre}>
            <Input name="nombre" defaultValue={cliente?.nombre} required autoFocus={!cliente} />
          </Campo>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Teléfono / WhatsApp">
              <Input name="telefono" defaultValue={cliente?.telefono ?? ''} inputMode="tel" />
            </Campo>
            <Campo etiqueta="Email">
              <Input name="email" type="email" defaultValue={cliente?.email ?? ''} />
            </Campo>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="DNI o CUIT" error={errores.doc_nro} ayuda="Opcional; hace falta para facturarle">
              <Input name="doc_nro" defaultValue={cliente?.doc_nro ?? ''} inputMode="numeric" />
            </Campo>
            <Campo etiqueta="Condición frente al IVA">
              <Select name="condicion_iva" defaultValue={cliente?.condicion_iva ?? 5}>
                <option value={5}>Consumidor final</option>
                <option value={1}>Responsable inscripto</option>
                <option value={6}>Monotributista</option>
                <option value={4}>Exento</option>
              </Select>
            </Campo>
          </div>
          <Campo etiqueta="Domicilio">
            <Input name="domicilio" defaultValue={cliente?.domicilio ?? ''} />
          </Campo>
          <Campo etiqueta="Notas" ayuda="Celular que usa, preferencias, etc.">
            <Textarea name="notas" defaultValue={cliente?.notas ?? ''} rows={2} />
          </Campo>
          {esAdmin && (
            <Campo
              etiqueta="Límite de cuenta corriente"
              error={errores.limite_credito}
              ayuda="Hasta cuánto puede quedar debiendo. En 0 solo puede usar saldo a favor."
            >
              <Input name="limite_credito" inputMode="decimal" defaultValue={cliente ? String(cliente.limite_credito).replace('.', ',') : '0'} />
            </Campo>
          )}
          {esAdmin && cliente && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="activo" defaultChecked={cliente.activo} className="h-4 w-4 accent-marca" />
              Activa
            </label>
          )}
          <Boton type="submit" disabled={enviando}>
            {cliente ? 'Guardar cambios' : 'Crear cliente'}
          </Boton>
        </>
      )}
    </FormAccion>
  )
}
