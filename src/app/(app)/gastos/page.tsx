import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { requerirVendedor } from '@/lib/dal'
import { leerAjustes } from '@/lib/ajustes'
import { separarLista } from '@/lib/articulos'
import { cajaAbierta } from '@/lib/ventas'
import { formatoDia, formatoPesos, hoyAR } from '@/lib/formato'
import { MEDIOS_GASTO, type MedioGasto } from '@/lib/compras-tipos'
import { Encabezado, Input, Select, Tarjeta, TituloTarjeta, Vacio, tablaCls as t } from '@/components/ui'
import { AnularGasto, FormGasto } from './form'

export const metadata: Metadata = { title: 'Gastos' }

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export default async function GastosPage(props: PageProps<'/gastos'>) {
  const u = await requerirVendedor()
  const esAdmin = u.rol === 'admin'
  const sp = await props.searchParams
  const hoy = hoyAR()
  const mes = typeof sp.mes === 'string' && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : hoy.slice(0, 7)
  const sucursal = esAdmin ? (typeof sp.sucursal === 'string' ? sp.sucursal : '') : String(u.sucursal_id ?? '')
  const desde = `${mes}-01`
  const sql = db()
  const [ajustes, sucursales, caja, filas] = await Promise.all([
    leerAjustes(),
    sql<{ id: number; nombre: string }[]>`select id, nombre from sucursales where activa order by nombre`,
    cajaAbierta(sql, u.id),
    sql<{ id: number; fecha: Date; categoria: string; descripcion: string | null; monto: number; medio: MedioGasto; caja: boolean; anulado: boolean; sucursal: string | null; usuario: string | null }[]>`
      select g.id, g.fecha, g.categoria, g.descripcion, g.monto, g.medio, g.movimiento_caja_id is not null as caja, g.anulado,
        s.nombre as sucursal, us.nombre as usuario
      from gastos g left join sucursales s on s.id = g.sucursal_id left join usuarios us on us.id = g.usuario_id
      where g.fecha >= ${desde}::date and g.fecha < (${desde}::date + interval '1 month')
        ${sucursal === 'general' ? sql`and g.sucursal_id is null` : sucursal ? sql`and g.sucursal_id = ${Number(sucursal)}` : sql``}
        ${esAdmin ? sql`` : sql`and g.usuario_id = ${u.id}`}
      order by g.fecha desc, g.id desc`,
  ])
  const validos = filas.filter((g) => !g.anulado)
  const total = validos.reduce((a, g) => a + Number(g.monto), 0)
  const porCategoria = [...validos.reduce((m, g) => m.set(g.categoria, (m.get(g.categoria) ?? 0) + Number(g.monto)), new Map<string, number>())].sort((a, b) => b[1] - a[1])
  const [anio, m] = mes.split('-').map(Number)
  const opcionesMes = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)) - 1 - i, 1))
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  })

  return (
    <>
      <Encabezado
        titulo={esAdmin ? 'Gastos' : 'Gastos de la caja'}
        detalle={`${esAdmin ? 'Total' : 'Lo que cargaste'} en ${MESES[m - 1]} de ${anio}: ${formatoPesos(total)}.`}
      />
      {esAdmin && (
        <form className="mb-4 grid gap-2 sm:grid-cols-[200px_220px_auto] sm:justify-start">
          <Select name="mes" defaultValue={mes} aria-label="Mes">
            {opcionesMes.map((o) => (
              <option key={o} value={o}>
                {MESES[Number(o.slice(5)) - 1]} {o.slice(0, 4)}
              </option>
            ))}
          </Select>
          <Select name="sucursal" defaultValue={sucursal} aria-label="Sucursal">
            <option value="">Todas las sucursales</option>
            <option value="general">Generales (sin sucursal)</option>
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </Select>
          <button className="h-10 rounded-lg bg-tinta px-5 text-sm font-semibold text-white hover:bg-tinta/90">Ver</button>
        </form>
      )}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <div className="min-w-0 space-y-5">
          {esAdmin && porCategoria.length > 0 && (
            <Tarjeta className="p-5">
              <h2 className="mb-3 text-[15px] font-semibold">Por categoría</h2>
              <ul className="space-y-2">
                {porCategoria.map(([c, v]) => (
                  <li key={c} className="text-sm">
                    <div className="flex justify-between gap-3">
                      <span>{c}</span>
                      <span className="num font-medium">{formatoPesos(v)}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-fondo">
                      <div className="h-1.5 rounded-full bg-marca" style={{ width: `${Math.max(2, (v / total) * 100)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </Tarjeta>
          )}
          <Tarjeta className="overflow-hidden">
            <TituloTarjeta>Detalle</TituloTarjeta>
            {filas.length === 0 ? (
              <Vacio>No hay gastos cargados en {MESES[m - 1]}.</Vacio>
            ) : (
              <div className="overflow-x-auto">
                <table className={t.tabla}>
                  <thead>
                    <tr>
                      <th className={t.th}>Fecha</th>
                      <th className={t.th}>Gasto</th>
                      <th className={`${t.th} hidden md:table-cell`}>Sucursal</th>
                      <th className={`${t.th} text-right`}>Monto</th>
                      {esAdmin && <th className={`${t.th} w-0`} />}
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((g) => (
                      <tr key={g.id} className={g.anulado ? 'text-apagado line-through' : ''}>
                        <td className={`${t.td} whitespace-nowrap text-tinta-suave`}>{formatoDia(g.fecha)}</td>
                        <td className={t.td}>
                          <span className="block font-medium">{g.categoria}</span>
                          <span className="block text-xs text-apagado">
                            {[g.descripcion, `${MEDIOS_GASTO[g.medio]}${g.caja ? ' de la caja' : ''}`, g.usuario].filter(Boolean).join(' · ')}
                          </span>
                        </td>
                        <td className={`${t.td} hidden text-tinta-suave md:table-cell`}>{g.sucursal ?? 'General'}</td>
                        <td className={`${t.td} num text-right font-semibold`}>{formatoPesos(Number(g.monto))}</td>
                        {esAdmin && <td className={t.td}>{!g.anulado && <AnularGasto id={g.id} />}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Tarjeta>
        </div>
        <Tarjeta className="h-fit min-w-0">
          <TituloTarjeta>Cargar un gasto</TituloTarjeta>
          <FormGasto categorias={separarLista(ajustes.categorias_gasto)} sucursales={sucursales} esAdmin={esAdmin} cajaAbierta={!!caja} hoy={hoy} />
        </Tarjeta>
      </div>
    </>
  )
}
