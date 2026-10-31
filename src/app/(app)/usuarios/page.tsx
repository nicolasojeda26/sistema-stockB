import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { requerirAdmin } from '@/lib/dal'
import { Encabezado, Etiqueta, Tarjeta, TituloTarjeta, Vacio } from '@/components/ui'
import { FilaUsuario, NuevoUsuario } from './formularios'

export const metadata: Metadata = { title: 'Usuarios' }

export type UsuarioFila = {
  id: number
  usuario: string
  nombre: string
  rol: 'admin' | 'vendedora'
  sucursal_id: number | null
  sucursal: string | null
  activo: boolean
}

export default async function UsuariosPage() {
  const yo = await requerirAdmin()
  const [usuarios, sucursales] = await Promise.all([
    db()<UsuarioFila[]>`
      select u.id, u.usuario, u.nombre, u.rol, u.sucursal_id, s.nombre as sucursal, u.activo
      from usuarios u left join sucursales s on s.id = u.sucursal_id
      order by u.activo desc, u.rol, lower(u.nombre)`,
    db()<{ id: number; nombre: string }[]>`select id, nombre from sucursales where activa order by nombre`,
  ])

  return (
    <>
      <Encabezado
        titulo="Usuarios"
        detalle="Las vendedoras venden, cobran y cargan mercadería en su sucursal. Las administradoras ven todo y cambian precios."
      />
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <Tarjeta>
          {usuarios.length === 0 ? (
            <Vacio>No hay usuarios.</Vacio>
          ) : (
            <ul className="divide-y divide-linea">
              {usuarios.map((u) => (
                <li key={u.id} className="px-5 py-4">
                  <FilaUsuario usuario={u} sucursales={sucursales} esYo={u.id === yo.id}>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`font-medium ${u.activo ? '' : 'text-apagado'}`}>{u.nombre}</span>
                        <Etiqueta tono={u.rol === 'admin' ? 'marca' : 'neutro'}>
                          {u.rol === 'admin' ? 'Administradora' : 'Vendedora'}
                        </Etiqueta>
                        {!u.activo && <Etiqueta tono="apagado">Sin acceso</Etiqueta>}
                        {u.id === yo.id && <Etiqueta tono="ok">Vos</Etiqueta>}
                      </div>
                      <p className="mt-0.5 text-sm text-tinta-suave">
                        @{u.usuario}
                        {u.sucursal ? ` · ${u.sucursal}` : u.rol === 'admin' ? ' · Todas las sucursales' : ''}
                      </p>
                    </div>
                  </FilaUsuario>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
        <div>
          <Tarjeta>
            <TituloTarjeta>Nuevo usuario</TituloTarjeta>
            <NuevoUsuario sucursales={sucursales} />
          </Tarjeta>
        </div>
      </div>
    </>
  )
}
