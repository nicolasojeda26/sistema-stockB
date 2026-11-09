import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { requerirUsuario } from '@/lib/dal'
import { cajaAbierta } from '@/lib/ventas'
import { formatoFecha, formatoPesos } from '@/lib/formato'
import { MEDIOS } from '@/lib/venta-calculo'
import { Aviso, Etiqueta, Tarjeta, TituloTarjeta, Vacio, tablaCls as t } from '@/components/ui'
import { FormCliente, type ClienteForm } from '../form-cliente'
import { AjusteSaldo, PagoCuenta } from './cuenta'

export const metadata: Metadata = { title: 'Cliente' }

const TIPOS: Record<string, string> = {
  venta: 'Compra a cuenta',
  pago: 'Pago',
  devolucion: 'Devolución a favor',
  cambio: 'Diferencia de cambio a favor',
  ajuste: 'Ajuste',
}

export default async function ClientePage(props: PageProps<'/clientes/[id]'>) {
  const u = await requerirUsuario()
  const id = Number((await props.params).id)
  if (!Number.isInteger(id)) notFound()
  const sql = db()
  const [c] = await sql<ClienteForm[]>`
    select id, nombre, telefono, email, doc_nro, domicilio, condicion_iva, notas, limite_credito, activo from clientes where id = ${id}`
  if (!c) notFound()

  const [movs, compras, caja] = await Promise.all([
    sql<{ id: number; creado: Date; tipo: string; monto: number; medio: string | null; nota: string | null; venta_id: number | null; usuario: string | null }[]>`
      select m.id, m.creado, m.tipo, m.monto, m.medio, m.nota, m.venta_id, us.nombre as usuario
      from cuenta_movimientos m left join usuarios us on us.id = m.usuario_id
      where m.cliente_id = ${id} order by m.creado desc, m.id desc limit 100`,
    sql<{ id: number; creado: Date; total: number; estado: string; para_retirar: boolean; sucursal: string; prendas: number }[]>`
      select v.id, v.creado, v.total, v.estado, v.para_retirar, s.nombre as sucursal,
        (select sum(cantidad)::int from venta_items i where i.venta_id = v.id) as prendas
      from ventas v join sucursales s on s.id = v.sucursal_id
      where v.cliente_id = ${id} order by v.creado desc limit 50`,
    cajaAbierta(sql, u.id),
  ])
  const [{ saldo }] = await sql<{ saldo: number }[]>`select coalesce(sum(monto), 0) as saldo from cuenta_movimientos where cliente_id = ${id}`
  const s = Number(saldo)
  const gastado = compras.filter((v) => v.estado === 'completada').reduce((a, v) => a + Number(v.total), 0)
  const whatsapp = c.telefono?.replace(/\D/g, '')

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-[1.75rem]">{c.nombre}</h1>
          <p className="mt-1 text-sm text-tinta-suave">
            {[c.telefono, c.doc_nro && `DNI/CUIT ${c.doc_nro}`].filter(Boolean).join(', ') || 'Sin datos de contacto'}
            {whatsapp && whatsapp.length >= 8 && (
              <>
                {' · '}
                <a href={`https://wa.me/${whatsapp.startsWith('54') ? whatsapp : `549${whatsapp}`}`} target="_blank" rel="noreferrer" className="font-medium text-marca hover:underline">
                  Escribirle por WhatsApp
                </a>
              </>
            )}
          </p>
        </div>
      </div>
      {!c.activo && (
        <div className="mb-5">
          <Aviso tipo="alerta">Este cliente está dado de baja.</Aviso>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <div className="min-w-0 space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <Tarjeta className="p-4">
              <p className="text-xs font-medium text-tinta-suave">Cuenta corriente</p>
              <p className={`num mt-1 text-2xl font-bold ${s > 0 ? 'text-error' : s < 0 ? 'text-ok' : ''}`} data-testid="saldo">
                {s > 0 ? `Debe ${formatoPesos(s)}` : s < 0 ? `A favor ${formatoPesos(-s)}` : 'Al día'}
              </p>
            </Tarjeta>
            <Tarjeta className="p-4">
              <p className="text-xs font-medium text-tinta-suave">Compró en total</p>
              <p className="num mt-1 text-2xl font-bold">{formatoPesos(gastado)}</p>
            </Tarjeta>
            <Tarjeta className="p-4">
              <p className="text-xs font-medium text-tinta-suave">Límite de cuenta</p>
              <p className="num mt-1 text-2xl font-bold">{Number(c.limite_credito) > 0 ? formatoPesos(Number(c.limite_credito)) : 'Sin fiado'}</p>
            </Tarjeta>
          </div>

          <Tarjeta className="overflow-hidden">
            <TituloTarjeta>Movimientos de la cuenta</TituloTarjeta>
            {movs.length === 0 ? (
              <Vacio>Sin movimientos. Aparecen al vender a cuenta, al dejar saldo a favor o al registrar pagos.</Vacio>
            ) : (
              <div className="overflow-x-auto">
                <table className={t.tabla}>
                  <thead>
                    <tr>
                      <th className={t.th}>Fecha</th>
                      <th className={t.th}>Detalle</th>
                      <th className={`${t.th} text-right`}>Debe</th>
                      <th className={`${t.th} text-right`}>Haber</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movs.map((m) => (
                      <tr key={m.id} className="border-b border-linea last:border-0">
                        <td className={`${t.td} whitespace-nowrap text-tinta-suave`}>{formatoFecha(m.creado)}</td>
                        <td className={t.td}>
                          {TIPOS[m.tipo] ?? m.tipo}
                          {m.medio && ` en ${MEDIOS[m.medio as keyof typeof MEDIOS]?.toLowerCase() ?? m.medio}`}
                          {m.venta_id && (
                            <>
                              {' '}
                              <Link href={`/ventas/${m.venta_id}`} className="text-marca hover:underline">
                                (venta #{m.venta_id})
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
              <Vacio>Todavía no compró con su nombre. En la caja, elegí el cliente antes de cobrar.</Vacio>
            ) : (
              <ul className="divide-y divide-linea text-sm">
                {compras.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <span className="min-w-0">
                      <Link href={`/ventas/${v.id}`} className="font-medium hover:text-marca hover:underline">
                        Venta #{v.id}
                      </Link>
                      <span className="block text-xs text-apagado">
                        {formatoFecha(v.creado)}, {v.sucursal}, {v.prendas} producto{v.prendas === 1 ? '' : 's'}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      {v.estado === 'anulada' && <Etiqueta tono="apagado">Anulada</Etiqueta>}
                      {v.para_retirar && <Etiqueta tono="alerta">Apartada</Etiqueta>}
                      <span className="num font-semibold">{formatoPesos(Number(v.total))}</span>
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
            {caja ? (
              <PagoCuenta clienteId={id} sugerido={s > 0 ? s : null} />
            ) : (
              <p className="px-5 py-4 text-sm text-tinta-suave">
                Para cobrar, abrí tu caja en <Link href="/vender" className="font-medium text-marca hover:underline">Vender</Link>: el pago entra ahí.
              </p>
            )}
          </Tarjeta>
          {u.rol === 'admin' && (
            <Tarjeta>
              <TituloTarjeta>Ajustar saldo</TituloTarjeta>
              <AjusteSaldo clienteId={id} />
            </Tarjeta>
          )}
          <Tarjeta>
            <TituloTarjeta>Datos</TituloTarjeta>
            <FormCliente cliente={{ ...c, limite_credito: Number(c.limite_credito) }} esAdmin={u.rol === 'admin'} />
          </Tarjeta>
        </div>
      </div>
    </>
  )
}
