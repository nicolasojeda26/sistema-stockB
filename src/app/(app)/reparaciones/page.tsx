import type { Metadata } from 'next'
import Link from 'next/link'
import { db } from '@/lib/db'
import { requerirPermiso } from '@/lib/dal'
import { formatoPesos } from '@/lib/formato'
import { ESTADOS_REPARACION, numeroReparacion, type EstadoReparacion } from '@/lib/reparaciones'
import { BotonLink, Encabezado, Etiqueta, Input, Select, Tarjeta, Vacio, tablaCls as t } from '@/components/ui'

export const metadata: Metadata = { title: 'Reparaciones' }

const VISTAS = [
  { clave: 'taller', texto: 'En el local', estados: ['ingresado', 'en_reparacion', 'listo', 'sin_reparacion'] },
  { clave: 'listas', texto: 'Para retirar', estados: ['listo', 'sin_reparacion'] },
  { clave: 'entregadas', texto: 'Entregadas', estados: ['entregado'] },
  { clave: 'todas', texto: 'Todas', estados: ['ingresado', 'en_reparacion', 'listo', 'sin_reparacion', 'entregado', 'cancelado'] },
] as const

const fecha = (d: Date) =>
  new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d)
const dias = (d: Date) => Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000))

export default async function ReparacionesPage(props: PageProps<'/reparaciones'>) {
  const u = await requerirPermiso('reparaciones')
  const sp = await props.searchParams
  const vista = VISTAS.find((v) => v.clave === sp.ver) ?? VISTAS[0]
  const q = typeof sp.q === 'string' ? sp.q.trim().slice(0, 60) : ''
  const sucursalId = u.rol === 'admin' ? Number(sp.sucursal) || null : u.sucursal_id
  const sql = db()
  const deSucursal = sucursalId ? sql`and r.sucursal_id = ${sucursalId}` : sql``
  const num = Number(q.replace(/^r-?/i, '').replace(/\D/g, ''))
  const busqueda = q
    ? sql`and (${num ? sql`r.id = ${num} or` : sql``} r.cliente_nombre ilike ${'%' + q + '%'} or r.equipo ilike ${'%' + q + '%'}
        or r.cliente_telefono ilike ${'%' + q + '%'} or r.imei ilike ${'%' + q + '%'})`
    : sql``

  const [filas, [cuentas], sucursales] = await Promise.all([
    sql<{ id: number; creado: Date; cliente_nombre: string; cliente_telefono: string | null; equipo: string; falla: string; estado: EstadoReparacion; precio: number | null; presupuesto: number | null; sucursal: string; prometido: string | null }[]>`
      select r.id, r.creado, r.cliente_nombre, r.cliente_telefono, r.equipo, r.falla, r.estado, r.precio, r.presupuesto, s.nombre as sucursal,
        to_char(r.prometido, 'DD/MM') as prometido
      from reparaciones r join sucursales s on s.id = r.sucursal_id
      where r.estado = any(${vista.estados as unknown as string[]}::text[]) ${deSucursal} ${busqueda}
      order by case r.estado when 'listo' then 0 when 'sin_reparacion' then 1 when 'en_reparacion' then 2 when 'ingresado' then 3 else 4 end,
        ${vista.clave === 'entregadas' || vista.clave === 'todas' ? sql`r.creado desc` : sql`r.creado`}
      limit 300`,
    sql<{ hoy: number; semana: number; taller: number; listas: number }[]>`
      select
        count(*) filter (where r.creado >= (now() at time zone 'America/Argentina/Buenos_Aires')::date::timestamp at time zone 'America/Argentina/Buenos_Aires')::int as hoy,
        count(*) filter (where r.creado >= now() - interval '7 days')::int as semana,
        count(*) filter (where r.estado in ('ingresado', 'en_reparacion'))::int as taller,
        count(*) filter (where r.estado in ('listo', 'sin_reparacion'))::int as listas
      from reparaciones r where r.estado <> 'cancelado' ${deSucursal}`,
    u.rol === 'admin' ? sql<{ id: number; nombre: string }[]>`select id, nombre from sucursales where activa and tipo <> 'deposito' order by nombre` : [],
  ])

  const enlace = (ver: string) => {
    const p = new URLSearchParams()
    if (ver !== 'taller') p.set('ver', ver)
    if (q) p.set('q', q)
    if (sucursalId && u.rol === 'admin') p.set('sucursal', String(sucursalId))
    const s = p.toString()
    return s ? `/reparaciones?${s}` : '/reparaciones'
  }

  return (
    <>
      <Encabezado
        titulo="Reparaciones"
        detalle={u.rol === 'admin' ? 'Equipos que entraron al servicio técnico en todas las sucursales.' : `Equipos que entraron al servicio técnico en ${u.sucursal_nombre}.`}
        acciones={<BotonLink href="/reparaciones/nueva">Recibir un equipo</BotonLink>}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { t: 'Ingresaron hoy', v: cuentas.hoy },
          { t: 'Últimos 7 días', v: cuentas.semana },
          { t: 'En el taller', v: cuentas.taller },
          { t: 'Para retirar', v: cuentas.listas, destacar: cuentas.listas > 0 },
        ].map((c) => (
          <Tarjeta key={c.t} className="p-4">
            <p className="text-xs font-medium text-tinta-suave">{c.t}</p>
            <p className={`num mt-1 text-2xl font-bold ${c.destacar ? 'text-ok' : ''}`}>{c.v}</p>
          </Tarjeta>
        ))}
      </div>

      <nav className="mb-4 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-linea [scrollbar-width:none]" aria-label="Vista">
        {VISTAS.map((v) => (
          <Link
            key={v.clave}
            href={enlace(v.clave)}
            aria-current={vista.clave === v.clave ? 'page' : undefined}
            className={`-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium ${vista.clave === v.clave ? 'border-marca text-marca' : 'border-transparent text-tinta-suave hover:text-tinta'}`}
          >
            {v.texto}
          </Link>
        ))}
      </nav>

      <form className={`mb-4 grid gap-2 ${u.rol === 'admin' ? 'sm:grid-cols-[1fr_220px_auto]' : 'sm:grid-cols-[1fr_auto]'}`}>
        {vista.clave !== 'taller' && <input type="hidden" name="ver" value={vista.clave} />}
        <Input name="q" defaultValue={q} placeholder="Buscar por número, cliente, teléfono, equipo o IMEI" aria-label="Buscar reparación" />
        {u.rol === 'admin' ? (
          <Select name="sucursal" defaultValue={sucursalId ?? ''} aria-label="Sucursal">
            <option value="">Todas las sucursales</option>
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </Select>
        ) : null}
        <button className="h-10 rounded-lg bg-tinta px-5 text-sm font-semibold text-papel hover:bg-tinta/90">Buscar</button>
      </form>

      <Tarjeta className="overflow-hidden">
        {filas.length === 0 ? (
          <Vacio accion={<BotonLink href="/reparaciones/nueva">Recibir un equipo</BotonLink>}>
            {q ? 'No encontramos reparaciones con esa búsqueda.' : 'No hay equipos en esta lista.'}
          </Vacio>
        ) : (
          <div className="overflow-x-auto">
            <table className={t.tabla}>
              <thead>
                <tr>
                  <th className={t.th}>N.º</th>
                  <th className={t.th}>Equipo y falla</th>
                  <th className={t.th}>Cliente</th>
                  <th className={t.th}>Estado</th>
                  <th className={`${t.th} text-right`}>Importe</th>
                  <th className={t.th}>Ingresó</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((r) => {
                  const e = ESTADOS_REPARACION[r.estado]
                  const d = dias(r.creado)
                  return (
                    <tr key={r.id} className="hover:bg-fondo">
                      <td className={`${t.td} font-mono text-sm`}>
                        <Link href={`/reparaciones/${r.id}`} className="font-semibold text-marca hover:underline">
                          {numeroReparacion(r.id)}
                        </Link>
                      </td>
                      <td className={`${t.td} max-w-xs`}>
                        <Link href={`/reparaciones/${r.id}`} className="block font-medium hover:underline">
                          {r.equipo}
                        </Link>
                        <span className="line-clamp-1 text-sm text-tinta-suave">{r.falla}</span>
                      </td>
                      <td className={t.td}>
                        <span className="block whitespace-nowrap">{r.cliente_nombre}</span>
                        {r.cliente_telefono && <span className="text-xs text-apagado">{r.cliente_telefono}</span>}
                      </td>
                      <td className={t.td}>
                        <Etiqueta tono={e.tono}>{e.texto}</Etiqueta>
                        {r.prometido && ['ingresado', 'en_reparacion'].includes(r.estado) && <span className="mt-1 block text-xs text-apagado">Prometido {r.prometido}</span>}
                      </td>
                      <td className={`${t.td} num text-right whitespace-nowrap`}>
                        {r.precio != null ? formatoPesos(Number(r.precio)) : r.presupuesto != null ? <span className="text-tinta-suave">≈ {formatoPesos(Number(r.presupuesto))}</span> : '—'}
                      </td>
                      <td className={`${t.td} whitespace-nowrap text-sm text-tinta-suave`}>
                        {fecha(r.creado)}
                        {u.rol === 'admin' && <span className="block text-xs">{r.sucursal}</span>}
                        {['ingresado', 'en_reparacion'].includes(r.estado) && d >= 3 && <span className="block text-xs font-medium text-alerta">hace {d} días</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>
    </>
  )
}
