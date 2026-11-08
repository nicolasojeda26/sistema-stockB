import type { Metadata } from 'next'
import { requerirAdmin } from '@/lib/dal'
import { Encabezado, Tarjeta } from '@/components/ui'
import { FormProveedor } from '../form-proveedor'

export const metadata: Metadata = { title: 'Nuevo proveedor' }

export default async function NuevoProveedorPage() {
  await requerirAdmin()
  return (
    <>
      <Encabezado titulo="Nuevo proveedor" detalle="Con el nombre alcanza; el resto es opcional." />
      <Tarjeta className="max-w-2xl">
        <FormProveedor />
      </Tarjeta>
    </>
  )
}
