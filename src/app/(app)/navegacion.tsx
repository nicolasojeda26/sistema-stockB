'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, type ReactNode } from 'react'

export type ItemNav = { href: string; texto: string; icono: keyof typeof iconos }

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
  const activo = (href: string) => (href === '/' ? ruta === '/' : ruta.startsWith(href))

  return (
    <>
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between bg-tinta px-4 text-white lg:hidden">
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
        className={`${abierto ? 'flex' : 'hidden'} fixed inset-x-0 top-14 bottom-0 z-20 flex-col bg-tinta lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0`}
      >
        <div className="hidden h-16 items-center gap-3 px-5 lg:flex">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-sm font-bold text-tinta">S</div>
          <span className="font-semibold text-white">Stock y ventas</span>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3 lg:py-2">
          {items.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              aria-current={activo(it.href) ? 'page' : undefined}
              onClick={() => setAbierto(false)}
              className={`flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors ${
                activo(it.href) ? 'bg-white/12 font-medium text-white' : 'text-white/70 hover:bg-white/6 hover:text-white'
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0" {...trazo}>
                {iconos[it.icono]}
              </svg>
              {it.texto}
            </Link>
          ))}
        </nav>
        {pie}
      </aside>
    </>
  )
}
