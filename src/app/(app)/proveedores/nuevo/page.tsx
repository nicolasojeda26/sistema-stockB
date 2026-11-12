import type { Metadata } from 'next'
import { requerirPermiso } from '@/lib/dal'
import { Encabezado, Tarjeta } from '@/components/ui'
import { FormProveedor } from '../form-proveedor'

export const metadata: Metadata = { title: 'Nuevo proveedor' }

export default async function NuevoProveedorPage() {
  await requerirPermiso('compras')
  return (
    <>
      <Encabezado titulo="Nuevo proveedor" detalle="Con el nombre alcanza; el resto es opcional." />
      <Tarjeta className="max-w-2xl">
        <FormProveedor />
      </Tarjeta>
    </>
  )
}
