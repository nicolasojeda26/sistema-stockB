import type { Metadata } from 'next'
import { connection } from 'next/server'
import { FormLogin } from './form'
import { leerAjustes } from '@/lib/ajustes'
import { MarcaEtiqueta } from '@/app/(app)/navegacion'

export const metadata: Metadata = { title: 'Entrar' }

export default async function LoginPage() {
  // Se arma en cada visita: si no, quedaría el nombre del negocio que había al publicar.
  await connection()
  const { nombre_negocio } = await leerAjustes()
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <MarcaEtiqueta className="mx-auto mb-4 h-14 w-14" />
          <h1 className="text-2xl font-bold tracking-tight">{nombre_negocio}</h1>
          <p className="mt-1 text-sm text-tinta-suave">Entrá con tu usuario para vender y ver el stock.</p>
        </div>
        <FormLogin />
      </div>
    </main>
  )
}
