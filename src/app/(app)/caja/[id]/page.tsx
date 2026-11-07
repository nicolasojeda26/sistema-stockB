import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { requerirUsuario } from '@/lib/dal'
import { formatoFecha, formatoPesos } from '@/lib/formato'
import { resumenCaja } from '@/lib/ventas'
import { Aviso, Encabezado, Etiqueta, Tarjeta, TituloTarjeta, Vacio, tablaCls as t } from '@/components/ui'
import { BotonImprimir } from '@/components/boton-imprimir'
import { ResumenCajaVista } from '../resumen'
import { CerrarOtraCaja } from '../formularios'

export const metadata: Metadata = { title: 'Detalle de caja' }

export default async function CajaDetallePage(props: PageProps<'/caja/[id]'>) {
  const u = await requerirUsuario()
  const id = Number((await props.params).id)
  const recienCerrada = (await props.searchParams).cerrada === '1'
  if (!Number.isInteger(id)) notFound()
  const sql = db()
  const [c] = await sql<
    { usuario_id: number; sucursal: string; usuario: string; abierta: Date; cerrada: Date | null; efectivo_esperado: number | null; efectivo_contado: number | null; nota_cierre: string | null }[]
  >`
    select c.usuario_id, s.nombre as sucursal, us.nombre as usuario, c.abierta, c.cerrada, c.efectivo_esperado, c.efectivo_contado, c.nota_cierre
    from cajas c join sucursales s on s.id = c.sucursal_id join usuarios us on us.id = c.usuario_id where c.id = ${id}`
  if (!c || (u.rol !== 'admin' && c.usuario_id !== u.id)) notFound()

  const [resumen, ventas, movimientos] = await Promise.all([
    resumenCaja(sql, id),
    sql<{ id: number; creado: Date; total: number; estado: string; medios: string }[]>`
      select v.id, v.creado, v.total, v.estado,
        (select string_agg(distinct medio, ', ') from venta_pagos p where p.venta_id = v.id) as medios
      from ventas v where v.caja_id = ${id} order by v.creado desc`,
    sql<{ id: number; creado: Date; tipo: string; monto: number; motivo: string }[]>`
      select id, creado, tipo, monto, motivo from movimientos_caja where caja_id = ${id} order by creado`,
  ])
  const nombresMedios: Record<string, string> = { efectivo: 'Efectivo', transferencia: 'Transferencia', debito: 'Débito', credito: 'Crédito' }

  return (
    <>
      <Encabezado
        titulo={`Caja de ${c.sucursal}`}
        detalle={`${c.usuario} · ${formatoFecha(c.abierta)}${c.cerrada ? ` a ${formatoFecha(c.cerrada)}` : ' · abierta'}`}
        acciones={<BotonImprimir />}
      />
      {recienCerrada && (
        <div className="mb-5 print:hidden">
          <Aviso tipo="ok">Caja cerrada. Podés imprimir este resumen.</Aviso>
        </div>
      )}
      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <div className="min-w-0 space-y-5">
          <ResumenCajaVista resumen={resumen} contado={c.efectivo_contado} esperadoGuardado={c.efectivo_esperado} />
          {c.nota_cierre && <p className="rounded-lg bg-papel px-4 py-3 text-sm ring-1 ring-linea">Nota: {c.nota_cierre}</p>}
          {!c.cerrada && u.rol === 'admin' && c.usuario_id !== u.id && (
            <Tarjeta className="print:hidden">
              <TituloTarjeta>Cerrar caja</TituloTarjeta>
              <CerrarOtraCaja cajaId={id} usuario={c.usuario} />
            </Tarjeta>
          )}
          {movimientos.length > 0 && (
            <Tarjeta>
              <TituloTarjeta>Ingresos y retiros</TituloTarjeta>
              <ul className="divide-y divide-linea text-sm">
                {movimientos.map((m) => (
                  <li key={m.id} className="flex justify-between gap-3 px-5 py-2.5">
                    <span>
                      {m.tipo === 'retiro' ? 'Retiro' : 'Ingreso'} · {m.motivo}
                      <span className="block text-xs text-apagado">{formatoFecha(m.creado)}</span>
                    </span>
                    <span className={`num ${m.tipo === 'retiro' ? 'text-error' : 'text-ok'}`}>
                      {m.tipo === 'retiro' ? '−' : '+'}
                      {formatoPesos(m.monto)}
                    </span>
                  </li>
                ))}
              </ul>
            </Tarjeta>
          )}
        </div>
        <Tarjeta className="overflow-hidden">
          <TituloTarjeta>Ventas</TituloTarjeta>
          {ventas.length === 0 ? (
            <Vacio>Sin ventas.</Vacio>
          ) : (
            <table className={t.tabla}>
              <tbody>
                {ventas.map((v) => (
                  <tr key={v.id}>
                    <td className={t.td}>
                      <Link href={`/ventas/${v.id}`} className="text-marca hover:underline">
                        N.º {v.id}
                      </Link>
                      <span className="block text-xs text-apagado">
                        {formatoFecha(v.creado).split(', ')[1]} · {v.medios.split(', ').map((m) => nombresMedios[m] ?? m).join(' + ')}
                      </span>
                    </td>
                    <td className={`${t.td} num text-right`}>
                      {v.estado === 'anulada' ? <Etiqueta tono="apagado">Anulada</Etiqueta> : formatoPesos(v.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Tarjeta>
      </div>
    </>
  )
}
