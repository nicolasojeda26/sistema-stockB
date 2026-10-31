import type { Metadata } from 'next'
import Link from 'next/link'
import { db } from '@/lib/db'
import { requerirAdmin } from '@/lib/dal'
import { leerConfig } from '@/lib/arca/facturacion'
import { DOC_TIPOS, TIPOS_CBTE, numeroComprobante } from '@/lib/arca/comprobantes'
import { formatoPesos } from '@/lib/formato'
import { comprobantes, fechaValida, hoyAR, inicioDeMes } from '@/lib/reportes'
import { Encabezado, Input, Select, Tarjeta, Vacio, tablaCls as t } from '@/components/ui'

export const metadata: Metadata = { title: 'Comprobantes' }

export default async function ComprobantesPage(props: PageProps<'/comprobantes'>) {
  await requerirAdmin()
  const sp = await props.searchParams
  const config = await leerConfig(db())
  const ambientePorDefecto = config.modo === 'desactivada' ? 'produccion' : config.modo
  const f = {
    desde: fechaValida(sp.desde) || inicioDeMes(),
    hasta: fechaValida(sp.hasta) || hoyAR(),
    ambiente: typeof sp.ambiente === 'string' && ['simulacion', 'homologacion', 'produccion'].includes(sp.ambiente) ? sp.ambiente : ambientePorDefecto,
    puntoVenta: Number(sp.pv) || null,
  }
  const [filas, puntos] = await Promise.all([
    comprobantes(db(), f),
    db()<{ punto_venta: number; nombre: string }[]>`select punto_venta, nombre from sucursales where punto_venta is not null order by punto_venta`,
  ])
  const signo = (tipo: number) => (TIPOS_CBTE[tipo].nc ? -1 : 1)
  const tot = filas.reduce(
    (a, c) => ({ neto: a.neto + signo(c.cbte_tipo) * Number(c.neto), iva: a.iva + signo(c.cbte_tipo) * Number(c.iva), total: a.total + signo(c.cbte_tipo) * Number(c.total) }),
    { neto: 0, iva: 0, total: 0 },
  )
  const r = (n: number) => Math.round(n * 100) / 100
  const params = new URLSearchParams({ desde: f.desde, hasta: f.hasta, ambiente: f.ambiente, ...(f.puntoVenta ? { pv: String(f.puntoVenta) } : {}) })

  return (
    <>
      <Encabezado
        titulo="Comprobantes"
        detalle="Facturas y notas de crédito emitidas. Las notas de crédito restan en los totales."
        acciones={
          <a href={`/comprobantes/exportar?${params}`} className="inline-flex h-10 items-center rounded-lg bg-marca px-4 text-sm font-medium text-white hover:bg-marca-oscura">
            Excel para el contador
          </a>
        }
      />
      <form className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[160px_160px_1fr_1fr_auto]">
        <Input type="date" name="desde" defaultValue={f.desde} aria-label="Desde" />
        <Input type="date" name="hasta" defaultValue={f.hasta} aria-label="Hasta" />
        <Select name="pv" defaultValue={f.puntoVenta ?? ''} aria-label="Punto de venta">
          <option value="">Todos los puntos de venta</option>
          {puntos.map((p) => (
            <option key={p.punto_venta} value={p.punto_venta}>
              {p.punto_venta} · {p.nombre}
            </option>
          ))}
        </Select>
        <Select name="ambiente" defaultValue={f.ambiente} aria-label="Ambiente">
          <option value="produccion">Producción (válidos)</option>
          <option value="homologacion">Homologación (pruebas)</option>
          <option value="simulacion">Simulación</option>
        </Select>
        <button className="h-10 rounded-lg bg-tinta px-4 text-sm font-medium text-white hover:bg-tinta/90">Filtrar</button>
      </form>

      <div className="mb-4 grid grid-cols-3 gap-3">
        {[
          ['Neto', tot.neto],
          ['IVA', tot.iva],
          ['Total', tot.total],
        ].map(([k, v]) => (
          <Tarjeta key={k as string} className="p-4">
            <p className="text-xs text-tinta-suave">{k}</p>
            <p className="num mt-1 text-xl font-semibold">{formatoPesos(r(v as number))}</p>
          </Tarjeta>
        ))}
      </div>

      <Tarjeta className="overflow-hidden">
        {filas.length === 0 ? (
          <Vacio>No hay comprobantes en esas fechas.</Vacio>
        ) : (
          <div className="overflow-x-auto">
            <table className={t.tabla}>
              <thead>
                <tr>
                  <th className={t.th}>Fecha</th>
                  <th className={t.th}>Comprobante</th>
                  <th className={`${t.th} hidden md:table-cell`}>Cliente</th>
                  <th className={`${t.th} hidden text-right sm:table-cell`}>IVA</th>
                  <th className={`${t.th} text-right`}>Total</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((c) => (
                  <tr key={c.id}>
                    <td className={`${t.td} num whitespace-nowrap`}>{new Date(c.fecha).toLocaleDateString('es-AR', { timeZone: 'UTC' })}</td>
                    <td className={t.td}>
                      <a href={`/comprobante/${c.id}`} target="_blank" rel="noopener" className="font-medium text-marca hover:underline">
                        {TIPOS_CBTE[c.cbte_tipo].nombre} {numeroComprobante(c.punto_venta, c.numero)}
                      </a>
                      <span className="block text-xs text-apagado">
                        <Link href={`/ventas/${c.venta_id}`} className="hover:underline">
                          Venta N.º {c.venta_id}
                        </Link>{' '}
                        · CAE {c.cae}
                      </span>
                    </td>
                    <td className={`${t.td} hidden md:table-cell`}>
                      {c.doc_tipo === 99 ? 'Consumidor final' : c.receptor_nombre}
                      {c.doc_tipo !== 99 && (
                        <span className="block text-xs text-apagado">
                          {DOC_TIPOS[c.doc_tipo]} {c.doc_nro}
                        </span>
                      )}
                    </td>
                    <td className={`${t.td} num hidden text-right sm:table-cell`}>{formatoPesos(signo(c.cbte_tipo) * Number(c.iva))}</td>
                    <td className={`${t.td} num text-right font-medium ${signo(c.cbte_tipo) < 0 ? 'text-error' : ''}`}>{formatoPesos(signo(c.cbte_tipo) * Number(c.total))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>
    </>
  )
}
