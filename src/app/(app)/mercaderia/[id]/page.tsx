import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { requerirUsuario } from '@/lib/dal'
import { formatoEntero, formatoFecha } from '@/lib/formato'
import { BotonLink, Encabezado, Tarjeta, tablaCls as t } from '@/components/ui'
import { NOMBRE_TIPO } from '../tipos'

export const metadata: Metadata = { title: 'Detalle del movimiento' }

export default async function OperacionPage(props: PageProps<'/mercaderia/[id]'>) {
  const u = await requerirUsuario()
  const id = Number((await props.params).id)
  if (!Number.isInteger(id)) notFound()
  const sql = db()
  const [op] = await sql<
    {
      tipo: keyof typeof NOMBRE_TIPO
      creado: Date
      motivo: string | null
      nota: string | null
      usuario: string | null
      origen: string | null
      destino: string
      origen_suc: number | null
      destino_suc: number | null
      destino_id: number
    }[]
  >`
    select o.tipo, o.creado, o.motivo, o.nota, us.nombre as usuario, o.deposito_destino_id as destino_id,
      case when od.id is null then null else coalesce(os.nombre, 'Central') || ' · ' || od.nombre end as origen,
      coalesce(ds.nombre, 'Central') || ' · ' || dd.nombre as destino, od.sucursal_id as origen_suc, dd.sucursal_id as destino_suc
    from operaciones_stock o
    join depositos dd on dd.id = o.deposito_destino_id left join sucursales ds on ds.id = dd.sucursal_id
    left join depositos od on od.id = o.deposito_origen_id left join sucursales os on os.id = od.sucursal_id
    left join usuarios us on us.id = o.usuario_id
    where o.id = ${id}`
  if (!op) notFound()
  if (u.rol !== 'admin' && op.origen_suc !== u.sucursal_id && op.destino_suc !== u.sucursal_id) notFound()

  const items = await sql<{ producto_id: number; codigo: string; nombre: string; cantidad: number }[]>`
    select m.producto_id, p.codigo, p.nombre, m.cantidad
    from movimientos_stock m join productos p on p.id = m.producto_id
    where m.operacion_id = ${id} and m.deposito_id = ${op.destino_id}
    order by p.nombre`
  const unidades = items.reduce((a, i) => a + Math.abs(i.cantidad), 0)

  return (
    <>
      <Encabezado
        titulo={`${NOMBRE_TIPO[op.tipo]} del ${formatoFecha(op.creado)}`}
        detalle={
          <>
            {op.origen ? `${op.origen} → ${op.destino}` : op.destino} · {op.usuario ?? 'Usuario eliminado'}
            {op.motivo && ` · ${op.motivo}`}
          </>
        }
        acciones={
          <>
            {op.tipo !== 'ajuste' && (
              <BotonLink href={`/etiquetas?operacion=${id}`} variante="secundario">
                Imprimir etiquetas
              </BotonLink>
            )}
            <BotonLink href="/mercaderia" variante="secundario">
              Volver
            </BotonLink>
          </>
        }
      />
      {op.nota && <p className="mb-4 rounded-lg bg-papel px-4 py-3 text-sm ring-1 ring-linea">{op.nota}</p>}
      <Tarjeta className="overflow-hidden">
        <table className={t.tabla}>
          <thead>
            <tr>
              <th className={t.th}>Producto</th>
              <th className={`${t.th} text-right`}>{op.tipo === 'ajuste' ? 'Diferencia' : 'Unidades'}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.producto_id}>
                <td className={t.td}>
                  <Link href={`/productos/${i.producto_id}`} className="font-medium hover:text-marca hover:underline">
                    {i.nombre}
                  </Link>
                  <span className="block font-mono text-xs text-apagado">{i.codigo}</span>
                </td>
                <td className={`${t.td} num text-right font-medium ${op.tipo === 'ajuste' ? (i.cantidad > 0 ? 'text-ok' : 'text-error') : ''}`}>
                  {op.tipo === 'ajuste' && i.cantidad > 0 ? '+' : ''}
                  {formatoEntero(i.cantidad)}
                </td>
              </tr>
            ))}
            <tr>
              <td className={`${t.td} font-semibold`}>Total</td>
              <td className={`${t.td} num text-right font-semibold`}>{formatoEntero(unidades)}</td>
            </tr>
          </tbody>
        </table>
        {items.length === 0 && <p className="px-5 py-6 text-sm text-apagado">El recuento coincidió con el stock: no hubo diferencias.</p>}
      </Tarjeta>
    </>
  )
}
