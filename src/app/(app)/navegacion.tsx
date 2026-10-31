'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, type ReactNode } from 'react'

export type ItemNav = { href: string; texto: string; icono: keyof typeof iconos; exacto?: boolean; seccion?: string }

const trazo = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const
const iconos = {
  inicio: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  productos: (
    <>
      <path d="M21 8 12 3 3 8v8l9 5 9-5z" />
      <path d="m3 8 9 5 9-5M12 13v8" />
    </>
  ),
  categorias: (
    <>
      <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" />
      <circle cx="7.5" cy="7.5" r="1.2" />
    </>
  ),
  sucursales: (
    <>
      <path d="M3 21h18M4 21V9l8-5 8 5v12" />
      <path d="M9 21v-6h6v6" />
    </>
  ),
  usuarios: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5" />
    </>
  ),
  ingreso: (
    <>
      <path d="M21 8 12 3 3 8v8l9 5 9-5z" />
      <path d="M12 8v6m-3-3h6" />
    </>
  ),
  transferencia: <path d="M4 8h13m0 0-3-3m3 3-3 3M20 16H7m0 0 3-3m-3 3 3 3" />,
  ajuste: (
    <>
      <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="10" cy="12" r="2" />
      <circle cx="18" cy="18" r="2" />
    </>
  ),
  movimientos: <path d="M4 6h16M4 12h16M4 18h10" />,
  vender: (
    <>
      <path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L21 8H6.2" />
      <circle cx="9" cy="20" r="1.3" />
      <circle cx="17" cy="20" r="1.3" />
    </>
  ),
  caja: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18M7 15h3" />
    </>
  ),
  ventas: <path d="M4 19V5M4 19h16M8 15l3-4 3 2 5-6" />,
  factura: (
    <>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </>
  ),
  reportes: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  ajustes: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
  precios: (
    <>
      <path d="M12 3v18M16.5 7.5c0-1.7-2-3-4.5-3s-4.5 1.3-4.5 3 1.6 2.6 4.5 3.2 4.5 1.6 4.5 3.3-2 3-4.5 3-4.5-1.3-4.5-3" />
    </>
  ),
  etiquetas: (
    <>
      <path d="M4 5v14M7 5v14M10 5v14M14 5v14M16 5v14M20 5v14" />
    </>
  ),
  importar: (
    <>
      <path d="M12 3v12m0 0-4-4m4 4 4-4" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </>
  ),
}

export function Navegacion({ items, pie }: { items: ItemNav[]; pie: ReactNode }) {
  const ruta = usePathname()
  const [abierto, setAbierto] = useState(false)
  const activo = (it: ItemNav) => (it.exacto ? ruta === it.href : ruta.startsWith(it.href))

  return (
    <>
      <header className="sticky top-0 z-20 flex print:hidden h-14 items-center justify-between bg-tinta px-4 text-white lg:hidden">
        <span className="font-semibold">Stock y ventas</span>
        <button
          onClick={() => setAbierto((a) => !a)}
          aria-expanded={abierto}
          aria-label="Menú"
          className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-white/10"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" {...trazo}>
            {abierto ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </header>
      <aside
        className={`${abierto ? 'flex' : 'hidden'} fixed inset-x-0 top-14 bottom-0 z-20 flex-col bg-tinta lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0 print:hidden`}
      >
        <div className="hidden h-16 items-center gap-3 px-5 lg:flex">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-sm font-bold text-tinta">S</div>
          <span className="font-semibold text-white">Stock y ventas</span>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3 lg:py-2">
          {items.map((it) => [
            it.seccion && (
              <p key={`s-${it.seccion}`} className="px-3 pt-4 pb-1 text-[11px] font-medium uppercase tracking-wider text-white/40">
                {it.seccion}
              </p>
            ),
            <Link
              key={it.href}
              href={it.href}
              aria-current={activo(it) ? 'page' : undefined}
              onClick={() => setAbierto(false)}
              className={`flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors ${
                activo(it) ? 'bg-white/12 font-medium text-white' : 'text-white/70 hover:bg-white/6 hover:text-white'
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0" {...trazo}>
                {iconos[it.icono]}
              </svg>
              {it.texto}
            </Link>,
          ])}
        </nav>
        {pie}
      </aside>
    </>
  )
}
