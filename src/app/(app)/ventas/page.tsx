import type { Metadata } from 'next'
import Link from 'next/link'
import { db } from '@/lib/db'
import { requerirVendedor } from '@/lib/dal'
import { formatoEntero, formatoFecha, formatoPesos } from '@/lib/formato'
import { MEDIOS, MEDIOS_VENTA, type MedioPago, type MedioVenta } from '@/lib/venta-calculo'
import { BotonLink, Encabezado, Etiqueta, Input, Select, Tarjeta, Vacio, tablaCls as t } from '@/components/ui'

export const metadata: Metadata = { title: 'Ventas' }

const POR_PAGINA = 50
const hoyAR = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date())
const fecha = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '')

export default async function VentasPage(props: PageProps<'/ventas'>) {
  const u = await requerirVendedor()
  const sp = await props.searchParams
  const desde = fecha(sp.desde) || hoyAR()
  const hasta = fecha(sp.hasta) || desde
  const sucursal = u.rol === 'admin' ? Number(sp.sucursal) || null : u.sucursal_id
  const vendedora = u.rol === 'admin' ? Number(sp.usuario) || null : null
  const medio = typeof sp.medio === 'string' && sp.medio in MEDIOS ? (sp.medio as MedioPago) : null
  const pagina = Math.max(1, Number(sp.pagina) || 1)
  // Apartados pendientes de retirar: de cualquier fecha.
  const apartados = sp.apartados === '1'
  const sql = db()

  const where = sql`
    where ${
      apartados
        ? sql`v.para_retirar and v.estado = 'completada'`
        : sql`v.creado >= (${desde}::date)::timestamp at time zone 'America/Argentina/Buenos_Aires'
      and v.creado < (${hasta}::date + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires'`
    }
      ${sucursal ? sql`and v.sucursal_id = ${sucursal}` : sql``}
      ${vendedora ? sql`and v.usuario_id = ${vendedora}` : sql``}
      ${medio ? sql`and exists (select 1 from venta_pagos p where p.venta_id = v.id and p.medio = ${medio})` : sql``}`

  const [filas, [tot], sucursales, usuarios] = await Promise.all([
    sql<{ id: number; creado: Date; sucursal: string; usuario: string | null; total: number; estado: string; unidades: number; medios: string }[]>`
      select v.id, v.creado, s.nombre as sucursal, us.nombre as usuario, v.total, v.estado,
        (select sum(cantidad)::int from venta_items i where i.venta_id = v.id) as unidades,
        (select string_agg(distinct medio, ',') from venta_pagos p where p.venta_id = v.id) as medios
      from ventas v join sucursales s on s.id = v.sucursal_id left join usuarios us on us.id = v.usuario_id
      ${where}
      order by v.creado desc limit ${POR_PAGINA} offset ${(pagina - 1) * POR_PAGINA}`,
    sql<{ cantidad: number; total: number; anuladas: number; filas: number }[]>`
      select count(*) filter (where v.estado = 'completada')::int as cantidad,
             coalesce(sum(v.total) filter (where v.estado = 'completada'), 0) as total,
             count(*) filter (where v.estado = 'anulada')::int as anuladas,
             count(*)::int as filas
      from ventas v ${where}`,
    u.rol === 'admin' ? sql<{ id: number; nombre: string }[]>`select id, nombre from sucursales order by nombre` : [],
    u.rol === 'admin' ? sql<{ id: number; nombre: string }[]>`select id, nombre from usuarios order by nombre` : [],
  ])
  const paginas = Math.max(1, Math.ceil(tot.filas / POR_PAGINA))
  const [{ pendientes }] = await sql<{ pendientes: number }[]>`
    select count(*)::int as pendientes from ventas where para_retirar and estado = 'completada' ${sucursal ? sql`and sucursal_id = ${sucursal}` : sql``}`
  const enlace = (n: number) => {
    const p = new URLSearchParams({ desde, hasta })
    if (u.rol === 'admin' && sucursal) p.set('sucursal', String(sucursal))
    if (vendedora) p.set('usuario', String(vendedora))
    if (medio) p.set('medio', medio)
    if (n > 1) p.set('pagina', String(n))
    return `/ventas?${p}`
  }

  return (
    <>
      <Encabezado
        titulo="Ventas"
        detalle={u.rol === 'admin' ? 'Todas las sucursales.' : `Ventas de ${u.sucursal_nombre}.`}
        acciones={
          <>
            {(pendientes > 0 || apartados) && (
              <BotonLink href={apartados ? '/ventas' : '/ventas?apartados=1'} variante="secundario">
                {apartados ? 'Ver todas las ventas' : `Apartados para retirar (${pendientes})`}
              </BotonLink>
            )}
            <BotonLink href="/vender">Vender</BotonLink>
          </>
        }
      />

      <form className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[150px_150px_1fr_1fr_1fr_auto]">
        <Input type="date" name="desde" defaultValue={desde} aria-label="Desde" />
        <Input type="date" name="hasta" defaultValue={hasta} aria-label="Hasta" />
        {u.rol === 'admin' ? (
          <>
            <Select name="sucursal" defaultValue={sucursal ?? ''} aria-label="Sucursal">
              <option value="">Todas las sucursales</option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </Select>
            <Select name="usuario" defaultValue={vendedora ?? ''} aria-label="Vendedor">
              <option value="">Todos los vendedores</option>
              {usuarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </Select>
          </>
        ) : (
          <span className="hidden lg:col-span-2 lg:block" />
        )}
        <Select name="medio" defaultValue={medio ?? ''} aria-label="Medio de pago">
          <option value="">Todos los medios</option>
          {(Object.keys(MEDIOS) as MedioPago[]).map((m) => (
            <option key={m} value={m}>
              {MEDIOS[m]}
            </option>
          ))}
        </Select>
        <button className="h-10 rounded-lg bg-tinta px-4 text-sm font-medium text-white hover:bg-tinta/90">Filtrar</button>
      </form>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Tarjeta className="p-4">
          <p className="text-xs text-tinta-suave">Vendido</p>
          <p className="num mt-1 text-2xl font-semibold" data-testid="total-ventas">
            {formatoPesos(tot.total)}
          </p>
        </Tarjeta>
        <Tarjeta className="p-4">
          <p className="text-xs text-tinta-suave">Ventas</p>
          <p className="num mt-1 text-2xl font-semibold">{formatoEntero(tot.cantidad)}</p>
        </Tarjeta>
        <Tarjeta className="p-4">
          <p className="text-xs text-tinta-suave">Ticket promedio</p>
          <p className="num mt-1 text-2xl font-semibold">{formatoPesos(tot.cantidad ? Math.round((tot.total / tot.cantidad) * 100) / 100 : 0)}</p>
        </Tarjeta>
      </div>

      <Tarjeta className="overflow-hidden">
        {filas.length === 0 ? (
          <Vacio>No hay ventas en esas fechas.</Vacio>
        ) : (
          <div className="overflow-x-auto">
            <table className={t.tabla}>
              <thead>
                <tr>
                  <th className={t.th}>N.º</th>
                  <th className={t.th}>Fecha</th>
                  <th className={`${t.th} hidden md:table-cell`}>Sucursal y vendedor</th>
                  <th className={`${t.th} hidden sm:table-cell`}>Pago</th>
                  <th className={`${t.th} text-right`}>Total</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((v) => (
                  <tr key={v.id} className="hover:bg-fondo/60">
                    <td className={t.td}>
                      <Link href={`/ventas/${v.id}`} className="font-medium text-marca hover:underline">
                        {v.id}
                      </Link>
                    </td>
                    <td className={`${t.td} num whitespace-nowrap text-tinta-suave`}>{formatoFecha(v.creado)}</td>
                    <td className={`${t.td} hidden md:table-cell`}>
                      {v.sucursal}
                      <span className="block text-xs text-apagado">{v.usuario ?? '—'}</span>
                    </td>
                    <td className={`${t.td} hidden text-tinta-suave sm:table-cell`}>
                      {v.medios
                        .split(',')
                        .map((m) => MEDIOS_VENTA[m as MedioVenta])
                        .join(' + ')}
                    </td>
                    <td className={`${t.td} num text-right font-medium`}>
                      {v.estado === 'anulada' ? (
                        <>
                          <span className="text-apagado line-through">{formatoPesos(v.total)}</span>
                          <span className="ml-2">
                            <Etiqueta tono="apagado">Anulada</Etiqueta>
                          </span>
                        </>
                      ) : (
                        formatoPesos(v.total)
                      )}
                      <span className="block text-xs font-normal text-apagado">{formatoEntero(v.unidades)} u.</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>
      {tot.anuladas > 0 && <p className="mt-2 text-xs text-apagado">{tot.anuladas} venta(s) anulada(s) no se suman al total.</p>}

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
