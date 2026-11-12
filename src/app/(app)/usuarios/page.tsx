import type { Metadata } from 'next'
import Link from 'next/link'
import { db } from '@/lib/db'
import { requerirPermiso } from '@/lib/dal'
import { NOMBRE_BASE, permisosDeRol, PERMISOS, type Base } from '@/lib/permisos'
import { Aviso, Encabezado, Etiqueta, Tarjeta, TituloTarjeta, tablaCls as t } from '@/components/ui'
import { FilaUsuario, NuevoUsuario } from './formularios'
import { EditorRol } from './roles'

export const metadata: Metadata = { title: 'Personal y permisos' }

export type UsuarioFila = {
  id: number
  usuario: string
  nombre: string
  rol: Base
  rol_id: number
  rol_nombre: string
  sucursal_id: number | null
  sucursal: string | null
  activo: boolean
  descuento_max: number
  sin_clave: boolean
  codigo_pendiente: boolean
}
export type SucursalOpcion = { id: number; nombre: string; tipo: 'local' | 'online' | 'deposito' }
export type RolOpcion = { id: number; nombre: string; descripcion: string | null; base: Base; sistema: boolean; permisos: string[]; personas: number }

const PESTANAS = [
  { clave: 'personal', texto: 'Personal' },
  { clave: 'roles', texto: 'Roles y permisos' },
  { clave: 'historial', texto: 'Historial' },
] as const

const fecha = (d: Date) =>
  new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }).format(d)

export default async function UsuariosPage(props: PageProps<'/usuarios'>) {
  const yo = await requerirPermiso('personal')
  const sp = await props.searchParams
  const ver = PESTANAS.find((p) => p.clave === sp.ver)?.clave ?? 'personal'
  const sql = db()
  const [usuarios, sucursales, roles] = await Promise.all([
    sql<UsuarioFila[]>`
      select u.id, u.usuario, u.nombre, r.base as rol, u.rol_id, r.nombre as rol_nombre, u.sucursal_id, s.nombre as sucursal, u.activo, u.descuento_max,
        u.password_hash is null as sin_clave, (u.codigo_acceso is not null and u.codigo_vence > now()) as codigo_pendiente
      from usuarios u join roles r on r.id = u.rol_id left join sucursales s on s.id = u.sucursal_id
      order by u.activo desc, lower(u.nombre)`,
    sql<SucursalOpcion[]>`select id, nombre, tipo from sucursales where activa order by case tipo when 'deposito' then 0 when 'local' then 1 else 2 end, nombre`,
    sql<RolOpcion[]>`
      select r.id, r.nombre, r.descripcion, r.base, r.sistema, r.permisos, (select count(*)::int from usuarios u where u.rol_id = r.id and u.activo) as personas
      from roles r order by r.sistema desc, case r.base when 'admin' then 0 when 'vendedora' then 1 else 2 end, lower(r.nombre)`,
  ])

  const movidoId = Number(sp.movido) || null
  const m = movidoId ? usuarios.find((u) => u.id === movidoId) : null
  const movido = m?.sucursal ? { nombre: m.nombre, sucursal: m.sucursal } : null

  return (
    <>
      <Encabezado
        titulo="Personal y permisos"
        detalle="Quién trabaja en cada sucursal, con qué rol y qué puede hacer cada rol. Los cambios rigen al instante."
      />
      <nav className="mb-5 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-linea [scrollbar-width:none]" aria-label="Secciones">
        {PESTANAS.map((p) => (
          <Link
            key={p.clave}
            href={p.clave === 'personal' ? '/usuarios' : `/usuarios?ver=${p.clave}`}
            aria-current={ver === p.clave ? 'page' : undefined}
            className={`-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium ${ver === p.clave ? 'border-marca text-marca' : 'border-transparent text-tinta-suave hover:text-tinta'}`}
          >
            {p.texto}
          </Link>
        ))}
      </nav>
      {ver === 'personal' && movido && (
        <div className="mb-4">
          <Aviso tipo="ok">
            {movido.nombre} pasó a {movido.sucursal}. Desde ahora entra a esa sucursal; el cambio quedó en el historial.
          </Aviso>
        </div>
      )}
      {ver === 'personal' && <Personal usuarios={usuarios} sucursales={sucursales} roles={roles} yoId={yo.id} />}
      {ver === 'roles' && <Roles roles={roles} />}
      {ver === 'historial' && <Historial />}
    </>
  )
}

