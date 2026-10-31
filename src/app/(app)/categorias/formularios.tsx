'use client'

import { useState } from 'react'
import { FormAccion } from '@/components/form-accion'
import { Boton, Campo, Input } from '@/components/ui'
import { crearCategoria, editarCategoria } from './actions'

export function NuevaCategoria() {
  return (
    <FormAccion accion={crearCategoria} limpiarAlGuardar className="space-y-4 p-5">
      {(_, enviando) => (
        <>
          <Campo etiqueta="Nombre">
            <Input name="nombre" placeholder="Ej.: Remeras" required />
          </Campo>
          <Boton type="submit" disabled={enviando} className="w-full">
            Crear categoría
          </Boton>
        </>
      )}
    </FormAccion>
  )
}

export function EditarCategoria({ categoria }: { categoria: { id: number; nombre: string; activa: boolean } }) {
  const [abierto, setAbierto] = useState(false)
  if (!abierto)
    return (
      <button onClick={() => setAbierto(true)} className="rounded-md px-2 py-1 text-xs text-tinta-suave hover:bg-fondo">
        Editar
      </button>
    )
  return (
    <FormAccion accion={editarCategoria} alGuardar={() => setAbierto(false)}>
      {(_, enviando) => (
        <div className="flex items-center gap-2">
          <input type="hidden" name="id" value={categoria.id} />
          <Input name="nombre" defaultValue={categoria.nombre} className="h-9 w-44" aria-label="Nombre" required />
          <label className="flex items-center gap-1.5 text-xs">
            <input type="checkbox" name="activa" defaultChecked={categoria.activa} className="accent-marca" /> Visible
          </label>
          <Boton type="submit" disabled={enviando} className="h-9 px-3">
            Guardar
          </Boton>
          <Boton type="button" variante="secundario" className="h-9 px-3" onClick={() => setAbierto(false)}>
            ✕
          </Boton>
        </div>
      )}
    </FormAccion>
  )
}
