import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { requerirAdmin } from '@/lib/dal'
import { formatoFecha, formatoPesos } from '@/lib/formato'
import { Encabezado, Tarjeta, TituloTarjeta, Vacio, tablaCls as t } from '@/components/ui'
import { FormAumento } from './form'

export const metadata: Metadata = { title: 'Actualizar precios' }

export default async function PreciosPage() {
  await requerirAdmin()
  const sql = db()
  const [categorias, recientes] = await Promise.all([
    sql<{ id: number; nombre: string }[]>`select id, nombre from categorias where activa order by lower(nombre)`,
    sql<{ id: number; creado: Date; nombre: string; producto_id: number; precio_anterior: number; precio_nuevo: number; origen: string | null; usuario: string | null }[]>`
      select c.id, c.creado, p.nombre, p.id as producto_id, c.precio_anterior, c.precio_nuevo, c.origen, u.nombre as usuario
      from cambios_precio c join productos p on p.id = c.producto_id left join usuarios u on u.id = c.usuario_id
      where c.precio_anterior <> c.precio_nuevo
      order by c.creado desc, c.id desc limit 15`,
  ])
  return (
    <>
      <Encabezado
        titulo="Actualizar precios"
        detalle="Aumentá o bajá los precios de venta por porcentaje, de una categoría o de todo. Antes de aplicar ves cómo quedan."
      />
      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <FormAumento categorias={categorias} />
        <Tarjeta className="overflow-hidden">
          <TituloTarjeta>Últimos cambios de precio</TituloTarjeta>
          {recientes.length === 0 ? (
            <Vacio>Todavía no hubo cambios.</Vacio>
          ) : (
            <table className={t.tabla}>
              <tbody>
                {recientes.map((c) => (
                  <tr key={c.id}>
                    <td className={t.td}>
                      <a href={`/productos/${c.producto_id}`} className="block truncate font-medium hover:text-marca">
                        {c.nombre}
                      </a>
                      <span className="block text-xs text-apagado">
                        {formatoFecha(c.creado)} · {c.origen ?? 'Edición'}
                        {c.usuario ? ` · ${c.usuario}` : ''}
                      </span>
                    </td>
                    <td className={`${t.td} num text-right whitespace-nowrap`}>
                      <span className="block text-xs text-apagado line-through">{formatoPesos(c.precio_anterior)}</span>
                      {formatoPesos(c.precio_nuevo)}
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
