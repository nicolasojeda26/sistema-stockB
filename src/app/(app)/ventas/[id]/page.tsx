import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { puede, requerirAlguno } from '@/lib/dal'
import { leerVenta } from '@/lib/venta-detalle'
import { formatoFecha, formatoPesos } from '@/lib/formato'
import { MEDIOS_VENTA as MEDIOS } from '@/lib/venta-calculo'
import { Aviso, BotonLink, Encabezado, Tarjeta, TituloTarjeta, tablaCls as t } from '@/components/ui'
import { AnularVenta } from './anular'
import { db } from '@/lib/db'
import { itemsDevolvibles } from '@/lib/ventas'
import { leerConfig } from '@/lib/arca/facturacion'
import { numeroComprobante, TIPOS_CBTE, type CondicionEmisor } from '@/lib/arca/comprobantes'
import { Etiqueta } from '@/components/ui'
import { DevolverVenta, FacturarVenta, MarcarRetirada, ReintentarNC } from './acciones'

export const metadata: Metadata = { title: 'Venta' }

export default async function VentaPage(props: PageProps<'/ventas/[id]'>) {
  const u = await requerirAlguno('vender', 'anular_ventas')
  const id = Number((await props.params).id)
  if (!Number.isInteger(id)) notFound()
  const v = await leerVenta(id, u)
  if (!v) notFound()
  const sql = db()
  const [config, comprobantes, devoluciones, devolvibles] = await Promise.all([
    leerConfig(sql),
    sql<{ id: number; cbte_tipo: number; punto_venta: number; numero: number | null; estado: string; mensaje: string | null; total: number; ambiente: string; devolucion_id: number | null; creado: Date }[]>`
      select id, cbte_tipo, punto_venta, numero, estado, mensaje, total, ambiente, devolucion_id, creado from comprobantes where venta_id = ${id} order by id`,
    sql<{ id: number; creado: Date; total: number; medio: string; motivo: string; usuario: string | null }[]>`
      select d.id, d.creado, d.total, d.medio, d.motivo, us.nombre as usuario from devoluciones d left join usuarios us on us.id = d.usuario_id
      where d.venta_id = ${id} order by d.id`,
    itemsDevolvibles(sql, id),
  ])
  const factura = comprobantes.find((c) => c.estado === 'autorizado' && !TIPOS_CBTE[c.cbte_tipo].nc)
  const puedeFacturar = config.modo !== 'desactivada' && !factura && v.estado === 'completada'
  const quedaParaDevolver = v.estado === 'completada' && devolvibles.some((i) => i.cantidad > i.devuelto)

  return (
    <>
      <Encabezado
        titulo={`Venta N.º ${v.id}`}
        detalle={
          <>
            {formatoFecha(v.creado)} · {v.sucursal} · {v.vendedora ?? 'Usuario eliminado'}
            {v.cliente_id && (
              <>
                {' · Cliente: '}
                <Link href={`/clientes/${v.cliente_id}`} className="font-medium text-marca hover:underline">
                  {v.cliente}
                </Link>
              </>
            )}
          </>
        }
        acciones={
          <>
            {v.estado === 'completada' && (
              <a
                href={`/ticket/${v.id}?cambio=1`}
                target="_blank"
                rel="noopener"
                className="inline-flex h-10 items-center rounded-lg border border-linea bg-papel px-4 text-sm font-medium hover:bg-fondo"
              >
                Ticket de cambio
              </a>
            )}
            <a
              href={`/ticket/${v.id}`}
              target="_blank"
              rel="noopener"
              className="inline-flex h-10 items-center rounded-lg border border-linea bg-papel px-4 text-sm font-medium hover:bg-fondo"
            >
              Ver ticket
            </a>
            <BotonLink href="/ventas" variante="secundario">
              Volver
            </BotonLink>
          </>
        }
      />
      {v.para_retirar && v.estado === 'completada' && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-alerta-claro px-4 py-3 text-sm text-alerta">
          <span>
            <b>Apartada</b> para {v.cliente}: el producto está separado hasta que lo retire.
          </span>
          <MarcarRetirada ventaId={v.id} />
        </div>
      )}
      {v.retirada_en && (
        <div className="mb-5">
          <Aviso tipo="ok">Apartado retirado el {formatoFecha(v.retirada_en)}.</Aviso>
        </div>
      )}
      {v.estado === 'anulada' && (
        <div className="mb-5">
          <Aviso tipo="alerta">
            Anulada el {formatoFecha(v.anulada_en!)} por {v.anulada_por ?? '—'}: {v.motivo_anulacion}. El stock se devolvió.
          </Aviso>
        </div>
      )}
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <Tarjeta className="overflow-hidden">
          <table className={t.tabla}>
            <thead>
              <tr>
                <th className={t.th}>Producto</th>
                <th className={`${t.th} text-right`}>Cant.</th>
                <th className={`${t.th} hidden text-right sm:table-cell`}>Precio</th>
                <th className={`${t.th} text-right`}>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {v.items.map((i) => (
                <tr key={i.id}>
                  <td className={t.td}>
                    {i.producto_id ? (
                      <Link href={`/productos/${i.producto_id}`} className="font-medium hover:text-marca hover:underline">
                        {i.nombre}
                      </Link>
                    ) : (
                      i.nombre
                    )}
                    <span className="block font-mono text-xs text-apagado">
                      {i.codigo}
                      {i.descuento_pct > 0 && <span className="font-sans text-ok"> · −{i.descuento_pct} %</span>}
                    </span>
                  </td>
                  <td className={`${t.td} num text-right`}>{i.cantidad}</td>
                  <td className={`${t.td} num hidden text-right sm:table-cell`}>{formatoPesos(i.precio_unitario)}</td>
                  <td className={`${t.td} num text-right font-medium`}>{formatoPesos(i.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Tarjeta>
        <div className="min-w-0 space-y-5">
          <Tarjeta className="p-5">
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between text-tinta-suave">
                <dt>Subtotal</dt>
                <dd className="num">{formatoPesos(v.subtotal)}</dd>
              </div>
              {v.descuento > 0 && (
                <div className="flex justify-between text-ok">
                  <dt>Descuentos{v.descuento_global_pct > 0 ? ` (incluye ${v.descuento_global_pct} % general)` : ''}</dt>
                  <dd className="num">−{formatoPesos(v.descuento)}</dd>
                </div>
              )}
              <div className="flex justify-between border-t border-linea pt-2 text-lg font-semibold">
                <dt>Total</dt>
                <dd className="num">{formatoPesos(v.total)}</dd>
              </div>
            </dl>
            <h3 className="mt-5 mb-2 text-sm font-semibold">Pagos</h3>
            <ul className="space-y-1 text-sm">
              {v.pagos.map((p, i) => (
                <li key={i} className="flex justify-between">
                  <span>
                    {MEDIOS[p.medio]}
                    {p.cuotas && p.cuotas > 1 ? ` · ${p.cuotas} cuotas` : ''}
                  </span>
                  <span className="num">{formatoPesos(p.monto)}</span>
                </li>
              ))}
              {v.vuelto > 0 && (
                <li className="flex justify-between text-tinta-suave">
                  <span>Recibió {formatoPesos(v.efectivo_recibido ?? 0)} · vuelto</span>
                  <span className="num">{formatoPesos(v.vuelto)}</span>
                </li>
              )}
            </ul>
            <p className="mt-4 text-xs text-apagado">
              <Link href={`/caja/${v.caja_id}`} className="hover:underline">
                Ver la caja de esta venta
              </Link>
            </p>
          </Tarjeta>
          {(comprobantes.length > 0 || puedeFacturar) && (
            <Tarjeta>
              <TituloTarjeta>Facturación</TituloTarjeta>
              {comprobantes.length > 0 && (
                <ul className="divide-y divide-linea text-sm">
                  {comprobantes.map((c) => (
                    <li key={c.id} className="px-5 py-3">
                      <div className="flex items-center justify-between gap-2">
                        {c.estado === 'autorizado' ? (
                          <a href={`/comprobante/${c.id}`} target="_blank" rel="noopener" className="font-medium text-marca hover:underline">
                            {TIPOS_CBTE[c.cbte_tipo].nombre} {numeroComprobante(c.punto_venta, c.numero!)}
                          </a>
                        ) : (
                          <span className="font-medium">{TIPOS_CBTE[c.cbte_tipo].nombre}</span>
                        )}
                        <span className="num">{formatoPesos(c.total)}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {c.estado === 'rechazado' ? <Etiqueta tono="alerta">Rechazado</Etiqueta> : <Etiqueta tono="ok">Autorizado</Etiqueta>}
                        {c.ambiente !== 'produccion' && <Etiqueta tono="apagado">{c.ambiente === 'simulacion' ? 'Simulación' : 'Homologación'}</Etiqueta>}
                      </div>
                      {c.estado === 'rechazado' && c.mensaje && <p className="mt-1 text-xs text-alerta">{c.mensaje}</p>}
                    </li>
                  ))}
                </ul>
              )}
              {puedeFacturar && <FacturarVenta ventaId={v.id} condicionEmisor={config.condicion_iva as CondicionEmisor | null} total={v.total} identificarDesde={config.identificar_desde} />}
            </Tarjeta>
          )}
          {devoluciones.length > 0 && (
            <Tarjeta>
              <TituloTarjeta>Devoluciones</TituloTarjeta>
              <ul className="divide-y divide-linea text-sm">
                {devoluciones.map((d) => {
                  const nc = comprobantes.find((c) => c.devolucion_id === d.id && c.estado === 'autorizado')
                  return (
                    <li key={d.id} className="px-5 py-3">
                      <div className="flex justify-between gap-2">
                        <span>
                          {formatoFecha(d.creado)} · {MEDIOS[d.medio as keyof typeof MEDIOS]}
                          <span className="block text-xs text-apagado">
                            {d.motivo} · {d.usuario ?? '—'}
                          </span>
                        </span>
                        <span className="num text-error">−{formatoPesos(d.total)}</span>
                      </div>
                      {factura && !nc && <ReintentarNC devolucionId={d.id} />}
                    </li>
                  )
                })}
              </ul>
            </Tarjeta>
          )}
          {quedaParaDevolver && (
            <Tarjeta>
              <TituloTarjeta>Devolver productos</TituloTarjeta>
              <DevolverVenta conCliente={!!v.cliente_id} ventaId={v.id} items={devolvibles.filter((i) => i.cantidad > i.devuelto)} facturada={!!factura} />
            </Tarjeta>
          )}
          {puede(u, 'anular_ventas') && v.estado === 'completada' && devoluciones.length === 0 && (
            <Tarjeta>
              <TituloTarjeta>Anular venta</TituloTarjeta>
              <AnularVenta ventaId={v.id} />
            </Tarjeta>
          )}
        </div>
      </div>
    </>
  )
}