function Personal({ usuarios, sucursales, roles, yoId }: { usuarios: UsuarioFila[]; sucursales: SucursalOpcion[]; roles: RolOpcion[]; yoId: number }) {
  // Grupos: todas las sucursales, cada punto (depósito, locales, online) y los que no tienen acceso.
  const grupos = [
    { clave: 'admin', titulo: 'Todas las sucursales', personas: usuarios.filter((u) => u.activo && u.rol === 'admin') },
    ...sucursales.map((s) => ({
      clave: `s${s.id}`,
      titulo: s.nombre,
      tipo: s.tipo,
      personas: usuarios.filter((u) => u.activo && u.rol !== 'admin' && u.sucursal_id === s.id),
    })),
    { clave: 'baja', titulo: 'Sin acceso (dados de baja)', personas: usuarios.filter((u) => !u.activo) },
  ].filter((g) => g.personas.length || ('tipo' in g && g.tipo))
  const activos = usuarios.filter((u) => u.activo).length
  const vende = new Set(roles.filter((r) => permisosDeRol(r).includes('vender')).map((r) => r.id))

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-4">
        <p className="text-sm text-tinta-suave">
          {activos} persona{activos === 1 ? '' : 's'} con acceso. Con <b>Mover</b> pasás a alguien a otra sucursal en un paso; con <b>Editar</b> le cambiás el rol.
        </p>
        {grupos.map((g) => (
          <Tarjeta key={g.clave} className="overflow-hidden">
            <TituloTarjeta
              acciones={
                <span className="flex items-center gap-2">
                  {'tipo' in g && g.tipo !== 'local' && <Etiqueta tono="marca">{g.tipo === 'deposito' ? 'Depósito' : 'Online'}</Etiqueta>}
                  <span className="text-xs text-apagado">{g.personas.length}</span>
                </span>
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
                    <FilaUsuario usuario={u} sucursales={sucursales} roles={roles} esYo={u.id === yoId}>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`font-medium ${u.activo ? '' : 'text-apagado'}`}>{u.nombre}</span>
                          <Etiqueta tono={u.rol === 'admin' ? 'marca' : 'neutro'}>{u.rol_nombre}</Etiqueta>
                          {u.activo && u.sin_clave && <Etiqueta tono="alerta">{u.codigo_pendiente ? 'Falta que cree su contraseña' : 'Sin contraseña: generá un código'}</Etiqueta>}
                          {u.id === yoId && <Etiqueta tono="ok">Vos</Etiqueta>}
                        </div>
                        <p className="mt-0.5 text-sm text-tinta-suave">
                          @{u.usuario}
                          {u.rol !== 'admin' && vende.has(u.rol_id) ? ` · descuento hasta ${Number(u.descuento_max)} %` : ''}
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
          <NuevoUsuario sucursales={sucursales} roles={roles} />
        </Tarjeta>
      </div>
    </div>
  )
}

function Roles({ roles }: { roles: RolOpcion[] }) {
  return (
    <div className="space-y-5">
      <p className="max-w-3xl text-sm text-tinta-suave">
        Cada persona tiene un rol. El rol dice <b>dónde trabaja</b> (todas las sucursales, un local u online, o el depósito) y <b>qué puede hacer</b>. Quien trabaja
        en un local o en el depósito solo ve lo de su lugar. Algunos permisos muestran datos de todas las sucursales: esos solo los puede tener un rol de &quot;todas
        las sucursales&quot;.
      </p>
      <Tarjeta className="overflow-hidden">
        <TituloTarjeta>Qué puede hacer cada rol</TituloTarjeta>
        <div className="overflow-x-auto">
          <table className={t.tabla}>
            <thead>
              <tr>
                <th className={`${t.th} sticky left-0 z-10 bg-papel`}>Permiso</th>
                {roles.map((r) => (
                  <th key={r.id} className={`${t.th} text-center whitespace-nowrap`}>
                    {r.nombre}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISOS.map((p) => (
                <tr key={p.clave}>
                  <td className={`${t.td} sticky left-0 z-10 bg-papel`}>
                    <span className="block font-medium">{p.texto}</span>
                    <span className="text-xs text-apagado">{p.grupo}</span>
                  </td>
                  {roles.map((r) => (
                    <td key={r.id} className={`${t.td} text-center`}>
                      {permisosDeRol(r).includes(p.clave) ? (
                        <span className="font-bold text-ok" aria-label="Sí">
                          ✓
                        </span>
                      ) : (
                        <span className="text-apagado" aria-label="No">
                          —
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>
      <div className="grid gap-4 xl:grid-cols-2">
        {roles.map((r) => (
          <EditorRol key={r.id} rol={r} etiquetaBase={NOMBRE_BASE[r.base]} />
        ))}
        <EditorRol rol={null} etiquetaBase="" />
      </div>
    </div>
  )
}

async function Historial() {
  const filas = await db()<{ id: number; creado: Date; persona: string; cambio: string; detalle: string; por: string | null }[]>`
    select h.id, h.creado, u.nombre as persona, h.cambio, h.detalle, p.nombre as por
    from personal_historial h join usuarios u on u.id = h.usuario_id left join usuarios p on p.id = h.hecho_por
    order by h.creado desc, h.id desc limit 200`
  const ETIQUETA: Record<string, string> = { alta: 'Alta', rol: 'Rol', sucursal: 'Pase', baja: 'Baja', reactivacion: 'Vuelve', datos: 'Datos', acceso: 'Acceso' }
  return (
    <Tarjeta className="overflow-hidden">
      <TituloTarjeta>Últimos cambios del personal</TituloTarjeta>
      {filas.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-tinta-suave">
          Todavía no hay cambios registrados. Desde ahora queda anotado cada alta, pase de sucursal, cambio de rol y baja.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className={t.tabla}>
            <thead>
              <tr>
                <th className={t.th}>Fecha</th>
                <th className={t.th}>Persona</th>
                <th className={t.th}>Cambio</th>
                <th className={t.th}>Detalle</th>
                <th className={t.th}>Lo hizo</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id}>
                  <td className={`${t.td} num whitespace-nowrap text-tinta-suave`}>{fecha(f.creado)}</td>
                  <td className={`${t.td} font-medium whitespace-nowrap`}>{f.persona}</td>
                  <td className={t.td}>
                    <Etiqueta tono={f.cambio === 'baja' ? 'error' : f.cambio === 'sucursal' ? 'marca' : 'neutro'}>{ETIQUETA[f.cambio] ?? f.cambio}</Etiqueta>
                  </td>
                  <td className={t.td}>{f.detalle}</td>
                  <td className={`${t.td} whitespace-nowrap text-tinta-suave`}>{f.por ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Tarjeta>
  )
}
