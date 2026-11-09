import type { Metadata } from 'next'
import Link from 'next/link'
import { FormLogin } from './form'
import { Portada } from '@/components/portada'

export const metadata: Metadata = { title: 'Entrar' }

export default async function LoginPage() {
  return (
    <Portada subtitulo="Entrá con tu usuario para vender y ver el stock.">
      <FormLogin />
      <p className="mt-4 text-center text-sm text-tinta-suave">
        ¿Es tu primera vez o te olvidaste la contraseña?{' '}
        <Link href="/activar" className="font-semibold text-marca hover:underline">
          Entrá con tu código de acceso
        </Link>
      </p>
    </Portada>
  )
}
