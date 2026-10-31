import type { Metadata } from 'next'
import Link from 'next/link'
import { db } from '@/lib/db'
import { requerirAdmin } from '@/lib/dal'
import { formatoEntero } from '@/lib/formato'
import { Encabezado, Etiqueta, Tarjeta, TituloTarjeta, Vacio, tablaCls as t } from '@/components/ui'
import { EditarCategoria, NuevaCategoria } from './formularios'

export const metadata: Metadata = { title: 'Categorías' }

export default async function CategoriasPage() {
  await requerirAdmin()
  const categorias = await db()<{ id: number; nombre: string; activa: boolean; productos: number }[]>`
    select c.id, c.nombre, c.activa, (select count(*)::int from productos p where p.categoria_id = c.id and p.activo) as productos
    from categorias c order by c.activa desc, lower(c.nombre)`

  return (
    <>
      <Encabezado titulo="Categorías" detalle="Agrupan los productos para buscarlos, filtrarlos y ver reportes." />
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <Tarjeta className="overflow-hidden">
          {categorias.length === 0 ? (
            <Vacio>Todavía no hay categorías.</Vacio>
          ) : (
            <table className={t.tabla}>
              <thead>
                <tr>
                  <th className={t.th}>Nombre</th>
                  <th className={`${t.th} text-right`}>Productos</th>
                  <th className={t.th} />
                </tr>
              </thead>
              <tbody>
                {categorias.map((c) => (
                  <tr key={c.id}>
                    <td className={t.td}>
                      <span className={c.activa ? '' : 'text-apagado'}>{c.nombre}</span>{' '}
                      {!c.activa && <Etiqueta tono="apagado">Oculta</Etiqueta>}
                    </td>
                    <td className={`${t.td} num text-right`}>
                      <Link href={`/productos?categoria=${c.id}`} className="text-marca hover:underline">
                        {formatoEntero(c.productos)}
                      </Link>
                    </td>
                    <td className={`${t.td} w-0 text-right`}>
                      <EditarCategoria categoria={c} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Tarjeta>
        <div>
          <Tarjeta>
            <TituloTarjeta>Nueva categoría</TituloTarjeta>
            <NuevaCategoria />
          </Tarjeta>
        </div>
      </div>
    </>
  )
}
