import type { Metadata } from 'next'
import Link from 'next/link'
import { db } from '@/lib/db'
import { puede, requerirUsuario } from '@/lib/dal'
import { formatoEntero, formatoFecha } from '@/lib/formato'
import { BotonLink, Encabezado, Etiqueta, Input, Select, Tarjeta, Vacio, tablaCls as t } from '@/components/ui'

export const metadata: Metadata = { title: 'Movimientos de mercadería' }

const POR_PAGINA = 30
import { NOMBRE_TIPO } from './tipos'
const TONO = { ingreso: 'ok', transferencia: 'marca', ajuste: 'alerta' } as const

type Fila = {
  id: number
  tipo: keyof typeof NOMBRE_TIPO
  creado: Date
  origen: string | null
  destino: string
  motivo: string | null
  nota: string | null
  usuario: string | null
  productos: number
  unidades: number
}

export default async function MovimientosPage(props: PageProps<'/mercaderia'>) {
  const u = await requerirUsuario()
  const sp = await props.searchParams
  const tipo = typeof sp.tipo === 'string' && sp.tipo in NOMBRE_TIPO ? sp.tipo : ''
  const sucursal = u.rol === 'admin' ? Number(sp.sucursal) || null : u.sucursal_id
  const desde = typeof sp.desde === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sp.desde) ? sp.desde : ''
  const hasta = typeof sp.hasta === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sp.hasta) ? sp.hasta : ''
  const pagina = Math.max(1, Number(sp.pagina) || 1)
  const sql = db()

  const where = sql`
    where true
    ${tipo ? sql`and o.tipo = ${tipo}` : sql``}
    ${sucursal ? sql`and (dd.sucursal_id = ${sucursal} or od.sucursal_id = ${sucursal})` : sql``}
    ${desde ? sql`and o.creado >= (${desde}::date)::timestamp at time zone 'America/Argentina/Buenos_Aires'` : sql``}
    ${hasta ? sql`and o.creado < (${hasta}::date + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires'` : sql``}`
  const desdeTablas = sql`
    from operaciones_stock o
    join depositos dd on dd.id = o.deposito_destino_id left join sucursales ds on ds.id = dd.sucursal_id
    left join depositos od on od.id = o.deposito_origen_id left join sucursales os on os.id = od.sucursal_id
    left join usuarios us on us.id = o.usuario_id`

  const [filas, [{ total }], sucursales] = await Promise.all([
    sql<Fila[]>`
      select o.id, o.tipo, o.creado, o.motivo, o.nota, us.nombre as usuario,
        case when od.id is null then null else coalesce(os.nombre, 'Central') || ' · ' || od.nombre end as origen,
        coalesce(ds.nombre, 'Central') || ' · ' || dd.nombre as destino,
        (select count(distinct producto_id)::int from movimientos_stock m where m.operacion_id = o.id) as productos,
        (select coalesce(sum(abs(cantidad)), 0)::int from movimientos_stock m where m.operacion_id = o.id and m.deposito_id = o.deposito_destino_id) as unidades
      ${desdeTablas} ${where}
      order by o.creado desc, o.id desc
      limit ${POR_PAGINA} offset ${(pagina - 1) * POR_PAGINA}`,
    sql<{ total: number }[]>`select count(*)::int as total ${desdeTablas} ${where}`,
    u.rol === 'admin' ? sql<{ id: number; nombre: string }[]>`select id, nombre from sucursales order by nombre` : [],
  ])
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA))
  const enlace = (n: number) => {
    const p = new URLSearchParams()
    if (tipo) p.set('tipo', tipo)
    if (u.rol === 'admin' && sucursal) p.set('sucursal', String(sucursal))
    if (desde) p.set('desde', desde)
    if (hasta) p.set('hasta', hasta)
    if (n > 1) p.set('pagina', String(n))
    return `/mercaderia${p.size ? `?${p}` : ''}`
  }

  return (
    <>
      <Encabezado
        titulo="Movimientos de mercadería"
        detalle={u.rol === 'admin' ? 'Ingresos, transferencias y ajustes de todas las sucursales.' : `Ingresos y transferencias de ${u.sucursal_nombre}.`}
        acciones={
          <>
            {puede(u, 'ingreso') && <BotonLink href="/mercaderia/ingreso">Ingreso</BotonLink>}
            {puede(u, 'transferencias') && (
              <BotonLink href="/mercaderia/transferencia" variante="secundario">
                Transferencia
              </BotonLink>
            )}
            {puede(u, 'ajustes_stock') && (
              <BotonLink href="/mercaderia/ajuste" variante="secundario">
                Ajuste
              </BotonLink>
            )}
          </>
        }
      />

      <form className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[180px_200px_160px_160px_auto]">
        <Select name="tipo" defaultValue={tipo} aria-label="Tipo">
          <option value="">Todos los tipos</option>
          {Object.entries(NOMBRE_TIPO).map(([v, n]) => (
            <option key={v} value={v}>
              {n}
            </option>
          ))}
        </Select>
        {u.rol === 'admin' && (
          <Select name="sucursal" defaultValue={sucursal ?? ''} aria-label="Sucursal">
            <option value="">Todas las sucursales</option>
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </Select>
        )}
        <Input type="date" name="desde" defaultValue={desde} aria-label="Desde" />
        <Input type="date" name="hasta" defaultValue={hasta} aria-label="Hasta" />
        <button className="h-10 rounded-lg bg-tinta px-4 text-sm font-medium text-white hover:bg-tinta/90">Filtrar</button>
      </form>

      <Tarjeta className="overflow-hidden">
        {filas.length === 0 ? (
          <Vacio>No hay movimientos{tipo || desde || hasta ? ' con esos filtros' : ' todavía'}.</Vacio>
        ) : (
          <div className="overflow-x-auto">
            <table className={t.tabla}>
              <thead>
                <tr>
                  <th className={t.th}>Fecha</th>
                  <th className={t.th}>Tipo</th>
                  <th className={t.th}>Depósito</th>
                  <th className={`${t.th} text-right`}>Unidades</th>
                  <th className={`${t.th} hidden md:table-cell`}>Usuario</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((o) => (
                  <tr key={o.id} className="hover:bg-fondo/60">
                    <td className={`${t.td} num whitespace-nowrap`}>
                      <Link href={`/mercaderia/${o.id}`} className="text-marca hover:underline">
                        {formatoFecha(o.creado)}
                      </Link>
                    </td>
                    <td className={t.td}>
                      <Etiqueta tono={TONO[o.tipo]}>{NOMBRE_TIPO[o.tipo]}</Etiqueta>
                      {(o.motivo || o.nota) && <span className="mt-1 block max-w-56 truncate text-xs text-apagado">{[o.motivo, o.nota].filter(Boolean).join(' · ')}</span>}
                    </td>
                    <td className={t.td}>
                      {o.origen && <span className="block text-xs text-apagado">{o.origen} →</span>}
                      {o.destino}
                    </td>
                    <td className={`${t.td} num text-right`}>
                      {formatoEntero(o.unidades)}
                      <span className="block text-xs text-apagado">
                        {formatoEntero(o.productos)} prod.
                      </span>
                    </td>
                    <td className={`${t.td} hidden text-tinta-suave md:table-cell`}>{o.usuario ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>

      {paginas > 1 && (
        <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Páginas">
          <span className="text-tinta-suave">
            Página {pagina} de {paginas}
          </span>
          <div className="flex gap-2">
            {pagina > 1 && (
              <BotonLink variante="secundario" href={enlace(pagina - 1)}>
                Anterior
              </BotonLink>
            )}
            {pagina < paginas && (
              <BotonLink variante="secundario" href={enlace(pagina + 1)}>
                Siguiente
              </BotonLink>
            )}
          </div>
        </nav>
      )}
    </>
  )
}
