import type { Metadata } from 'next'
import Link from 'next/link'
import { db } from '@/lib/db'
import { puede, requerirPermiso } from '@/lib/dal'
import { formatoPesos } from '@/lib/formato'
import { ESTADOS_REPARACION, estadoVisible, numeroReparacion, type EstadoReparacion, type MotivoCierre } from '@/lib/reparaciones'
import { BotonLink, Encabezado, Etiqueta, Input, Select, Tarjeta, Vacio } from '@/components/ui'
import { CambioRapido } from './cambio-rapido'

export const metadata: Metadata = { title: 'Área técnica' }

const VISTAS = [
  { clave: 'pendientes', texto: 'Por reparar', estados: ['ingresado', 'en_reparacion'] },
  { clave: 'listos', texto: 'Terminados (esperan retiro)', estados: ['listo', 'sin_reparacion'] },
  { clave: 'entregados', texto: 'Entregados', estados: ['entregado'] },
] as const

const fecha = (d: Date) =>
  new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d)
const dias = (d: Date) => Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000))

type Fila = {
  id: number
  creado: Date
  cliente_nombre: string
  equipo: string
  imei: string | null
  falla: string
  estado_equipo: string | null
  tipo_reparacion: string | null
  estado: EstadoReparacion
  etapa_id: number | null
  etapa: string | null
  motivo_cierre: MotivoCierre | null
  tecnico_id: number | null
  tecnico: string | null
  garantia_de: number | null
  presupuesto: number | null
  precio: number | null
  sucursal: string
  prometido: string | null
}

