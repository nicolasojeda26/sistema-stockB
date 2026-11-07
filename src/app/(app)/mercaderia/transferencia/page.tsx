import type { Metadata } from 'next'
import { PaginaOperacion } from '../pagina'

export const metadata: Metadata = { title: 'Transferencia' }

export default async function TransferenciaPage(props: PageProps<'/mercaderia/transferencia'>) {
  const articulo = Number((await props.searchParams).articulo) || null
  return <PaginaOperacion tipo="transferencia" articulo={articulo} />
}
