import type { Metadata } from 'next'
import { requerirUsuario } from '@/lib/dal'
import { Encabezado, Tarjeta } from '@/components/ui'
import { FormCliente } from '../form-cliente'

export const metadata: Metadata = { title: 'Nueva clienta' }

export default async function NuevaClientePage() {
  const u = await requerirUsuario()
  return (
    <>
      <Encabezado titulo="Nueva clienta" detalle="Con nombre alcanza; el resto es opcional." />
      <Tarjeta className="max-w-2xl">
        <FormCliente esAdmin={u.rol === 'admin'} />
      </Tarjeta>
    </>
  )
}
