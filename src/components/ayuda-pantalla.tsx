'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useSyncExternalStore } from 'react'
import { seccionDeRuta, type SeccionGuia } from '@/lib/guia'

/**
 * Ayuda corta de cada pantalla. La primera vez que alguien entra a una pantalla se ve abierta;
 * al cerrarla queda como una línea que se abre con un toque. Se puede apagar desde la guía.
 * Lo que vio cada persona queda en su navegador (no hace falta que sea exacto).
 */
const CLAVE = 'ayudas-pantalla'
const EVENTO = 'ayudas-pantalla'
type Preferencias = { oculta?: boolean; vistas?: string[] }

function leerCrudo(): string {
  try {
    return localStorage.getItem(CLAVE) ?? '{}'
  } catch {
    return '{}'
  }
}

export function leerPreferencias(crudo: string): Preferencias {
  try {
    const p = JSON.parse(crudo)
    return p && typeof p === 'object' ? p : {}
  } catch {
    return {}
  }
}

export function guardarPreferencias(cambio: (p: Preferencias) => Preferencias) {
  try {
    const nuevo = cambio(leerPreferencias(leerCrudo()))
    localStorage.setItem(CLAVE, JSON.stringify(nuevo))
  } catch {
    /* sin almacenamiento: la ayuda igual funciona, solo no se recuerda */
  }
  window.dispatchEvent(new Event(EVENTO))
}

function suscribir(aviso: () => void) {
  window.addEventListener('storage', aviso)
  window.addEventListener(EVENTO, aviso)
  return () => {
    window.removeEventListener('storage', aviso)
    window.removeEventListener(EVENTO, aviso)
  }
}

/** Preferencias guardadas; en el servidor, `null` (todavía no se sabe). */
export function usePreferenciasAyuda(): Preferencias | null {
  const crudo = useSyncExternalStore(suscribir, leerCrudo, () => null)
  return crudo === null ? null : leerPreferencias(crudo)
}

export function AyudaPantalla() {
  const pathname = usePathname()
  const seccion = pathname.startsWith('/guia') ? undefined : seccionDeRuta(pathname)
  const pref = usePreferenciasAyuda()
  if (!seccion || !pref || pref.oculta) return null
  return <Barra key={seccion.id} seccion={seccion} vista={!!pref.vistas?.includes(seccion.id)} />
}

function Barra({ seccion, vista }: { seccion: SeccionGuia; vista: boolean }) {
  const [abierta, setAbierta] = useState(!vista)

  const cerrar = () => {
    setAbierta(false)
    if (!vista) guardarPreferencias((p) => ({ ...p, vistas: [...new Set([...(p.vistas ?? []), seccion.id])] }))
  }

  return (
    <section className="mb-5 rounded-xl border border-marca/25 bg-marca-clara/50 text-sm print:hidden" aria-label="Ayuda de esta pantalla">
      <button
        type="button"
        onClick={() => (abierta ? cerrar() : setAbierta(true))}
        aria-expanded={abierta}
        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left font-medium text-marca-oscura"
      >
        <Lampara />
        <span className="min-w-0 flex-1">
          Cómo se usa esta pantalla<span className="hidden font-normal text-tinta-suave sm:inline"> · {seccion.titulo}</span>
        </span>
        <span aria-hidden className={`text-xs transition-transform ${abierta ? 'rotate-180' : ''}`}>
          ▾
        </span>
      </button>
      {abierta && (
        <div className="space-y-3 border-t border-marca/15 px-4 pt-3 pb-4 text-tinta">
          <p className="leading-relaxed">{seccion.resumen}</p>
          {seccion.pasos && (
            <ol className="list-decimal space-y-1 pl-5 leading-relaxed marker:font-semibold marker:text-marca">
              {seccion.pasos.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ol>
          )}
          {seccion.consejos && (
            <ul className="space-y-1 leading-relaxed">
              {seccion.consejos.map((c) => (
                <li key={c} className="flex gap-2">
                  <span aria-hidden className="font-bold text-marca">✓</span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          )}
          {seccion.problemas && (
            <div className="space-y-1">
              <p className="text-xs font-semibold tracking-wide text-apagado uppercase">Si pasa esto</p>
              {seccion.problemas.map(([si, entonces]) => (
                <p key={si} className="leading-relaxed">
                  <span className="font-semibold">{si}:</span> {entonces}
                </p>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
            <button type="button" onClick={cerrar} className="h-9 rounded-lg bg-marca px-4 font-semibold text-white hover:opacity-90">
              Entendido
            </button>
            <Link href={`/guia#${seccion.id}`} className="font-medium text-marca hover:underline">
              Ver en la guía completa →
            </Link>
            <button
              type="button"
              onClick={() => confirm('¿Ocultar estas ayudas en todas las pantallas? Las podés volver a prender desde la Guía del sistema.') && guardarPreferencias((p) => ({ ...p, oculta: true }))}
              className="ml-auto text-xs text-tinta-suave hover:text-tinta"
            >
              No mostrar más ayudas
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

function Lampara() {
  return (
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 shrink-0 text-marca" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" />
    </svg>
  )
}
