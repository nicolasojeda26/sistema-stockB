import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requerirUsuario } from '@/lib/dal'
import { leerVenta } from '@/lib/venta-detalle'
import { formatoFecha, formatoPesos } from '@/lib/formato'
import { MEDIOS } from '@/lib/venta-calculo'
import { Aviso, BotonLink, Encabezado, Tarjeta, TituloTarjeta, tablaCls as t } from '@/components/ui'
import { AnularVenta } from './anular'

export const metadata: Metadata = { title: 'Venta' }

export default async function VentaPage(props: PageProps<'/ventas/[id]'>) {
  const u = await requerirUsuario()
  const id = Number((await props.params).id)
  if (!Number.isInteger(id)) notFound()
  const v = await leerVenta(id, u)
  if (!v) notFound()

  return (
    <>
      <Encabezado
        titulo={`Venta N.º ${v.id}`}
        detalle={`${formatoFecha(v.creado)} · ${v.sucursal} · ${v.vendedora ?? 'Usuario eliminado'}`}
        acciones={
          <>
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
        <div className="space-y-5">
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
          {u.rol === 'admin' && v.estado === 'completada' && (
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
