'use client'

export function BotonImprimir({ texto = 'Imprimir' }: { texto?: string }) {
  return (
    <button
      onClick={() => window.print()}
      className="inline-flex h-10 items-center rounded-lg border border-linea bg-papel px-4 text-sm font-medium hover:bg-fondo print:hidden"
    >
      {texto}
    </button>
  )
}
