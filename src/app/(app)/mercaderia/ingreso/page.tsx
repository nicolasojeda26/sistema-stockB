import type { Metadata } from 'next'
import { PaginaOperacion } from '../pagina'

export const metadata: Metadata = { title: 'Ingreso de mercadería' }

export default async function IngresoPage(props: PageProps<'/mercaderia/ingreso'>) {
  const articulo = Number((await props.searchParams).articulo) || null
  return <PaginaOperacion tipo="ingreso" articulo={articulo} />
}
