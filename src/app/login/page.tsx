import type { Metadata } from 'next'
import Link from 'next/link'
import { FormLogin } from './form'
import { Portada } from '@/components/portada'

export const metadata: Metadata = { title: 'Entrar' }

export default async function LoginPage(props: PageProps<'/login'>) {
  const salir = (await props.searchParams).salir !== undefined
  return (
    <Portada subtitulo="Entrá con tu usuario para vender y ver el stock.">
      {salir && (
        <p className="mb-4 rounded-lg bg-alerta-claro px-3 py-2 text-sm text-alerta">
          Tu sesión se cerró porque cambiaron tus datos (sucursal, rol o contraseña). Volvé a entrar.
        </p>
      )}
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
