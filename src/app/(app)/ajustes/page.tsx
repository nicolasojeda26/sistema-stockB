import type { Metadata } from 'next'
import { requerirAdmin } from '@/lib/dal'
import { leerAjustes } from '@/lib/ajustes'
import { Encabezado, Tarjeta, TituloTarjeta } from '@/components/ui'
import { FormAjustes } from './form'

export const metadata: Metadata = { title: 'Ajustes del negocio' }

export default async function AjustesPage() {
  await requerirAdmin()
  const a = await leerAjustes()
  return (
    <>
      <Encabezado titulo="Ajustes del negocio" detalle="Datos que salen en los tickets." />
      <Tarjeta className="max-w-xl">
        <TituloTarjeta>Ticket</TituloTarjeta>
        <FormAjustes ajustes={a} />
      </Tarjeta>
    </>
  )
}
