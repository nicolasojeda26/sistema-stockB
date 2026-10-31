import type { Metadata } from 'next'
import { PaginaOperacion } from '../pagina'

export const metadata: Metadata = { title: 'Transferencia' }

export default function TransferenciaPage() {
  return <PaginaOperacion tipo="transferencia" />
}
