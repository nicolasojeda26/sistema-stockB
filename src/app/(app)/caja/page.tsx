import type { Metadata } from 'next'
import Link from 'next/link'
import { db } from '@/lib/db'
import { requerirUsuario } from '@/lib/dal'
import { formatoFecha, formatoPesos } from '@/lib/formato'
import { cajaAbierta, resumenCaja } from '@/lib/ventas'
import { BotonLink, Encabezado, Tarjeta, TituloTarjeta, Vacio, tablaCls as t } from '@/components/ui'
import { CerrarCaja, MovimientoCaja } from './formularios'
import { ResumenCajaVista } from './resumen'

export const metadata: Metadata = { title: 'Caja' }

type CajaFila = {
  id: number
  sucursal: string
  usuario: string
  abierta: Date
  cerrada: Date | null
  efectivo_esperado: number | null
  efectivo_contado: number | null
  total: number
}

export default async function CajaPage() {
  const u = await requerirUsuario()
  const sql = db()
  const caja = await cajaAbierta(sql, u.id)
  const resumen = caja ? await resumenCaja(sql, caja.id) : null
  const historial = await sql<CajaFila[]>`
    select c.id, s.nombre as sucursal, us.nombre as usuario, c.abierta, c.cerrada, c.efectivo_esperado, c.efectivo_contado,
      coalesce((select sum(total) from ventas v where v.caja_id = c.id and v.estado = 'completada'), 0) as total
    from cajas c join sucursales s on s.id = c.sucursal_id join usuarios us on us.id = c.usuario_id
    ${u.rol === 'admin' ? sql`` : sql`where c.usuario_id = ${u.id}`}
    order by c.abierta desc limit 30`

  return (
    <>
      <Encabezado
        titulo="Caja"
        detalle={caja ? `Abierta en ${caja.sucursal} desde ${formatoFecha(caja.abierta)}` : 'No tenés una caja abierta.'}
        acciones={<BotonLink href="/vender">{caja ? 'Volver a vender' : 'Abrir caja'}</BotonLink>}
      />

      {caja && resumen && (
        <div className="mb-8 grid gap-5 lg:grid-cols-[1fr_340px]">
          <ResumenCajaVista resumen={resumen} />
          <div className="space-y-5">
            <Tarjeta>
              <TituloTarjeta>Ingreso o retiro de efectivo</TituloTarjeta>
              <MovimientoCaja />
            </Tarjeta>
            <Tarjeta>
              <TituloTarjeta>Cerrar caja</TituloTarjeta>
              <CerrarCaja />
            </Tarjeta>
          </div>
        </div>
      )}

      <Tarjeta className="overflow-hidden">
        <TituloTarjeta>{u.rol === 'admin' ? 'Cajas de todas las sucursales' : 'Tus cajas'}</TituloTarjeta>
        {historial.length === 0 ? (
          <Vacio>Todavía no hay cajas.</Vacio>
        ) : (
          <div className="overflow-x-auto">
            <table className={t.tabla}>
              <thead>
                <tr>
                  <th className={t.th}>Apertura</th>
                  <th className={t.th}>Sucursal</th>
                  <th className={`${t.th} hidden sm:table-cell`}>Usuario</th>
                  <th className={`${t.th} text-right`}>Vendido</th>
                  <th className={`${t.th} text-right`}>Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((c) => {
                  const dif = c.efectivo_contado === null ? null : Math.round((c.efectivo_contado - (c.efectivo_esperado ?? 0)) * 100) / 100
                  return (
                    <tr key={c.id} className="hover:bg-fondo/60">
                      <td className={`${t.td} num whitespace-nowrap`}>
                        <Link href={`/caja/${c.id}`} className="text-marca hover:underline">
                          {formatoFecha(c.abierta)}
                        </Link>
                      </td>
                      <td className={t.td}>{c.sucursal}</td>
                      <td className={`${t.td} hidden text-tinta-suave sm:table-cell`}>{c.usuario}</td>
                      <td className={`${t.td} num text-right`}>{formatoPesos(c.total)}</td>
                      <td className={`${t.td} num text-right`}>
                        {dif === null ? (
                          <span className="text-xs text-ok">Abierta</span>
                        ) : dif === 0 ? (
                          <span className="text-tinta-suave">Cerró justo</span>
                        ) : (
                          <span className={dif > 0 ? 'text-ok' : 'text-error'}>
                            {dif > 0 ? '+' : ''}
                            {formatoPesos(dif)}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>
    </>
  )
}
