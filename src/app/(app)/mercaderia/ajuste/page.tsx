import type { Metadata } from 'next'
import { PaginaOperacion } from '../pagina'

export const metadata: Metadata = { title: 'Ajuste de stock' }

export default async function AjustePage(props: PageProps<'/mercaderia/ajuste'>) {
  const articulo = Number((await props.searchParams).articulo) || null
  return <PaginaOperacion tipo="ajuste" articulo={articulo} />
}
