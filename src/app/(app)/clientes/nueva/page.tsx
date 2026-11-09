import type { Metadata } from 'next'
import { requerirVendedor } from '@/lib/dal'
import { Encabezado, Tarjeta } from '@/components/ui'
import { FormCliente } from '../form-cliente'

export const metadata: Metadata = { title: 'Nuevo cliente' }

export default async function NuevaClientePage() {
  const u = await requerirVendedor()
  return (
    <>
      <Encabezado titulo="Nuevo cliente" detalle="Con nombre alcanza; el resto es opcional." />
      <Tarjeta className="max-w-2xl">
        <FormCliente esAdmin={u.rol === 'admin'} />
      </Tarjeta>
    </>
  )
}
