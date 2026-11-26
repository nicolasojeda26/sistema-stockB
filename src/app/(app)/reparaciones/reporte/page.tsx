import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { puede, requerirAlguno } from '@/lib/dal'
import { formatoPesos } from '@/lib/formato'
import { reporteTaller } from '@/lib/reparaciones'
import { BotonLink, Encabezado, Input, Select, Tarjeta, TituloTarjeta, tablaCls as t } from '@/components/ui'

export const metadata: Metadata = { title: 'Reporte del área técnica' }

const hoyAR = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
const esFecha = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

export default async function ReporteTallerPage(props: PageProps<'/reparaciones/reporte'>) {
  const u = await requerirAlguno('reparaciones', 'reparaciones_estado')
  const sp = await props.searchParams
  const hoy = hoyAR()
  const desde = esFecha(sp.desde) ? sp.desde : `${hoy.slice(0, 8)}01`
  const hasta = esFecha(sp.hasta) ? sp.hasta : hoy
  const todas = u.rol === 'admin'
  const sucursalId = todas ? Number(sp.sucursal) || null : u.sucursal_id
  const sql = db()
  const [{ resumen: r, porTecnico, porSucursal, porTipo }, sucursales] = await Promise.all([
    reporteTaller(sql, { desde, hasta, sucursalId }),
    todas ? sql<{ id: number; nombre: string }[]>`select id, nombre from sucursales where activa and tipo <> 'deposito' order by nombre` : [],
  ])
  const cerradas = r.reparados + r.sin_solucion + r.no_acepto + r.sin_repuesto + r.devolucion
  const pct = (n: number) => (cerradas ? `${Math.round((n / cerradas) * 100)} %` : '—')
  // Lo cobrado solo lo ve quien ve los reportes de ventas.
  const verPlata = puede(u, 'reportes')

  const tarjetas = [
    { t: 'Ingresaron', v: r.ingresaron, d: r.reingresos ? `${r.reingresos} por garantía` : 'equipos' },
    { t: 'Reparados', v: r.reparados, d: pct(r.reparados) + ' de los cerrados', tono: 'text-ok' },
    { t: 'Sin solución', v: r.sin_solucion, d: 'no se pudo reparar' },
    { t: 'No aceptaron', v: r.no_acepto, d: 'el presupuesto' },
    { t: 'Sin repuesto', v: r.sin_repuesto, d: 'no se consiguió' },
    { t: 'Devoluciones', v: r.devolucion, d: 'retiraron sin reparar' },
    { t: 'En curso', v: r.en_curso, d: 'todavía en el taller' },
    { t: 'Reingresos', v: r.reingresos, d: 'volvieron por garantía', tono: r.reingresos ? 'text-alerta' : '' },
  ]

  return (
    <>
      <Encabezado
        titulo="Reporte del área técnica"
        detalle={`Equipos que ingresaron entre el ${desde.split('-').reverse().join('/')} y el ${hasta.split('-').reverse().join('/')}${todas ? '' : ` en ${u.sucursal_nombre}`}.`}
        acciones={
          <BotonLink href="/reparaciones" variante="secundario">
            ← Reparaciones
          </BotonLink>
        }
      />
      <form className="mb-5 flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-tinta-suave">Desde</span>
          <Input type="date" name="desde" defaultValue={desde} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-tinta-suave">Hasta</span>
          <Input type="date" name="hasta" defaultValue={hasta} />
        </label>
        {todas && (
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-tinta-suave">Sucursal</span>
            <Select name="sucursal" defaultValue={sucursalId ?? ''}>
              <option value="">Todas</option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </Select>
          </label>
        )}
        <button className="h-10 rounded-lg bg-tinta px-5 text-sm font-semibold text-papel hover:bg-tinta/90">Ver</button>
      </form>

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {tarjetas.map((c) => (
          <Tarjeta key={c.t} className="p-4">
            <p className="text-xs font-medium text-tinta-suave">{c.t}</p>
            <p className={`num mt-1 text-2xl font-bold ${c.tono ?? ''}`}>{c.v}</p>
            <p className="text-xs text-apagado">{c.d}</p>
          </Tarjeta>
        ))}
      </div>
      <p className="mb-5 text-sm text-tinta-suave">
        {r.dias_promedio != null ? `Tardan en promedio ${String(r.dias_promedio).replace('.', ',')} días desde que entran hasta que están listos.` : ''}
        {verPlata ? ` Cobrado por reparaciones de estos equipos: ${formatoPesos(r.cobrado)}.` : ''}
      </p>

      <div className="grid gap-5 lg:grid-cols-2">
        <Tarjeta className="overflow-hidden">
          <TituloTarjeta>Por técnico</TituloTarjeta>
          {porTecnico.length === 0 ? (
            <p className="px-5 py-6 text-sm text-apagado">Todavía no hay reparaciones terminadas en el período.</p>
          ) : (
            <table className={t.tabla}>
              <thead>
                <tr>
                  <th className={t.th}>Técnico</th>
                  <th className={`${t.th} text-right`}>Reparados</th>
                  <th className={`${t.th} text-right`}>Sin solución</th>
                  <th className={`${t.th} text-right`}>Volvieron</th>
                </tr>
              </thead>
              <tbody>
                {porTecnico.map((x) => (
                  <tr key={x.tecnico}>
                    <td className={t.td}>{x.tecnico}</td>
                    <td className={`${t.td} num text-right`}>{x.reparados}</td>
                    <td className={`${t.td} num text-right`}>{x.sin_solucion}</td>
                    <td className={`${t.td} num text-right ${x.reingresos ? 'font-semibold text-alerta' : ''}`}>{x.reingresos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Tarjeta>
        <Tarjeta className="overflow-hidden">
          <TituloTarjeta>Tipos de reparación más pedidos</TituloTarjeta>
          {porTipo.length === 0 ? (
            <p className="px-5 py-6 text-sm text-apagado">Sin equipos en el período.</p>
          ) : (
            <ul className="divide-y divide-linea">
              {porTipo.map((x) => (
                <li key={x.tipo} className="flex justify-between px-5 py-2.5 text-sm">
                  <span>{x.tipo}</span>
                  <span className="num font-semibold">{x.cantidad}</span>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
        {todas && !sucursalId && porSucursal.length > 0 && (
          <Tarjeta className="overflow-hidden lg:col-span-2">
            <TituloTarjeta>Por sucursal</TituloTarjeta>
            <table className={t.tabla}>
              <thead>
                <tr>
                  <th className={t.th}>Sucursal</th>
                  <th className={`${t.th} text-right`}>Ingresaron</th>
                  <th className={`${t.th} text-right`}>Reparados</th>
                  <th className={`${t.th} text-right`}>En curso</th>
                </tr>
              </thead>
              <tbody>
                {porSucursal.map((x) => (
                  <tr key={x.sucursal}>
                    <td className={t.td}>{x.sucursal}</td>
                    <td className={`${t.td} num text-right`}>{x.ingresaron}</td>
                    <td className={`${t.td} num text-right`}>{x.reparados}</td>
                    <td className={`${t.td} num text-right`}>{x.en_curso}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Tarjeta>
        )}
      </div>
    </>
  )
}
