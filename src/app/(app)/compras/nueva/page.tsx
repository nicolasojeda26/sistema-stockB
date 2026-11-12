import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { requerirPermiso } from '@/lib/dal'
import { depositosPara } from '@/lib/depositos'
import { cajaAbierta } from '@/lib/ventas'
import { hoyAR } from '@/lib/formato'
import { Encabezado } from '@/components/ui'
import { FormCompra } from './form-compra'

export const metadata: Metadata = { title: 'Cargar compra' }

export default async function NuevaCompraPage(props: PageProps<'/compras/nueva'>) {
  const u = await requerirPermiso('compras')
  const proveedor = Number((await props.searchParams).proveedor) || null
  const sql = db()
  const [proveedores, depositos, categorias, caja] = await Promise.all([
    sql<{ id: number; nombre: string; cuit: string | null }[]>`select id, nombre, cuit from proveedores where activo order by lower(nombre)`,
    depositosPara(u),
    sql<{ id: number; nombre: string }[]>`select id, nombre from categorias where activa order by lower(nombre)`,
    cajaAbierta(sql, u.id),
  ])
  return (
    <>
      <Encabezado
        titulo="Cargar compra"
        detalle="Pasá la factura del proveedor: la mercadería entra al stock, se actualizan los costos y queda en su cuenta corriente."
      />
      <FormCompra
        proveedores={proveedores}
        depositos={depositos}
        categorias={categorias}
        hoy={hoyAR()}
        cajaAbierta={!!caja}
        proveedorInicial={proveedores.some((p) => p.id === proveedor) ? proveedor : null}
        usuarioId={u.id}
      />
    </>
  )
}
