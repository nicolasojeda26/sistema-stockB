import type { Metadata } from 'next'
import Link from 'next/link'
import { db } from '@/lib/db'
import { requerirPermiso } from '@/lib/dal'
import { formatoEntero, formatoFecha, formatoPesos } from '@/lib/formato'
import { MEDIOS_VENTA, type MedioVenta } from '@/lib/venta-calculo'
import { fechaValida, hoyAR, inicioDeMes, masVendidos, porDia, porMedio, porSucursal, porVendedora, resumen, sinMovimiento, valorStock } from '@/lib/reportes'
import { Encabezado, Input, Select, Tarjeta, TituloTarjeta, Vacio, tablaCls as t } from '@/components/ui'
import { GraficoDias } from './grafico'

export const metadata: Metadata = { title: 'Reportes' }

export default async function ReportesPage(props: PageProps<'/reportes'>) {
  await requerirPermiso('reportes')
  const sp = await props.searchParams
  const desde = fechaValida(sp.desde) || inicioDeMes()
  const hasta = fechaValida(sp.hasta) || hoyAR()
  const sucursalId = Number(sp.sucursal) || null
  const f = { desde, hasta: hasta < desde ? desde : hasta, sucursalId }
  const sql = db()

  const [r, dias, sucs, vends, medios, top, quietos, valor, sucursales] = await Promise.all([
    resumen(sql, f),
    porDia(sql, f),
    porSucursal(sql, f),
    porVendedora(sql, f),
    porMedio(sql, f),
    masVendidos(sql, f),
    sinMovimiento(sql, sucursalId),
    valorStock(sql, sucursalId),
    sql<{ id: number; nombre: string }[]>`select id, nombre from sucursales order by nombre`,
  ])
  const totalValor = valor.reduce((a, v) => ({ costo: a.costo + Number(v.costo), venta: a.venta + Number(v.venta), unidades: a.unidades + v.unidades }), { costo: 0, venta: 0, unidades: 0 })
  const params = new URLSearchParams({ desde: f.desde, hasta: f.hasta, ...(sucursalId ? { sucursal: String(sucursalId) } : {}) })

  return (
    <>
      <Encabezado
        titulo="Reportes"
        detalle="Ventas, productos y valor del stock. Todo se puede bajar a Excel."
        acciones={
          <a href={`/reportes/exportar?${params}`} className="inline-flex h-10 items-center rounded-lg bg-marca px-4 text-sm font-medium text-white hover:bg-marca-oscura">
            Descargar Excel
          </a>
        }
      />
      <form className="mb-5 grid gap-2 sm:grid-cols-[160px_160px_1fr_auto]">
        <Input type="date" name="desde" defaultValue={f.desde} aria-label="Desde" />
        <Input type="date" name="hasta" defaultValue={f.hasta} aria-label="Hasta" />
        <Select name="sucursal" defaultValue={sucursalId ?? ''} aria-label="Sucursal">
          <option value="">Todas las sucursales</option>
          {sucursales.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </Select>
        <button className="h-10 rounded-lg bg-tinta px-4 text-sm font-medium text-white hover:bg-tinta/90">Ver</button>
      </form>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Dato titulo="Vendido (neto de devoluciones)" valor={formatoPesos(r.neto)} testid="neto" />
        <Dato titulo="Ventas" valor={formatoEntero(r.ventas)} />
        <Dato titulo="Ticket promedio" valor={formatoPesos(r.promedio)} />
        <Dato titulo="Unidades vendidas" valor={formatoEntero(r.unidades)} />
      </div>
      {r.devuelto > 0 && <p className="mt-2 text-xs text-apagado">Incluye {formatoPesos(r.devuelto)} devueltos (vendido bruto: {formatoPesos(r.bruto)}).</p>}

      <Tarjeta className="mt-5">
        <TituloTarjeta>Ventas por día</TituloTarjeta>
        <div className="p-5">
          <GraficoDias dias={dias.map((d) => ({ dia: d.dia, total: Number(d.total), ventas: d.ventas }))} />
        </div>
      </Tarjeta>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <TablaSimple titulo="Por sucursal" filas={sucs.map((s) => [s.nombre, formatoEntero(s.ventas), formatoPesos(Number(s.total))])} cols={['Sucursal', 'Ventas', 'Total']} />
        <TablaSimple titulo="Por vendedor" filas={vends.map((s) => [s.nombre, formatoEntero(s.ventas), formatoPesos(Number(s.total))])} cols={['Vendedor', 'Ventas', 'Total']} />
        <TablaSimple
          titulo="Por medio de pago"
          filas={medios.map((m) => [MEDIOS_VENTA[m.medio as MedioVenta] ?? m.medio, formatoEntero(m.pagos), formatoPesos(Number(m.total))])}
          cols={['Medio', 'Pagos', 'Total']}
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Tarjeta className="overflow-hidden">
          <TituloTarjeta>Más vendidos</TituloTarjeta>
          {top.length === 0 ? (
            <Vacio>Sin ventas en el período.</Vacio>
          ) : (
            <table className={t.tabla}>
              <thead>
                <tr>
                  <th className={t.th}>Producto</th>
                  <th className={`${t.th} text-right`}>Unidades</th>
                  <th className={`${t.th} text-right`}>Total</th>
                </tr>
              </thead>
              <tbody>
                {top.map((p, i) => (
                  <tr key={i}>
                    <td className={t.td}>
                      {p.producto_id ? (
                        <Link href={`/productos/${p.producto_id}`} className="hover:text-marca hover:underline">
                          {p.nombre}
                        </Link>
                      ) : (
                        p.nombre
                      )}
                    </td>
                    <td className={`${t.td} num text-right`}>{formatoEntero(p.unidades)}</td>
                    <td className={`${t.td} num text-right`}>{formatoPesos(Number(p.total))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Tarjeta>
        <Tarjeta className="overflow-hidden">
          <TituloTarjeta>Sin ventas en los últimos 60 días</TituloTarjeta>
          {quietos.length === 0 ? (
            <Vacio>Todo lo que tiene stock se vendió en los últimos 60 días.</Vacio>
          ) : (
            <table className={t.tabla}>
              <thead>
                <tr>
                  <th className={t.th}>Producto</th>
                  <th className={`${t.th} text-right`}>Stock</th>
                  <th className={`${t.th} text-right`}>A costo</th>
                </tr>
              </thead>
              <tbody>
                {quietos.slice(0, 20).map((p) => (
                  <tr key={p.id}>
                    <td className={t.td}>
                      <Link href={`/productos/${p.id}`} className="hover:text-marca hover:underline">
                        {p.nombre}
                      </Link>
                      <span className="block text-xs text-apagado">{p.ultima ? `Última venta: ${formatoFecha(p.ultima)}` : 'Nunca se vendió'}</span>
                    </td>
                    <td className={`${t.td} num text-right`}>{formatoEntero(p.stock)}</td>
                    <td className={`${t.td} num text-right`}>{formatoPesos(Number(p.valor ?? 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Tarjeta>
      </div>

      <Tarjeta className="mt-5 overflow-hidden">
        <TituloTarjeta>Valor del stock hoy</TituloTarjeta>
        <div className="overflow-x-auto">
          <table className={t.tabla}>
            <thead>
              <tr>
                <th className={t.th}>Depósito</th>
                <th className={`${t.th} text-right`}>Unidades</th>
                <th className={`${t.th} text-right`}>A costo</th>
                <th className={`${t.th} text-right`}>A precio de venta</th>
              </tr>
            </thead>
            <tbody>
              {valor.map((v, i) => (
                <tr key={i}>
                  <td className={t.td}>
                    {v.sucursal} · {v.deposito}
                  </td>
                  <td className={`${t.td} num text-right`}>{formatoEntero(v.unidades)}</td>
                  <td className={`${t.td} num text-right`}>{formatoPesos(Number(v.costo))}</td>
                  <td className={`${t.td} num text-right`}>{formatoPesos(Number(v.venta))}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className={t.td}>Total</td>
                <td className={`${t.td} num text-right`}>{formatoEntero(totalValor.unidades)}</td>
                <td className={`${t.td} num text-right`}>{formatoPesos(Math.round(totalValor.costo * 100) / 100)}</td>
                <td className={`${t.td} num text-right`} data-testid="valor-venta">
                  {formatoPesos(Math.round(totalValor.venta * 100) / 100)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Tarjeta>
    </>
  )
}

function Dato({ titulo, valor, testid }: { titulo: string; valor: string; testid?: string }) {
  return (
    <Tarjeta className="p-4">
      <p className="text-xs text-tinta-suave">{titulo}</p>
      <p className="num mt-1 text-2xl font-semibold" data-testid={testid}>
        {valor}
      </p>
    </Tarjeta>
  )
}

function TablaSimple({ titulo, cols, filas }: { titulo: string; cols: string[]; filas: string[][] }) {
  return (
    <Tarjeta className="overflow-hidden">
      <TituloTarjeta>{titulo}</TituloTarjeta>
      {filas.length === 0 ? (
        <Vacio>Sin datos.</Vacio>
      ) : (
        <table className={t.tabla}>
          <thead>
            <tr>
              {cols.map((c, i) => (
                <th key={c} className={`${t.th} ${i ? 'text-right' : ''}`}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={i}>
                {f.map((v, j) => (
                  <td key={j} className={`${t.td} ${j ? 'num text-right' : ''}`}>
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Tarjeta>
  )
}
