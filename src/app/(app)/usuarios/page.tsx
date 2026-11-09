import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { requerirAdmin } from '@/lib/dal'
import { Encabezado, Etiqueta, Tarjeta, TituloTarjeta } from '@/components/ui'
import { FilaUsuario, NuevoUsuario } from './formularios'

export const metadata: Metadata = { title: 'Personal' }

export type UsuarioFila = {
  id: number
  usuario: string
  nombre: string
  rol: 'admin' | 'vendedora' | 'deposito'
  sucursal_id: number | null
  sucursal: string | null
  activo: boolean
  descuento_max: number
  sin_clave: boolean
  codigo_pendiente: boolean
}
export type SucursalOpcion = { id: number; nombre: string; tipo: 'local' | 'online' | 'deposito' }

const NOMBRE_ROL = { admin: 'Administración', vendedora: 'Vendedor/a', deposito: 'Encargado de depósito' } as const

export default async function UsuariosPage() {
  const yo = await requerirAdmin()
  const [usuarios, sucursales] = await Promise.all([
    db()<UsuarioFila[]>`
      select u.id, u.usuario, u.nombre, u.rol, u.sucursal_id, s.nombre as sucursal, u.activo, u.descuento_max,
        u.password_hash is null as sin_clave, (u.codigo_acceso is not null and u.codigo_vence > now()) as codigo_pendiente
      from usuarios u left join sucursales s on s.id = u.sucursal_id
      order by u.activo desc, lower(u.nombre)`,
    db()<SucursalOpcion[]>`select id, nombre, tipo from sucursales where activa order by case tipo when 'deposito' then 0 when 'local' then 1 else 2 end, nombre`,
  ])
  // Grupos: administración, cada punto (depósito, locales, online) y los que no tienen acceso.
  const grupos = [
    { clave: 'admin', titulo: 'Administración', personas: usuarios.filter((u) => u.activo && u.rol === 'admin') },
    ...sucursales.map((s) => ({
      clave: `s${s.id}`,
      titulo: s.nombre,
      tipo: s.tipo,
      personas: usuarios.filter((u) => u.activo && u.rol !== 'admin' && u.sucursal_id === s.id),
    })),
    { clave: 'baja', titulo: 'Sin acceso (dados de baja)', personas: usuarios.filter((u) => !u.activo) },
  ].filter((g) => g.personas.length || ('tipo' in g && g.tipo))

  return (
    <>
      <Encabezado
        titulo="Personal"
        detalle="Quién trabaja en cada sucursal. Al sumar a alguien, el sistema te da un código para que cree su propia contraseña: no hace falta pasar claves."
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          {grupos.map((g) => (
            <Tarjeta key={g.clave} className="overflow-hidden">
              <TituloTarjeta
                acciones={
                  'tipo' in g && g.tipo !== 'local' ? <Etiqueta tono="marca">{g.tipo === 'deposito' ? 'Depósito' : 'Online'}</Etiqueta> : undefined
                }
              >
                {g.titulo}
              </TituloTarjeta>
              {g.personas.length === 0 ? (
                <p className="px-5 py-4 text-sm text-apagado">Nadie asignado todavía.</p>
              ) : (
                <ul className="divide-y divide-linea">
                  {g.personas.map((u) => (
                    <li key={u.id} className="px-5 py-3.5">
                      <FilaUsuario usuario={u} sucursales={sucursales} esYo={u.id === yo.id}>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`font-medium ${u.activo ? '' : 'text-apagado'}`}>{u.nombre}</span>
                            {u.rol === 'deposito' && <Etiqueta tono="neutro">{NOMBRE_ROL.deposito}</Etiqueta>}
                            {u.activo && u.sin_clave && <Etiqueta tono="alerta">{u.codigo_pendiente ? 'Falta que cree su contraseña' : 'Sin contraseña: generá un código'}</Etiqueta>}
                            {u.id === yo.id && <Etiqueta tono="ok">Vos</Etiqueta>}
                          </div>
                          <p className="mt-0.5 text-sm text-tinta-suave">
                            @{u.usuario}
                            {u.rol === 'vendedora' ? ` · descuento hasta ${Number(u.descuento_max)} %` : ''}
                            {!u.activo && u.sucursal ? ` · era de ${u.sucursal}` : ''}
                          </p>
                        </div>
                      </FilaUsuario>
                    </li>
                  ))}
                </ul>
              )}
            </Tarjeta>
          ))}
        </div>
        <div className="min-w-0">
          <Tarjeta className="lg:sticky lg:top-6">
            <TituloTarjeta>Sumar a alguien</TituloTarjeta>
            <NuevoUsuario sucursales={sucursales} />
          </Tarjeta>
        </div>
      </div>
    </>
  )
}
