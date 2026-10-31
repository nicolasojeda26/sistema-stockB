'use client'

import { useState, type ReactNode } from 'react'
import { FormAccion } from '@/components/form-accion'
import { Boton, Campo, Input, Select } from '@/components/ui'
import { cambiarPassword, crearUsuario, editarUsuario } from './actions'
import type { UsuarioFila } from './page'

type Sucursal = { id: number; nombre: string }

function CamposRol({
  rolInicial,
  sucursalInicial,
  descuentoInicial = 10,
  sucursales,
}: {
  rolInicial: string
  sucursalInicial?: number | null
  descuentoInicial?: number
  sucursales: Sucursal[]
}) {
  const [rol, setRol] = useState(rolInicial)
  return (
    <>
      <Campo etiqueta="Rol">
        <Select name="rol" value={rol} onChange={(e) => setRol(e.target.value)}>
          <option value="vendedora">Vendedora</option>
          <option value="admin">Administradora</option>
        </Select>
      </Campo>
      <Campo
        etiqueta="Sucursal"
        ayuda={rol === 'admin' ? 'Opcional: la administradora ve todas igual.' : 'Donde vende y carga mercadería.'}
      >
        <Select name="sucursal_id" defaultValue={sucursalInicial ?? ''} required={rol === 'vendedora'}>
          <option value="">{rol === 'admin' ? 'Todas' : 'Elegí una…'}</option>
          {sucursales.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </Select>
      </Campo>
      {rol === 'vendedora' && (
        <Campo etiqueta="Descuento máximo" ayuda="Lo máximo que puede descontar en una venta (%).">
          <Input name="descuento_max" inputMode="decimal" defaultValue={descuentoInicial} />
        </Campo>
      )}
    </>
  )
}

export function NuevoUsuario({ sucursales }: { sucursales: Sucursal[] }) {
  return (
    <FormAccion accion={crearUsuario} limpiarAlGuardar className="space-y-4 p-5">
      {(_, enviando) => (
        <>
          <Campo etiqueta="Nombre">
            <Input name="nombre" placeholder="Ej.: Sofía Gómez" required />
          </Campo>
          <Campo etiqueta="Usuario" ayuda="Con esto entra. En minúsculas y sin espacios.">
            <Input name="usuario" placeholder="sofia" autoCapitalize="none" autoCorrect="off" spellCheck={false} required />
          </Campo>
          <CamposRol rolInicial="vendedora" sucursales={sucursales} />
          <Campo etiqueta="Contraseña" ayuda="Al menos 6 caracteres. Se la pasás vos.">
            <Input name="password" type="text" autoComplete="new-password" required minLength={6} />
          </Campo>
          <Boton type="submit" disabled={enviando} className="w-full">
            Crear usuario
          </Boton>
        </>
      )}
    </FormAccion>
  )
}

export function FilaUsuario({
  usuario,
  sucursales,
  esYo,
  children,
}: {
  usuario: UsuarioFila
  sucursales: Sucursal[]
  esYo: boolean
  children: ReactNode
}) {
  const [modo, setModo] = useState<'ver' | 'editar' | 'clave'>('ver')
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        {children}
        {modo === 'ver' && (
          <div className="flex gap-1">
            <button onClick={() => setModo('editar')} className="rounded-md px-2 py-1 text-xs text-tinta-suave hover:bg-fondo">
              Editar
            </button>
            <button onClick={() => setModo('clave')} className="rounded-md px-2 py-1 text-xs text-tinta-suave hover:bg-fondo">
              Cambiar contraseña
            </button>
          </div>
        )}
      </div>
      {modo === 'editar' && (
        <FormAccion accion={editarUsuario} alGuardar={() => setModo('ver')} className="mt-4 rounded-lg bg-fondo p-4">
          {(_, enviando) => (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <input type="hidden" name="id" value={usuario.id} />
              <Campo etiqueta="Nombre">
                <Input name="nombre" defaultValue={usuario.nombre} required />
              </Campo>
              <CamposRol rolInicial={usuario.rol} sucursalInicial={usuario.sucursal_id} descuentoInicial={usuario.descuento_max} sucursales={sucursales} />
              <label className="flex items-center gap-2 text-sm sm:col-span-2 lg:col-span-4">
                <input type="checkbox" name="activo" defaultChecked={usuario.activo} disabled={esYo} className="h-4 w-4 accent-marca" />
                {esYo && <input type="hidden" name="activo" value="on" />}
                Puede entrar al sistema
              </label>
              <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
                <Boton type="submit" disabled={enviando}>
                  Guardar
                </Boton>
                <Boton type="button" variante="secundario" onClick={() => setModo('ver')}>
                  Cancelar
                </Boton>
              </div>
            </div>
          )}
        </FormAccion>
      )}
      {modo === 'clave' && (
        <FormAccion accion={cambiarPassword} limpiarAlGuardar className="mt-4 rounded-lg bg-fondo p-4">
          {(estado, enviando) => (
            <div className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="id" value={usuario.id} />
              <Campo etiqueta={`Nueva contraseña para @${usuario.usuario}`} className="min-w-52 flex-1">
                <Input name="password" type="text" autoComplete="new-password" minLength={6} required />
              </Campo>
              <Boton type="submit" disabled={enviando}>
                Cambiar
              </Boton>
              <Boton type="button" variante="secundario" onClick={() => setModo('ver')}>
                {estado.ok ? 'Listo' : 'Cancelar'}
              </Boton>
            </div>
          )}
        </FormAccion>
      )}
    </div>
  )
}