export default async function TallerPage(props: PageProps<'/taller'>) {
  const u = await requerirPermiso('reparaciones_estado')
  const sp = await props.searchParams
  const vista = VISTAS.find((v) => v.clave === sp.ver) ?? VISTAS[0]
  const q = typeof sp.q === 'string' ? sp.q.trim().slice(0, 60) : ''
  const todas = u.rol === 'admin'
  const sucursalId = todas ? Number(sp.sucursal) || null : u.sucursal_id
  const mios = sp.mios === '1' && !!u.tecnico_id
  const sql = db()
  const deSucursal = sucursalId ? sql`and r.sucursal_id = ${sucursalId}` : sql``
  const num = Number(q.replace(/^r-?/i, '').replace(/\D/g, ''))
  const busqueda = q
    ? sql`and (${num ? sql`r.id = ${num} or` : sql``} r.cliente_nombre ilike ${'%' + q + '%'} or r.equipo ilike ${'%' + q + '%'} or r.imei ilike ${'%' + q + '%'})`
    : sql``

  const [filas, [c], sucursales, etapas] = await Promise.all([
    sql<Fila[]>`
      select r.id, r.creado, r.cliente_nombre, r.equipo, r.imei, r.falla, r.estado_equipo, r.tipo_reparacion, r.estado, r.etapa_id, e.nombre as etapa,
        r.motivo_cierre, r.tecnico_id, t.nombre as tecnico, r.garantia_de, r.presupuesto, r.precio, s.nombre as sucursal,
        to_char(r.prometido, 'DD/MM') as prometido
      from reparaciones r join sucursales s on s.id = r.sucursal_id
      left join reparacion_etapas e on e.id = r.etapa_id left join tecnicos t on t.id = r.tecnico_id
      where r.estado = any(${vista.estados as unknown as string[]}::text[]) ${deSucursal} ${busqueda}
        ${mios ? sql`and r.tecnico_id = ${u.tecnico_id}` : sql``}
      order by ${
        vista.clave === 'pendientes'
          ? sql`case r.estado when 'ingresado' then 0 else 1 end, r.prometido nulls last, r.creado`
          : vista.clave === 'listos'
            ? sql`r.listo_en desc nulls last`
            : sql`r.entregado_en desc nulls last`
      }
      limit 300`,
    sql<{ nuevos: number; taller: number; listos: number; hoy: number }[]>`
      select
        count(*) filter (where r.estado = 'ingresado')::int as nuevos,
        count(*) filter (where r.estado = 'en_reparacion')::int as taller,
        count(*) filter (where r.estado in ('listo', 'sin_reparacion'))::int as listos,
        count(*) filter (where r.listo_en >= (now() at time zone 'America/Argentina/Buenos_Aires')::date::timestamp at time zone 'America/Argentina/Buenos_Aires')::int as hoy
      from reparaciones r where r.estado <> 'cancelado' ${deSucursal}`,
    todas ? sql<{ id: number; nombre: string }[]>`select id, nombre from sucursales where activa and tipo <> 'deposito' order by nombre` : [],
    sql<{ id: number; nombre: string }[]>`select id, nombre from reparacion_etapas where activa and fase <> 'listo' order by orden, id`,
  ])

  const enlace = (cambios: Record<string, string | null>) => {
    const p = new URLSearchParams()
    const actual: Record<string, string | null> = {
      ver: vista.clave === 'pendientes' ? null : vista.clave,
      q: q || null,
      sucursal: sucursalId && todas ? String(sucursalId) : null,
      mios: mios ? '1' : null,
      ...cambios,
    }
    for (const [k, v] of Object.entries(actual)) if (v) p.set(k, v)
    const s = p.toString()
    return s ? `/taller?${s}` : '/taller'
  }

  return (
    <>
      <Encabezado
        titulo="Área técnica"
        detalle={
          todas
            ? 'Los equipos que recibieron todas las sucursales. Informá en qué estado está cada uno: la sucursal y el cliente lo ven al instante.'
            : `Los equipos de ${u.sucursal_nombre}. Informá en qué estado está cada uno: el cliente lo ve al instante.`
        }
        acciones={
          <div className="flex flex-wrap gap-2">
            <BotonLink href="/reparaciones/reporte" variante="secundario">
              Reporte
            </BotonLink>
            {puede(u, 'reparaciones_config') && (
              <BotonLink href="/reparaciones/configuracion" variante="secundario">
                Configuración
              </BotonLink>
            )}
          </div>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { t: 'Nuevos, sin revisar', v: c.nuevos, destacar: c.nuevos > 0 },
          { t: 'En reparación', v: c.taller },
          { t: 'Terminados, esperan retiro', v: c.listos },
          { t: 'Terminados hoy', v: c.hoy },
        ].map((x) => (
          <Tarjeta key={x.t} className="p-4">
            <p className="text-xs font-medium text-tinta-suave">{x.t}</p>
            <p className={`num mt-1 text-2xl font-bold ${x.destacar ? 'text-alerta' : ''}`}>{x.v}</p>
          </Tarjeta>
        ))}
      </div>

      <nav className="mb-4 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-linea [scrollbar-width:none]" aria-label="Vista">
        {VISTAS.map((v) => (
          <Link
            key={v.clave}
            href={enlace({ ver: v.clave === 'pendientes' ? null : v.clave })}
            aria-current={vista.clave === v.clave ? 'page' : undefined}
            className={`-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium ${vista.clave === v.clave ? 'border-marca text-marca' : 'border-transparent text-tinta-suave hover:text-tinta'}`}
          >
            {v.texto}
          </Link>
        ))}
      </nav>

      <form className={`mb-4 grid gap-2 ${todas ? 'sm:grid-cols-[1fr_220px_auto]' : 'sm:grid-cols-[1fr_auto]'}`}>
        {vista.clave !== 'pendientes' && <input type="hidden" name="ver" value={vista.clave} />}
        {mios && <input type="hidden" name="mios" value="1" />}
        <Input name="q" defaultValue={q} placeholder="Buscar por número, cliente, equipo o IMEI" aria-label="Buscar equipo" />
        {todas && (
          <Select name="sucursal" defaultValue={sucursalId ?? ''} aria-label="Sucursal">
            <option value="">Todas las sucursales</option>
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </Select>
        )}
        <button className="h-10 rounded-lg bg-tinta px-5 text-sm font-semibold text-papel hover:bg-tinta/90">Buscar</button>
      </form>
      {u.tecnico_id && (
        <div className="mb-4 flex gap-2 text-sm">
          <Link
            href={enlace({ mios: null })}
            className={`rounded-full border px-3 py-1.5 font-medium ${!mios ? 'border-marca bg-marca-clara text-marca' : 'border-linea text-tinta-suave'}`}
          >
            Todos
          </Link>
          <Link
            href={enlace({ mios: '1' })}
            className={`rounded-full border px-3 py-1.5 font-medium ${mios ? 'border-marca bg-marca-clara text-marca' : 'border-linea text-tinta-suave'}`}
          >
            Los que tengo yo
          </Link>
        </div>
      )}

      {filas.length === 0 ? (
        <Tarjeta>
          <Vacio>{q ? 'No encontramos equipos con esa búsqueda.' : vista.clave === 'pendientes' ? 'No hay equipos por reparar. ¡Al día!' : 'No hay equipos en esta lista.'}</Vacio>
        </Tarjeta>
      ) : (
        <ul className="grid gap-3 xl:grid-cols-2">
          {filas.map((r) => {
            const e = ESTADOS_REPARACION[r.estado]
            const d = dias(r.creado)
            const abierta = r.estado === 'ingresado' || r.estado === 'en_reparacion'
            return (
              <li key={r.id}>
                <Tarjeta className={`flex h-full flex-col p-4 ${r.estado === 'ingresado' ? 'border-alerta/40' : ''}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs text-apagado">
                        <Link href={`/reparaciones/${r.id}`} className="font-mono font-semibold text-marca hover:underline">
                          {numeroReparacion(r.id)}
                        </Link>
                        {' · '}
                        <span className="font-medium text-tinta-suave">{r.sucursal}</span>
                        {' · '}
                        {fecha(r.creado)}
                      </p>
                      <Link href={`/reparaciones/${r.id}`} className="mt-1 block text-base font-semibold hover:underline">
                        {r.equipo}
                      </Link>
                    </div>
                    <div className="text-right">
                      <Etiqueta tono={e.tono}>{r.estado === 'ingresado' ? 'Nuevo' : estadoVisible(r)}</Etiqueta>
                      {abierta && d >= 3 && <p className="mt-1 text-xs font-medium text-alerta">hace {d} días</p>}
                    </div>
                  </div>
                  <dl className="mt-2 space-y-1 text-sm">
                    {r.tipo_reparacion && (
                      <div className="flex gap-1.5">
                        <dt className="text-apagado">Reparación:</dt>
                        <dd className="font-medium">{r.tipo_reparacion}</dd>
                      </div>
                    )}
                    <div className="flex gap-1.5">
                      <dt className="shrink-0 text-apagado">Falla:</dt>
                      <dd className="line-clamp-2">{r.falla}</dd>
                    </div>
                    {r.estado_equipo && (
                      <div className="flex gap-1.5">
                        <dt className="shrink-0 text-apagado">Se recibió:</dt>
                        <dd className="line-clamp-1 text-tinta-suave">{r.estado_equipo}</dd>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-tinta-suave">
                      <span>Cliente: {r.cliente_nombre.split(' ')[0]}</span>
                      {r.precio != null ? (
                        <span className="num">A cobrar {formatoPesos(Number(r.precio))}</span>
                      ) : (
                        r.presupuesto != null && <span className="num">Presupuesto {formatoPesos(Number(r.presupuesto))}</span>
                      )}
                      {r.prometido && abierta && <span>Prometido {r.prometido}</span>}
                      {r.tecnico && <span>Técnico: {r.tecnico}</span>}
                    </div>
                    {r.garantia_de && <p className="text-xs font-semibold text-alerta">Vuelve por garantía de {numeroReparacion(r.garantia_de)}</p>}
                  </dl>
                  {r.estado !== 'entregado' && (
                    <div className="mt-auto pt-3">
                      <CambioRapido id={r.id} etapaId={r.etapa_id} etapas={etapas} listo={!abierta} />
                    </div>
                  )}
                </Tarjeta>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
