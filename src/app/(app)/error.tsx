'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { Boton, Tarjeta } from '@/components/ui'

export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])
  return (
    <Tarjeta className="mx-auto mt-10 max-w-md p-6 text-center">
      <h1 className="text-lg font-semibold">Algo salió mal</h1>
      <p className="mt-2 text-sm text-tinta-suave">
        No se pudo cargar esta pantalla. Puede ser la conexión a internet. Probá de nuevo; si sigue pasando, avisale a quien administra el sistema.
      </p>
      <div className="mt-5 flex justify-center gap-2">
        <Boton onClick={() => retry()}>Probar de nuevo</Boton>
        <Link href="/" className="inline-flex h-10 items-center rounded-lg border border-linea px-4 text-sm font-medium hover:bg-fondo">
          Ir al inicio
        </Link>
      </div>
    </Tarjeta>
  )
}
