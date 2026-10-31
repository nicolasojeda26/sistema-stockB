import type { Metadata } from 'next'
import { PaginaOperacion } from '../pagina'

export const metadata: Metadata = { title: 'Ajuste de stock' }

export default function AjustePage() {
  return <PaginaOperacion tipo="ajuste" />
}
