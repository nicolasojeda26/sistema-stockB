import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { requerirAdmin } from '@/lib/dal'
import { cajaAbierta } from '@/lib/ventas'
import { formatoDia, formatoPesos } from '@/lib/formato'
import { MEDIOS_PROVEEDOR, TIPOS_COMPROBANTE, type MedioProveedor, type TipoComprobante } from '@/lib/compras'
import { Aviso, BotonLink, Etiqueta, Tarjeta, TituloTarjeta, Vacio, tablaCls as t } from '@/components/ui'
import { FormProveedor, type ProveedorForm } from '../form-proveedor'
import { AjusteProveedor, PagoProveedor } from './cuenta'

export const metadata: Metadata = { title: 'Proveedor' }

const TIPOS: Record<string, string> = {
  compra: 'Compra',
  pago: 'Pago',
  nota_credito: 'Nota de crédito',
  ajuste: 'Ajuste',
  anulacion: 'Compra anulada',
}

export default async function ProveedorPage(props: PageProps<'/proveedores/[id]'>) {
  const u = await requerirAdmin()
  const id = Number((await props.params).id)
  if (!Number.isInteger(id)) notFound()
  const sql = db()
  const [p] = await sql<ProveedorForm[]>`select id, nombre, cuit, condicion_iva, telefono, email, contacto, notas, activo from proveedores where id = ${id}`
  if (!p) notFound()
  const [movs, compras, caja, [{ saldo, anio }]] = await Promise.all([
    sql<{ id: number; fecha: Date; tipo: string; monto: number; medio: MedioProveedor | null; nota: string | null; compra_id: number | null; caja: boolean }[]>`
      select id, fecha, tipo, monto, medio, nota, compra_id, movimiento_caja_id is not null as caja
      from proveedor_movimientos where proveedor_id = ${id} order by fecha desc, id desc limit 100`,
    sql<{ id: number; fecha: Date; tipo_comprobante: TipoComprobante; numero: string | null; total: number; estado: string; unidades: number }[]>`
      select c.id, c.fecha, c.tipo_comprobante, c.numero, c.total, c.estado,
        (select sum(cantidad)::int from compra_items i where i.compra_id = c.id) as unidades
      from compras c where c.proveedor_id = ${id} order by c.fecha desc, c.id desc limit 50`,
    cajaAbierta(sql, u.id),
    sql<{ saldo: number; anio: number }[]>`
      select coalesce((select sum(monto) from proveedor_movimientos where proveedor_id = ${id}), 0) as saldo,
        coalesce((select sum(total) from compras where proveedor_id = ${id} and estado = 'registrada'
          and fecha >= date_trunc('year', now() at time zone 'America/Argentina/Buenos_Aires')), 0) as anio`,
  ])
  const s = Number(saldo)
  const whatsapp = p.telefono?.replace(/\D/g, '')

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-[1.75rem]">{p.nombre}</h1>
          <p className="mt-1 text-sm text-tinta-suave">
            {[p.cuit && `CUIT ${p.cuit}`, p.contacto, p.telefono].filter(Boolean).join(', ') || 'Sin datos de contacto'}
            {whatsapp && whatsapp.length >= 8 && (
              <>
                {' · '}
                <a href={`https://wa.me/${whatsapp.startsWith('54') ? whatsapp : `549${whatsapp}`}`} target="_blank" rel="noreferrer" className="font-medium text-marca hover:underline">
                  WhatsApp
                </a>
              </>
            )}
          </p>
        </div>
        <BotonLink href={`/compras/nueva?proveedor=${id}`}>Cargar compra</BotonLink>
      </div>
      {!p.activo && (
        <div className="mb-5">
          <Aviso tipo="alerta">Este proveedor está dado de baja.</Aviso>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <div className="min-w-0 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Tarjeta className="p-4">
              <p className="text-xs font-medium text-tinta-suave">Cuenta corriente</p>
              <p className={`num mt-1 text-2xl font-bold ${s > 0 ? 'text-error' : s < 0 ? 'text-ok' : ''}`} data-testid="saldo">
                {s > 0 ? `Le debés ${formatoPesos(s)}` : s < 0 ? `A tu favor ${formatoPesos(-s)}` : 'Al día'}
              </p>
            </Tarjeta>
            <Tarjeta className="p-4">
              <p className="text-xs font-medium text-tinta-suave">Comprado este año</p>
              <p className="num mt-1 text-2xl font-bold">{formatoPesos(Number(anio))}</p>
            </Tarjeta>
          </div>

          <Tarjeta className="overflow-hidden">
            <TituloTarjeta>Movimientos de la cuenta</TituloTarjeta>
            {movs.length === 0 ? (
              <Vacio>Sin movimientos. Aparecen al cargar compras y registrar pagos.</Vacio>
            ) : (
              <div className="overflow-x-auto">
                <table className={t.tabla}>
                  <thead>
                    <tr>
                      <th className={t.th}>Fecha</th>
                      <th className={t.th}>Detalle</th>
                      <th className={`${t.th} text-right`}>Debe</th>
                      <th className={`${t.th} text-right`}>Pagado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movs.map((m) => (
                      <tr key={m.id}>
                        <td className={`${t.td} whitespace-nowrap text-tinta-suave`}>{formatoDia(m.fecha)}</td>
                        <td className={t.td}>
                          {TIPOS[m.tipo] ?? m.tipo}
                          {m.medio && ` en ${MEDIOS_PROVEEDOR[m.medio].toLowerCase()}${m.caja ? ' (de la caja)' : ''}`}
                          {m.compra_id && (
                            <>
                              {' '}
                              <Link href={`/compras/${m.compra_id}`} className="text-marca hover:underline">
                                (compra #{m.compra_id})
                              </Link>
                            </>
                          )}
                          {m.nota && <span className="block text-xs text-apagado">{m.nota}</span>}
                        </td>
                        <td className={`${t.td} num text-right`}>{Number(m.monto) > 0 ? formatoPesos(Number(m.monto)) : ''}</td>
                        <td className={`${t.td} num text-right text-ok`}>{Number(m.monto) < 0 ? formatoPesos(-Number(m.monto)) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Tarjeta>

          <Tarjeta className="overflow-hidden">
            <TituloTarjeta>Compras</TituloTarjeta>
            {compras.length === 0 ? (
              <Vacio>Todavía no le cargaste compras.</Vacio>
            ) : (
              <ul className="divide-y divide-linea text-sm">
                {compras.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <span className="min-w-0">
                      <Link href={`/compras/${c.id}`} className="font-medium hover:text-marca hover:underline">
                        {TIPOS_COMPROBANTE[c.tipo_comprobante]} {c.numero ?? ''}
                      </Link>
                      <span className="block text-xs text-apagado">
                        {formatoDia(c.fecha)}, {c.unidades} unidad{c.unidades === 1 ? '' : 'es'}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      {c.estado === 'anulada' && <Etiqueta tono="apagado">Anulada</Etiqueta>}
                      <span className="num font-semibold">{formatoPesos(Number(c.total))}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
        </div>

        <div className="min-w-0 space-y-5">
          <Tarjeta>
            <TituloTarjeta>Registrar un pago</TituloTarjeta>
            <PagoProveedor proveedorId={id} sugerido={s > 0 ? s : null} cajaAbierta={!!caja} />
          </Tarjeta>
          <Tarjeta>
            <TituloTarjeta>Nota de crédito o ajuste</TituloTarjeta>
            <AjusteProveedor proveedorId={id} />
          </Tarjeta>
          <Tarjeta>
            <TituloTarjeta>Datos</TituloTarjeta>
            <FormProveedor proveedor={p} />
          </Tarjeta>
        </div>
      </div>
    </>
  )
}
