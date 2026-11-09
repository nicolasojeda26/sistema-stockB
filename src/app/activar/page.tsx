import type { Metadata } from 'next'
import Link from 'next/link'
import { Portada } from '@/components/portada'
import { FormActivar } from './form'

export const metadata: Metadata = { title: 'Crear contraseña' }

export default async function ActivarPage() {
  return (
    <Portada subtitulo="Creá tu contraseña con el código que te dio la administradora.">
      <FormActivar />
      <p className="mt-4 text-center text-sm text-tinta-suave">
        <Link href="/login" className="font-semibold text-marca hover:underline">
          Volver a entrar con contraseña
        </Link>
      </p>
    </Portada>
  )
}
