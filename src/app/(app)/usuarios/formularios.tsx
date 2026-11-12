'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { FormAccion } from '@/components/form-accion'
import { Aviso, Boton, Campo, Input, Select } from '@/components/ui'
import { NOMBRE_BASE, permisosDeRol } from '@/lib/permisos'
import { cambiarPassword, codigoAcceso, crearUsuario, editarUsuario, moverUsuario } from './actions'
import type { RolOpcion, SucursalOpcion, UsuarioFila } from './page'

function CamposRol({
  rolInicial,
  sucursalInicial,
  descuentoInicial = 10,
  sucursales,
  roles,
}: {
  rolInicial: number | null
  sucursalInicial?: number | null
  descuentoInicial?: number
  sucursales: SucursalOpcion[]
  roles: RolOpcion[]
}) {
  const [rolId, setRolId] = useState<number | null>(rolInicial)
  const rol = roles.find((r) => r.id === rolId)
  const base = rol?.base
  const opciones = sucursales.filter((s) => (base === 'deposito' ? s.tipo === 'deposito' : base === 'vendedora' ? s.tipo !== 'deposito' : true))
  const vende = rol ? permisosDeRol(rol).includes('vender') && !permisosDeRol(rol).includes('descuento_libre') : false
  return (
    <>
      <Campo etiqueta="Rol" ayuda={rol?.descripcion ?? 'Los roles y sus permisos se arman en "Roles y permisos".'}>
        <Select name="rol_id" value={rolId ?? ''} onChange={(e) => setRolId(Number(e.target.value) || null)} required>
          <option value="">Elegí…</option>
          {(['vendedora', 'deposito', 'admin'] as const).map((b) => (
            <optgroup key={b} label={NOMBRE_BASE[b]}>
              {roles
                .filter((r) => r.base === b)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre}
                  </option>
                ))}
            </optgroup>
          ))}
        </Select>
      </Campo>
      {base && base !== 'admin' && (
        <Campo etiqueta={base === 'deposito' ? 'Depósito' : 'Dónde trabaja'}>
          <Select
            name="sucursal_id"
            key={base}
            defaultValue={opciones.some((s) => s.id === sucursalInicial) ? (sucursalInicial ?? '') : opciones.length === 1 ? opciones[0].id : ''}
            required
          >
            <option value="">Elegí…</option>
            {opciones.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </Select>
        </Campo>
      )}
      {base === 'admin' && <p className="text-xs text-tinta-suave">Este rol trabaja en todas las sucursales: no se ubica en una.</p>}
      {vende ? (
        <Campo etiqueta="Descuento máximo" ayuda="Lo máximo que puede descontar en una venta (%).">
          <Input name="descuento_max" inputMode="decimal" defaultValue={descuentoInicial} />
        </Campo>
      ) : (
        <input type="hidden" name="descuento_max" value={descuentoInicial} />
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

export function NuevoUsuario({ sucursales, roles }: { sucursales: SucursalOpcion[]; roles: RolOpcion[] }) {
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
          <CamposRol rolInicial={roles.find((r) => r.sistema && r.base === 'vendedora')?.id ?? null} sucursales={sucursales} roles={roles} />
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
  roles,
  esYo,
  children,
}: {
  usuario: UsuarioFila
  sucursales: SucursalOpcion[]
  roles: RolOpcion[]
  esYo: boolean
  children: ReactNode
}) {
  const [modo, setModo] = useState<'ver' | 'editar' | 'clave' | 'mover'>('ver')
  const [movido, setMovido] = useState<{ ok?: string; error?: string } | null>(null)
  const [moviendo, mover] = useTransition()
  const router = useRouter()
  const [codigo, setCodigo] = useState<{ codigo?: string; error?: string } | null>(null)
  const [generando, iniciar] = useTransition()
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        {children}
        {modo === 'ver' && (
          <div className="flex flex-wrap gap-1">
            {usuario.activo && usuario.rol !== 'admin' && (
              <button onClick={() => { setMovido(null); setModo('mover') }} className="rounded-md px-2 py-1 text-xs font-medium text-marca hover:bg-marca-clara">
                Mover
              </button>
            )}
            <button onClick={() => setModo('editar')} className="rounded-md px-2 py-1 text-xs font-medium text-tinta-suave hover:bg-fondo">
              Editar
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
      {modo === 'mover' && (
        <form
          className="mt-3 flex flex-wrap items-end gap-2 rounded-lg bg-fondo p-4"
          onSubmit={(e) => {
            e.preventDefault()
            const destino = Number(new FormData(e.currentTarget).get('destino'))
            mover(async () => {
              const r = await moverUsuario(usuario.id, destino)
              setMovido(r)
              if (r.ok) {
                setModo('ver')
                // La fila cambia de grupo y se vuelve a armar: el aviso lo muestra la página.
                router.replace(`/usuarios?movido=${usuario.id}`, { scroll: false })
              }
            })
          }}
        >
          <Campo etiqueta={`Pasar a ${usuario.nombre.split(' ')[0]} a`} className="min-w-52 flex-1">
            <Select name="destino" defaultValue="" required aria-label="Sucursal de destino">
              <option value="">Elegí la sucursal…</option>
              {sucursales
                .filter((s) => s.id !== usuario.sucursal_id && (usuario.rol === 'deposito' ? s.tipo === 'deposito' : s.tipo !== 'deposito'))
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
            </Select>
          </Campo>
          <Boton type="submit" disabled={moviendo}>
            {moviendo ? 'Moviendo…' : 'Mover'}
          </Boton>
          <Boton type="button" variante="secundario" onClick={() => setModo('ver')}>
            Cancelar
          </Boton>
          {movido?.error && (
            <div className="w-full">
              <Aviso tipo="error">{movido.error}</Aviso>
            </div>
          )}
        </form>
      )}
      {modo === 'editar' && (
        <FormAccion accion={editarUsuario} alGuardar={() => setModo('ver')} className="mt-4 rounded-lg bg-fondo p-4">
          {(_, enviando) => (
            <div className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="id" value={usuario.id} />
              <Campo etiqueta="Nombre">
                <Input name="nombre" defaultValue={usuario.nombre} required />
              </Campo>
              <CamposRol rolInicial={usuario.rol_id} sucursalInicial={usuario.sucursal_id} descuentoInicial={Number(usuario.descuento_max)} sucursales={sucursales} roles={roles} />
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
