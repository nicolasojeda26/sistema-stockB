import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { requerirPermiso } from '@/lib/dal'
import { Encabezado, Tarjeta } from '@/components/ui'
import { FormProducto } from '../form-producto'

export const metadata: Metadata = { title: 'Nuevo producto' }

export default async function NuevoProductoPage() {
  await requerirPermiso('productos')
  const categorias = await db()<{ id: number; nombre: string }[]>`select id, nombre from categorias where activa order by lower(nombre)`
  return (
    <>
      <Encabezado titulo="Nuevo producto" detalle="El stock se carga después, al ingresar mercadería." />
      <Tarjeta className="max-w-3xl">
        <FormProducto categorias={categorias} />
      </Tarjeta>
    </>
  )
}
