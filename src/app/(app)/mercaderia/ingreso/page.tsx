import type { Metadata } from 'next'
import { PaginaOperacion } from '../pagina'

export const metadata: Metadata = { title: 'Ingreso de mercadería' }

export default function IngresoPage() {
  return <PaginaOperacion tipo="ingreso" />
}
