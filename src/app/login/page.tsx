import type { Metadata } from 'next'
import { FormLogin } from './form'

export const metadata: Metadata = { title: 'Entrar' }

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-tinta text-lg font-bold text-white">
            S
          </div>
          <h1 className="text-xl font-semibold">Stock y ventas</h1>
          <p className="mt-1 text-sm text-tinta-suave">Entrá con tu usuario</p>
        </div>
        <FormLogin />
      </div>
    </main>
  )
}
