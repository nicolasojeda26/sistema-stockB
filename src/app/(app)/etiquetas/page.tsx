import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { requerirUsuario } from '@/lib/dal'
import { Encabezado } from '@/components/ui'
import { Etiquetas, type LineaEtiqueta } from './etiquetas'

export const metadata: Metadata = { title: 'Etiquetas' }

export default async function EtiquetasPage(props: PageProps<'/etiquetas'>) {
  const u = await requerirUsuario()
  const sp = await props.searchParams
  const operacion = Number(sp.operacion) || null
  const producto = Number(sp.producto) || null
  const articulo = Number(sp.articulo) || null
  const sql = db()

  // Lista inicial: lo que entró en un ingreso (una etiqueta por unidad) o un producto suelto.
  let iniciales: LineaEtiqueta[] = []
  if (operacion) {
    iniciales = await sql<LineaEtiqueta[]>`
      select p.id, p.codigo, p.nombre, p.precio, abs(m.cantidad)::int as cantidad
      from operaciones_stock o
      join movimientos_stock m on m.operacion_id = o.id and m.deposito_id = o.deposito_destino_id
      join productos p on p.id = m.producto_id
      left join depositos dd on dd.id = o.deposito_destino_id
      left join depositos od on od.id = o.deposito_origen_id
      where o.id = ${operacion}
        ${u.rol === 'admin' ? sql`` : sql`and (dd.sucursal_id = ${u.sucursal_id} or od.sucursal_id = ${u.sucursal_id})`}
      order by p.nombre`
  } else if (articulo) {
    // Todas las variantes de un artículo: tantas etiquetas como unidades haya en la sucursal (mínimo una).
    iniciales = await sql<LineaEtiqueta[]>`
      select p.id, p.codigo, p.nombre, p.precio,
        greatest(1, coalesce((select sum(s.cantidad) from stock s join depositos d on d.id = s.deposito_id
          where s.producto_id = p.id ${u.rol === 'admin' ? sql`` : sql`and d.sucursal_id = ${u.sucursal_id}`}), 0))::int as cantidad
      from productos p where p.articulo_id = ${articulo} and p.activo
      order by lower(coalesce(p.color, '')), p.orden_talle`
  } else if (producto) {
    iniciales = await sql<LineaEtiqueta[]>`select id, codigo, nombre, precio, 1 as cantidad from productos where id = ${producto}`
  }

  return (
    <>
      <div className="print:hidden">
        <Encabezado
          titulo="Etiquetas"
          detalle="Imprimí etiquetas con código de barras, nombre y precio. Sirven para los productos que no traen código o para remarcar precios."
        />
      </div>
      <Etiquetas iniciales={iniciales} />
    </>
  )
}
