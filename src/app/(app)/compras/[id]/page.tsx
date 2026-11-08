import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { requerirAdmin } from '@/lib/dal'
import { formatoDia, formatoFecha, formatoPesos } from '@/lib/formato'
import { MEDIOS_PROVEEDOR, TIPOS_COMPROBANTE, type MedioProveedor, type TipoComprobante } from '@/lib/compras-tipos'
import { Aviso, BotonLink, Encabezado, Tarjeta, TituloTarjeta, tablaCls as t } from '@/components/ui'
import { AnularCompra } from './anular'

export const metadata: Metadata = { title: 'Compra' }

export default async function CompraPage(props: PageProps<'/compras/[id]'>) {
  await requerirAdmin()
  const id = Number((await props.params).id)
  if (!Number.isInteger(id)) notFound()
  const sql = db()
  const [c] = await sql<{
    id: number
    fecha: Date
    creado: Date
    proveedor_id: number
    proveedor: string
    cuit: string | null
    tipo_comprobante: TipoComprobante
    numero: string | null
    neto: number
    iva: number
    percepciones: number
    total: number
    estado: string
    anulada_en: Date | null
    nota: string | null
    actualizo_costos: boolean
    operacion_id: number | null
    deposito: string
    usuario: string | null
  }[]>`
    select c.*, p.nombre as proveedor, p.cuit, coalesce(s.nombre, 'Central') || ' · ' || d.nombre as deposito, u.nombre as usuario
    from compras c join proveedores p on p.id = c.proveedor_id join depositos d on d.id = c.deposito_id
      left join sucursales s on s.id = d.sucursal_id left join usuarios u on u.id = c.usuario_id
    where c.id = ${id}`
  if (!c) notFound()
  const [items, pagos] = await Promise.all([
    sql<{ id: number; codigo: string; nombre: string; cantidad: number; costo: number; precio: number }[]>`
      select i.id, p.codigo, p.nombre, i.cantidad, i.costo, p.precio from compra_items i join productos p on p.id = i.producto_id
      where i.compra_id = ${id} order by i.id`,
    sql<{ fecha: Date; monto: number; medio: MedioProveedor | null }[]>`
      select fecha, monto, medio from proveedor_movimientos where compra_id = ${id} and tipo = 'pago' order by id`,
  ])
  const anulada = c.estado === 'anulada'

  return (
    <>
      <Encabezado
        titulo={`${TIPOS_COMPROBANTE[c.tipo_comprobante]} ${c.numero ?? ''}`.trim()}
        detalle={
          <>
            <Link href={`/proveedores/${c.proveedor_id}`} className="font-medium text-marca hover:underline">
              {c.proveedor}
            </Link>
            {c.cuit ? ` (CUIT ${c.cuit})` : ''} · {formatoDia(c.fecha)} · entró en {c.deposito}
          </>
        }
        acciones={
          <>
            {c.operacion_id && !anulada && (
              <BotonLink href={`/etiquetas?operacion=${c.operacion_id}`} variante="secundario">
                Imprimir etiquetas
              </BotonLink>
            )}
            <BotonLink href="/compras" variante="secundario">
              Volver
            </BotonLink>
          </>
        }
      />
      {anulada && (
        <div className="mb-5">
          <Aviso tipo="alerta">Compra anulada el {formatoFecha(c.anulada_en!)}: el stock se descontó y la deuda se dio de baja.</Aviso>
        </div>
      )}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
        <Tarjeta className="min-w-0 overflow-hidden">
          <TituloTarjeta>Productos</TituloTarjeta>
          <div className="overflow-x-auto">
            <table className={t.tabla}>
              <thead>
                <tr>
                  <th className={t.th}>Producto</th>
                  <th className={`${t.th} text-right`}>Cantidad</th>
                  <th className={`${t.th} text-right`}>Costo</th>
                  <th className={`${t.th} text-right`}>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id}>
                    <td className={t.td}>
                      <span className="block font-medium">{i.nombre}</span>
                      <span className="block font-mono text-xs text-apagado">{i.codigo}</span>
                    </td>
                    <td className={`${t.td} num text-right`}>{i.cantidad}</td>
                    <td className={`${t.td} num text-right`}>{formatoPesos(Number(i.costo))}</td>
                    <td className={`${t.td} num text-right`}>{formatoPesos(Number(i.costo) * i.cantidad)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tarjeta>
        <div className="min-w-0 space-y-5">
          <Tarjeta className="p-5">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-tinta-suave">{c.tipo_comprobante === 'A' ? 'Neto gravado' : 'Subtotal'}</dt>
                <dd className="num">{formatoPesos(Number(c.neto))}</dd>
              </div>
              {Number(c.iva) > 0 && (
                <div className="flex justify-between">
                  <dt className="text-tinta-suave">IVA</dt>
                  <dd className="num">{formatoPesos(Number(c.iva))}</dd>
                </div>
              )}
              {Number(c.percepciones) > 0 && (
                <div className="flex justify-between">
                  <dt className="text-tinta-suave">Percepciones</dt>
                  <dd className="num">{formatoPesos(Number(c.percepciones))}</dd>
                </div>
              )}
              <div className="flex justify-between border-t border-linea pt-2 text-base font-bold">
                <dt>Total</dt>
                <dd className="num">{formatoPesos(Number(c.total))}</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-apagado">
              Cargada por {c.usuario ?? '—'} el {formatoFecha(c.creado)}. {c.actualizo_costos ? 'Actualizó los costos.' : 'No tocó los costos.'}
            </p>
            {pagos.length > 0 && (
              <p className="mt-2 text-sm">
                Pagado al cargarla:{' '}
                {pagos.map((p, i) => (
                  <span key={i} className="num font-medium">
                    {formatoPesos(-Number(p.monto))} en {p.medio ? MEDIOS_PROVEEDOR[p.medio].toLowerCase() : '—'}
                  </span>
                ))}
              </p>
            )}
            {c.nota && <p className="mt-2 text-sm text-tinta-suave">{c.nota}</p>}
          </Tarjeta>
          {!anulada && (
            <Tarjeta>
              <TituloTarjeta>Anular</TituloTarjeta>
              <AnularCompra compraId={id} />
            </Tarjeta>
          )}
        </div>
      </div>
    </>
  )
}
