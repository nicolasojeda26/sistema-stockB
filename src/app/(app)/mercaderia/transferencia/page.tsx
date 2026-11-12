import type { Metadata } from 'next'
import { requerirPermiso } from '@/lib/dal'
import { PaginaOperacion } from '../pagina'

export const metadata: Metadata = { title: 'Transferencia' }

export default async function TransferenciaPage(props: PageProps<'/mercaderia/transferencia'>) {
  // Entre sucursales se usan los envíos (con confirmación); la transferencia directa queda para la administración.
  await requerirPermiso('transferencias')
  const articulo = Number((await props.searchParams).articulo) || null
  return <PaginaOperacion tipo="transferencia" articulo={articulo} />
}
