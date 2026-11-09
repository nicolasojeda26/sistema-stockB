import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { requerirUsuario } from '@/lib/dal'
import { formatoEntero, formatoFecha, formatoPesos } from '@/lib/formato'
import { Aviso, BotonLink, Encabezado, Etiqueta, Tarjeta, TituloTarjeta, Vacio, tablaCls as t } from '@/components/ui'
import { FormProducto, type ProductoForm } from '../form-producto'

export const metadata: Metadata = { title: 'Producto' }

const TIPOS: Record<string, string> = {
  carga_inicial: 'Carga inicial',
  ingreso: 'Ingreso',
  venta: 'Venta',
  transferencia: 'Transferencia',
  ajuste: 'Ajuste',
  devolucion: 'Devolución',
}

export default async function ProductoPage(props: PageProps<'/productos/[id]'>) {
  const u = await requerirUsuario()
  const id = Number((await props.params).id)
  const creado = (await props.searchParams).creado === '1'
  if (!Number.isInteger(id)) notFound()
  const sql = db()

  const [producto] = await sql<(ProductoForm & { categoria: string | null })[]>`
    select p.id, p.codigo, p.nombre, p.categoria_id, c.nombre as categoria, p.costo, p.precio, p.stock_minimo, p.activo,
      p.articulo_id, a.nombre as articulo, p.talle, p.color
    from productos p left join categorias c on c.id = p.categoria_id left join articulos a on a.id = p.articulo_id
    where p.id = ${id}`
  if (!producto) notFound()

  const [stocks, movimientos, categorias, precios] = await Promise.all([
    sql<{ deposito: string; sucursal: string | null; es_principal: boolean; cantidad: number; mia: boolean }[]>`
      select d.nombre as deposito, s.nombre as sucursal, d.es_principal, coalesce(st.cantidad, 0) as cantidad,
             (d.sucursal_id is not distinct from ${u.sucursal_id}) as mia
      from depositos d
      left join sucursales s on s.id = d.sucursal_id
      left join stock st on st.deposito_id = d.id and st.producto_id = ${id}
      where d.activo and (s.id is null or s.activa) and (not d.es_transito or coalesce(st.cantidad, 0) <> 0)
      order by d.es_transito, s.nombre nulls last, d.es_principal desc, d.nombre`,
    sql<{ id: number; creado: Date; tipo: string; cantidad: number; motivo: string | null; deposito: string; usuario: string | null }[]>`
      select m.id, m.creado, m.tipo, m.cantidad, m.motivo, d.nombre as deposito, us.nombre as usuario
      from movimientos_stock m join depositos d on d.id = m.deposito_id left join usuarios us on us.id = m.usuario_id
      where m.producto_id = ${id} order by m.creado desc, m.id desc limit 20`,
    u.rol === 'admin' ? sql<{ id: number; nombre: string }[]>`select id, nombre from categorias where activa or id = ${producto.categoria_id} order by lower(nombre)` : [],
    u.rol === 'admin'
      ? sql<{ id: number; creado: Date; precio_anterior: number; precio_nuevo: number; origen: string | null; usuario: string | null }[]>`
          select c.id, c.creado, c.precio_anterior, c.precio_nuevo, c.origen, us.nombre as usuario
          from cambios_precio c left join usuarios us on us.id = c.usuario_id
          where c.producto_id = ${id} and c.precio_anterior <> c.precio_nuevo
          order by c.creado desc, c.id desc limit 10`
      : [],
  ])
  const total = stocks.reduce((a, s) => a + s.cantidad, 0)

  return (
    <>
      <Encabezado
        titulo={producto.nombre}
        detalle={
          <>
            <span className="font-mono">{producto.codigo}</span> · {producto.categoria ?? 'Sin categoría'}
            {!producto.activo && ' · Dado de baja'}
            {producto.articulo_id && (
              <>
                {' · '}
                <Link href={`/articulos/${producto.articulo_id}`} className="font-medium text-marca hover:underline">
                  Ver todos los modelos y colores
                </Link>
              </>
            )}
          </>
        }
        acciones={
          <>
            <BotonLink href={`/etiquetas?producto=${id}`} variante="secundario">
              Imprimir etiqueta
            </BotonLink>
            <BotonLink href="/productos" variante="secundario">
              Volver a productos
            </BotonLink>
          </>
        }
      />
      {creado && (
        <div className="mb-5">
          <Aviso tipo="ok">Producto creado.</Aviso>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-5">
          {u.rol === 'admin' ? (
            <Tarjeta>
              <TituloTarjeta>Datos del producto</TituloTarjeta>
              <FormProducto producto={producto} categorias={categorias} />
            </Tarjeta>
          ) : (
            <Tarjeta className="p-6">
              <p className="text-sm text-tinta-suave">Precio de venta</p>
              <p className="num mt-1 text-4xl font-semibold tracking-tight">{formatoPesos(producto.precio)}</p>
            </Tarjeta>
          )}

          <Tarjeta className="overflow-hidden">
            <TituloTarjeta>Últimos movimientos</TituloTarjeta>
            {movimientos.length === 0 ? (
              <Vacio>Sin movimientos todavía.</Vacio>
            ) : (
              <div className="overflow-x-auto">
                <table className={t.tabla}>
                  <thead>
                    <tr>
                      <th className={t.th}>Fecha</th>
                      <th className={t.th}>Movimiento</th>
                      <th className={t.th}>Depósito</th>
                      <th className={`${t.th} text-right`}>Cantidad</th>
                      <th className={`${t.th} hidden sm:table-cell`}>Usuario</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movimientos.map((m) => (
                      <tr key={m.id}>
                        <td className={`${t.td} num whitespace-nowrap text-tinta-suave`}>{formatoFecha(m.creado)}</td>
                        <td className={t.td}>
                          {TIPOS[m.tipo] ?? m.tipo}
                          {m.motivo && <span className="block text-xs text-apagado">{m.motivo}</span>}
                        </td>
                        <td className={t.td}>{m.deposito}</td>
                        <td className={`${t.td} num text-right font-medium ${m.cantidad > 0 ? 'text-ok' : 'text-error'}`}>
                          {m.cantidad > 0 ? '+' : ''}
                          {formatoEntero(m.cantidad)}
                        </td>
                        <td className={`${t.td} hidden text-tinta-suave sm:table-cell`}>{m.usuario ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Tarjeta>
        </div>

        <div>
          <Tarjeta>
            <TituloTarjeta acciones={<span className="num text-sm font-semibold">{formatoEntero(total)} u.</span>}>
              Stock por depósito
            </TituloTarjeta>
            <ul className="divide-y divide-linea">
              {stocks.map((s, i) => (
                <li key={i} className={`flex items-center justify-between gap-3 px-5 py-3 text-sm ${s.mia && u.rol !== 'admin' ? 'bg-marca-clara/50' : ''}`}>
                  <span className="min-w-0">
                    <span className="block truncate">{s.sucursal ?? 'Central'}</span>
                    <span className="block truncate text-xs text-apagado">
                      {s.deposito}
                      {s.es_principal ? ' · principal' : ''}
                    </span>
                  </span>
                  {s.cantidad <= producto.stock_minimo && s.es_principal ? (
                    <Etiqueta tono="alerta">{formatoEntero(s.cantidad)}</Etiqueta>
                  ) : (
                    <span className="num font-medium">{formatoEntero(s.cantidad)}</span>
                  )}
                </li>
              ))}
            </ul>
          </Tarjeta>
          {precios.length > 0 && (
            <Tarjeta className="mt-5">
              <TituloTarjeta>Cambios de precio</TituloTarjeta>
              <ul className="divide-y divide-linea">
                {precios.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <span className="min-w-0">
                      <span className="block text-xs text-apagado">{formatoFecha(c.creado)}</span>
                      <span className="block truncate text-xs text-tinta-suave">
                        {c.origen ?? 'Edición'}
                        {c.usuario ? ` · ${c.usuario}` : ''}
                      </span>
                    </span>
                    <span className="num shrink-0 text-right">
                      <span className="block text-xs text-apagado line-through">{formatoPesos(c.precio_anterior)}</span>
                      {formatoPesos(c.precio_nuevo)}
                    </span>
                  </li>
                ))}
              </ul>
            </Tarjeta>
          )}
        </div>
      </div>
    </>
  )
}
