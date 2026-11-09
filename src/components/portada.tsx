import { connection } from 'next/server'
import type { ReactNode } from 'react'
import { estiloMarca, leerAjustes, urlLogo } from '@/lib/ajustes'
import { Logotipo } from '@/components/marca'

/** Pantallas sin sesión (entrar, crear contraseña) con la marca arriba. */
export async function Portada({ subtitulo, children }: { subtitulo: string; children: ReactNode }) {
  // Se arma en cada visita: si no, quedaría el nombre del negocio que había al publicar.
  await connection()
  const a = await leerAjustes()
  const estilo = estiloMarca(a.color_marca)
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      {estilo && <style>{estilo}</style>}
      <div className="w-full max-w-sm">
        <div className="mb-6 rounded-2xl bg-negro px-6 py-8 text-center">
          <Logotipo nombre={a.nombre_negocio} logo={urlLogo(a)} className="text-4xl" />
          <p className="mt-2 text-sm text-white/70">{subtitulo}</p>
        </div>
        {children}
      </div>
    </main>
  )
}
