import type { Metadata } from 'next'
import { requerirAdmin } from '@/lib/dal'
import { leerAjustes, urlLogo } from '@/lib/ajustes'
import { Encabezado, Tarjeta, TituloTarjeta } from '@/components/ui'
import { FormAjustes, FormMarca } from './form'

export const metadata: Metadata = { title: 'Ajustes del negocio' }

export default async function AjustesPage() {
  await requerirAdmin()
  const a = await leerAjustes()
  return (
    <>
      <Encabezado titulo="Ajustes del negocio" detalle="Marca, tickets y listas que se usan al cargar productos." />
      <div className="max-w-xl space-y-5">
        <Tarjeta>
          <TituloTarjeta>Marca</TituloTarjeta>
          <FormMarca color={a.color_marca} logo={urlLogo(a)} />
        </Tarjeta>
        <Tarjeta>
          <TituloTarjeta>Negocio y ticket</TituloTarjeta>
          <FormAjustes ajustes={a} />
        </Tarjeta>
      </div>
    </>
  )
}
