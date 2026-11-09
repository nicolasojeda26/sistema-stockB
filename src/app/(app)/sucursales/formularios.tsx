'use client'

import { useState } from 'react'
import { FormAccion } from '@/components/form-accion'
import { Boton, Campo, Input, Select, Tarjeta, TituloTarjeta } from '@/components/ui'

const TIPOS = { local: 'Local a la calle', online: 'Ventas online (Instagram, WhatsApp)', deposito: 'Depósito central (no vende)' }

function CampoTipo({ valor = 'local' }: { valor?: string }) {
  return (
    <Campo etiqueta="Tipo">
      <Select name="tipo" defaultValue={valor}>
        {Object.entries(TIPOS).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </Select>
    </Campo>
  )
}
import { crearDeposito, crearSucursal, editarDeposito, editarSucursal } from './actions'

export function NuevaSucursal() {
  return (
    <Tarjeta>
      <TituloTarjeta>Nueva sucursal</TituloTarjeta>
      <FormAccion accion={crearSucursal} limpiarAlGuardar className="space-y-4 p-5">
        {(_, enviando) => (
          <>
            <Campo etiqueta="Nombre">
              <Input name="nombre" placeholder="Ej.: San Lorenzo 960" required />
            </Campo>
            <Campo etiqueta="Dirección" ayuda="Opcional">
              <Input name="direccion" placeholder="Ej.: San Lorenzo 960" />
            </Campo>
            <CampoTipo />
            <Boton type="submit" disabled={enviando} className="w-full">
              Crear sucursal
            </Boton>
          </>
        )}
      </FormAccion>
    </Tarjeta>
  )
}

export function EditarSucursal({ sucursal }: { sucursal: { id: number; nombre: string; direccion: string | null; activa: boolean; tipo: string } }) {
  const [abierto, setAbierto] = useState(false)
  if (!abierto)
    return (
      <Boton variante="secundario" className="h-8 px-3" onClick={() => setAbierto(true)}>
        Editar
      </Boton>
    )
  return (
    <FormAccion accion={editarSucursal} alGuardar={() => setAbierto(false)} className="w-full">
      {(_, enviando) => (
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          <input type="hidden" name="id" value={sucursal.id} />
          <Campo etiqueta="Nombre">
            <Input name="nombre" defaultValue={sucursal.nombre} required />
          </Campo>
          <Campo etiqueta="Dirección">
            <Input name="direccion" defaultValue={sucursal.direccion ?? ''} />
          </Campo>
          <CampoTipo valor={sucursal.tipo} />
          <label className="flex h-10 items-center gap-2 text-sm">
            <input type="checkbox" name="activa" defaultChecked={sucursal.activa} className="h-4 w-4 accent-marca" /> Activa
          </label>
          <div className="flex gap-2 sm:col-span-4">
            <Boton type="submit" disabled={enviando}>
              Guardar
            </Boton>
            <Boton type="button" variante="secundario" onClick={() => setAbierto(false)}>
              Cancelar
            </Boton>
          </div>
        </div>
      )}
    </FormAccion>
  )
}

export function NuevoDeposito({ sucursalId }: { sucursalId: number | null }) {
  const [abierto, setAbierto] = useState(false)
  if (!abierto)
    return (
      <button onClick={() => setAbierto(true)} className="text-sm font-medium text-marca hover:underline">
        + Agregar depósito
      </button>
    )
  return (
    <FormAccion accion={crearDeposito} limpiarAlGuardar alGuardar={() => setAbierto(false)}>
      {(_, enviando) => (
        <div className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="sucursal_id" value={sucursalId ?? ''} />
          <Campo etiqueta="Nombre del depósito" className="min-w-48 flex-1">
            <Input name="nombre" placeholder={sucursalId ? 'Ej.: Trastienda' : 'Ej.: Depósito central'} autoFocus required />
          </Campo>
          <Boton type="submit" disabled={enviando}>
            Agregar
          </Boton>
          <Boton type="button" variante="secundario" onClick={() => setAbierto(false)}>
            Cancelar
          </Boton>
        </div>
      )}
    </FormAccion>
  )
}

export function EditarDeposito({ deposito }: { deposito: { id: number; nombre: string; activo: boolean } }) {
  const [abierto, setAbierto] = useState(false)
  if (!abierto)
    return (
      <button onClick={() => setAbierto(true)} className="rounded-md px-2 py-1 text-xs text-tinta-suave hover:bg-fondo">
        Editar
      </button>
    )
  return (
    <FormAccion accion={editarDeposito} alGuardar={() => setAbierto(false)} className="w-full basis-full">
      {(_, enviando) => (
        <div className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="id" value={deposito.id} />
          <Input name="nombre" defaultValue={deposito.nombre} className="min-w-40 flex-1" required aria-label="Nombre" />
          <label className="flex h-10 items-center gap-2 text-sm">
            <input type="checkbox" name="activo" defaultChecked={deposito.activo} className="h-4 w-4 accent-marca" /> Activo
          </label>
          <Boton type="submit" disabled={enviando} className="h-9">
            Guardar
          </Boton>
          <Boton type="button" variante="secundario" className="h-9" onClick={() => setAbierto(false)}>
            Cancelar
          </Boton>
        </div>
      )}
    </FormAccion>
  )
}
