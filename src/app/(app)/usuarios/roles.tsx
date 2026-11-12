'use client'

import { useState, useTransition } from 'react'
import { FormAccion } from '@/components/form-accion'
import { Aviso, Boton, Campo, Etiqueta, Input, Select, Tarjeta } from '@/components/ui'
import { NOMBRE_BASE, PERMISOS, permisosDeRol, permitidoEnBase, type Base } from '@/lib/permisos'
import { borrarRol, guardarRol } from './actions'
import type { RolOpcion } from './page'

const GRUPOS = [...new Set(PERMISOS.map((p) => p.grupo))]

export function EditorRol({ rol, etiquetaBase }: { rol: RolOpcion | null; etiquetaBase: string }) {
  const [abierto, setAbierto] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [borrando, iniciar] = useTransition()
  const bloqueado = !!rol && rol.sistema && rol.base === 'admin'

  if (!rol && !abierto)
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="flex min-h-40 items-center justify-center rounded-2xl border-2 border-dashed border-linea p-6 text-sm font-semibold text-marca hover:border-marca hover:bg-marca-clara"
      >
        + Crear un rol nuevo
      </button>
    )

  const permisos = rol ? permisosDeRol(rol) : []
  return (
    <Tarjeta className="p-5" data-testid={rol ? `rol-${rol.nombre}` : 'rol-nuevo'}>
      {rol && !abierto && (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="flex flex-wrap items-center gap-2 font-semibold">
                {rol.nombre}
                {rol.sistema && <Etiqueta tono="apagado">Del sistema</Etiqueta>}
              </h3>
              <p className="mt-0.5 text-sm text-tinta-suave">
                {etiquetaBase} · {rol.personas} persona{rol.personas === 1 ? '' : 's'}
              </p>
              {rol.descripcion && <p className="mt-1 text-sm">{rol.descripcion}</p>}
            </div>
            {!bloqueado && (
              <div className="flex gap-1">
                <button type="button" onClick={() => setAbierto(true)} className="rounded-md px-2 py-1 text-xs font-medium text-tinta-suave hover:bg-fondo">
                  Editar permisos
                </button>
                {!rol.sistema && (
                  <button
                    type="button"
                    disabled={borrando}
                    onClick={() => {
                      if (!confirm(`¿Borrar el rol "${rol.nombre}"?`)) return
                      iniciar(async () => setError((await borrarRol(rol.id)).error ?? null))
                    }}
                    className="rounded-md px-2 py-1 text-xs font-medium text-error hover:bg-error-claro"
                  >
                    Borrar
                  </button>
                )}
              </div>
            )}
          </div>
          {error && (
            <div className="mt-3">
              <Aviso tipo="error">{error}</Aviso>
            </div>
          )}
          <p className="mt-3 text-xs font-medium text-apagado">{bloqueado ? 'Tiene todos los permisos y no se modifica.' : `${permisos.length} permiso${permisos.length === 1 ? '' : 's'}`}</p>
          {!bloqueado && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {permisos.length ? permisos.map((p) => <Etiqueta key={p}>{PERMISOS.find((x) => x.clave === p)?.texto}</Etiqueta>) : <span className="text-sm text-apagado">Ninguno: solo ve el inicio y los productos.</span>}
            </div>
          )}
        </>
      )}
      {abierto && <FormRol rol={rol} cerrar={() => setAbierto(false)} />}
    </Tarjeta>
  )
}

function FormRol({ rol, cerrar }: { rol: RolOpcion | null; cerrar: () => void }) {
  const [base, setBase] = useState<Base>(rol?.base ?? 'vendedora')
  const [marcados, setMarcados] = useState<Set<string>>(new Set(rol ? permisosDeRol(rol) : ['vender', 'clientes', 'pedidos', 'ingreso']))
  const conGente = !!rol && rol.personas > 0
  return (
    <FormAccion accion={guardarRol} alGuardar={cerrar} className="space-y-4">
      {(_, enviando) => (
        <>
          {rol && <input type="hidden" name="id" value={rol.id} />}
          <h3 className="font-semibold">{rol ? `Editar "${rol.nombre}"` : 'Rol nuevo'}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Nombre del rol">
              <Input name="nombre" defaultValue={rol?.nombre} placeholder="Ej.: Encargada de local" maxLength={40} required />
            </Campo>
            <Campo etiqueta="Dónde trabaja" ayuda={conGente ? 'Tiene gente asignada: no se cambia.' : undefined}>
              <Select name="base" value={base} onChange={(e) => setBase(e.target.value as Base)} disabled={conGente}>
                {(Object.keys(NOMBRE_BASE) as Base[]).map((b) => (
                  <option key={b} value={b}>
                    {NOMBRE_BASE[b]}
                  </option>
                ))}
              </Select>
              {conGente && <input type="hidden" name="base" value={base} />}
            </Campo>
          </div>
          <Campo etiqueta="Descripción" ayuda="Opcional, para acordarte para qué es.">
            <Input name="descripcion" defaultValue={rol?.descripcion ?? ''} maxLength={200} />
          </Campo>
          <div className="space-y-4">
            {GRUPOS.map((g) => (
              <fieldset key={g}>
                <legend className="mb-1.5 text-xs font-semibold tracking-wide text-apagado uppercase">{g}</legend>
                <div className="space-y-1">
                  {PERMISOS.filter((p) => p.grupo === g).map((p) => {
                    const valido = permitidoEnBase(p.clave, base)
                    return (
                      <label key={p.clave} className={`flex items-start gap-2.5 rounded-lg px-2 py-1.5 text-sm ${valido ? 'hover:bg-fondo' : 'opacity-50'}`}>
                        <input
                          type="checkbox"
                          name="permisos"
                          value={p.clave}
                          disabled={!valido}
                          checked={valido && marcados.has(p.clave)}
                          onChange={(e) =>
                            setMarcados((m) => {
                              const n = new Set(m)
                              if (e.target.checked) n.add(p.clave)
                              else n.delete(p.clave)
                              return n
                            })
                          }
                          className="mt-0.5 h-4 w-4 shrink-0 accent-marca"
                        />
                        <span>
                          <span className="font-medium">{p.texto}</span>
                          <span className="block text-xs text-tinta-suave">{valido ? p.detalle : 'Solo para roles que trabajan en todas las sucursales.'}</span>
                        </span>
                      </label>
                    )
                  })}
                </div>
              </fieldset>
            ))}
          </div>
          {marcados.has('personal') && base === 'admin' && (
            <Aviso tipo="alerta">Quien maneja el personal puede darse cualquier permiso a sí misma: dáselo solo a gente de confianza.</Aviso>
          )}
          <div className="flex gap-2">
            <Boton type="submit" disabled={enviando}>
              {rol ? 'Guardar' : 'Crear rol'}
            </Boton>
            <Boton type="button" variante="secundario" onClick={cerrar}>
              Cancelar
            </Boton>
          </div>
        </>
      )}
    </FormAccion>
  )
}
