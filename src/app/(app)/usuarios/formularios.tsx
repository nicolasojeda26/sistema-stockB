'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { FormAccion } from '@/components/form-accion'
import { Aviso, Boton, Campo, Input, Select } from '@/components/ui'
import { cambiarPassword, codigoAcceso, crearUsuario, editarUsuario } from './actions'
import type { SucursalOpcion, UsuarioFila } from './page'

function CamposRol({
  rolInicial,
  sucursalInicial,
  descuentoInicial = 10,
  sucursales,
}: {
  rolInicial: string
  sucursalInicial?: number | null
  descuentoInicial?: number
  sucursales: SucursalOpcion[]
}) {
  const [rol, setRol] = useState(rolInicial)
  const opciones = sucursales.filter((s) => (rol === 'deposito' ? s.tipo === 'deposito' : rol === 'vendedora' ? s.tipo !== 'deposito' : true))
  return (
    <>
      <Campo etiqueta="Qué hace">
        <Select name="rol" value={rol} onChange={(e) => setRol(e.target.value)}>
          <option value="vendedora">Vende en un local u online</option>
          <option value="deposito">Encargado de depósito</option>
          <option value="admin">Administración (ve y cambia todo)</option>
        </Select>
      </Campo>
      <Campo etiqueta={rol === 'deposito' ? 'Depósito' : 'Dónde trabaja'} ayuda={rol === 'admin' ? 'Opcional: la administración ve todas las sucursales.' : undefined}>
        <Select name="sucursal_id" key={rol} defaultValue={opciones.some((s) => s.id === sucursalInicial) ? (sucursalInicial ?? '') : opciones.length === 1 ? opciones[0].id : ''} required={rol !== 'admin'}>
          <option value="">{rol === 'admin' ? 'Todas' : 'Elegí…'}</option>
          {opciones.map((s) => (
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

/** Sugiere el usuario a partir del nombre: "Clarisa Blanco" → "clarisa". */
const sugerirUsuario = (nombre: string) =>
  nombre
    .trim()
    .split(/\s+/)[0]
    ?.normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '') ?? ''

export function NuevoUsuario({ sucursales }: { sucursales: SucursalOpcion[] }) {
  const [nombre, setNombre] = useState('')
  const [usuario, setUsuario] = useState('')
  const [tocado, setTocado] = useState(false)
  const [conClave, setConClave] = useState(false)
  return (
    <FormAccion
      accion={crearUsuario}
      limpiarAlGuardar
      alGuardar={() => {
        setNombre('')
        setUsuario('')
        setTocado(false)
      }}
      className="space-y-4 p-5"
    >
      {(estado, enviando) => (
        <>
          {estado.ok?.includes('Código de acceso') && <CodigoVisible texto={estado.ok} />}
          <Campo etiqueta="Nombre y apellido">
            <Input
              name="nombre"
              value={nombre}
              onChange={(e) => {
                setNombre(e.target.value)
                if (!tocado) setUsuario(sugerirUsuario(e.target.value))
              }}
              placeholder="Ej.: Clarisa Blanco"
              required
            />
          </Campo>
          <Campo etiqueta="Usuario" ayuda="Con esto entra. En minúsculas y sin espacios.">
            <Input
              name="usuario"
              value={usuario}
              onChange={(e) => {
                setUsuario(e.target.value.toLowerCase())
                setTocado(true)
              }}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
            />
          </Campo>
          <CamposRol rolInicial="vendedora" sucursales={sucursales} />
          {conClave ? (
            <Campo etiqueta="Contraseña" ayuda="Al menos 6 caracteres. Mejor dejá que la cree la persona con el código.">
              <Input name="password" type="text" autoComplete="new-password" minLength={6} />
            </Campo>
          ) : (
            <p className="text-xs text-tinta-suave">
              Al crear, te damos un código para que cree su contraseña.{' '}
              <button type="button" onClick={() => setConClave(true)} className="font-medium text-marca hover:underline">
                Prefiero ponérsela yo
              </button>
            </p>
          )}
          <Boton type="submit" disabled={enviando} className="w-full">
            Sumar
          </Boton>
        </>
      )}
    </FormAccion>
  )
}

/** Muestra el código grande para dictarlo o copiarlo. */
function CodigoVisible({ texto }: { texto: string }) {
  const codigo = texto.match(/[A-Z0-9]{4}-[A-Z0-9]{4}/)?.[0]
  if (!codigo) return null
  return (
    <div className="rounded-xl border border-marca/30 bg-marca-clara p-4 text-center">
      <p className="text-xs font-medium text-marca-oscura">Código de acceso</p>
      <p className="mt-1 font-mono text-2xl font-bold tracking-widest" data-testid="codigo-acceso">
        {codigo}
      </p>
      <button type="button" onClick={() => navigator.clipboard?.writeText(codigo)} className="mt-1 text-xs font-medium text-marca hover:underline">
        Copiar
      </button>
    </div>
  )
}

export function FilaUsuario({
  usuario,
  sucursales,
  esYo,
  children,
}: {
  usuario: UsuarioFila
  sucursales: SucursalOpcion[]
  esYo: boolean
  children: ReactNode
}) {
  const [modo, setModo] = useState<'ver' | 'editar' | 'clave'>('ver')
  const [codigo, setCodigo] = useState<{ codigo?: string; error?: string } | null>(null)
  const [generando, iniciar] = useTransition()
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        {children}
        {modo === 'ver' && (
          <div className="flex flex-wrap gap-1">
            <button onClick={() => setModo('editar')} className="rounded-md px-2 py-1 text-xs font-medium text-tinta-suave hover:bg-fondo">
              Editar / mover
            </button>
            {esYo ? (
              <button onClick={() => setModo('clave')} className="rounded-md px-2 py-1 text-xs font-medium text-tinta-suave hover:bg-fondo">
                Cambiar contraseña
              </button>
            ) : (
              usuario.activo && (
                <button
                  disabled={generando}
                  onClick={() => {
                    if (!usuario.sin_clave && !confirm(`¿Generar un código nuevo para ${usuario.nombre}? Su contraseña actual deja de servir.`)) return
                    iniciar(async () => setCodigo(await codigoAcceso(usuario.id)))
                  }}
                  className="rounded-md px-2 py-1 text-xs font-medium text-tinta-suave hover:bg-fondo"
                >
                  {usuario.sin_clave ? 'Código de acceso' : 'Olvidó la contraseña'}
                </button>
              )
            )}
          </div>
        )}
      </div>
      {codigo && (
        <div className="mt-3">
          {codigo.error ? (
            <Aviso tipo="error">{codigo.error}</Aviso>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-marca/30 bg-marca-clara px-4 py-3">
              <span className="text-sm">
                Código para <b>@{usuario.usuario}</b>:{' '}
                <span className="font-mono text-lg font-bold tracking-widest" data-testid="codigo-acceso">
                  {codigo.codigo}
                </span>
                <span className="block text-xs text-tinta-suave">Vence en 7 días. Entra en &quot;Entrá con tu código de acceso&quot; y crea su contraseña.</span>
              </span>
              <button onClick={() => setCodigo(null)} className="text-xs font-medium text-tinta-suave hover:underline">
                Listo
              </button>
            </div>
          )}
        </div>
      )}
      {modo === 'editar' && (
        <FormAccion accion={editarUsuario} alGuardar={() => setModo('ver')} className="mt-4 rounded-lg bg-fondo p-4">
          {(_, enviando) => (
            <div className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="id" value={usuario.id} />
              <Campo etiqueta="Nombre">
                <Input name="nombre" defaultValue={usuario.nombre} required />
              </Campo>
              <CamposRol rolInicial={usuario.rol} sucursalInicial={usuario.sucursal_id} descuentoInicial={Number(usuario.descuento_max)} sucursales={sucursales} />
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" name="activo" defaultChecked={usuario.activo} disabled={esYo} className="h-4 w-4 accent-marca" />
                {esYo && <input type="hidden" name="activo" value="on" />}
                Puede entrar al sistema (destildá para darle de baja)
              </label>
              <div className="flex gap-2 sm:col-span-2">
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
              <Campo etiqueta="Tu nueva contraseña" className="min-w-52 flex-1">
                <Input name="password" type="password" autoComplete="new-password" minLength={6} required />
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
