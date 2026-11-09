'use client'

import Link from 'next/link'
import { Logotipo } from '@/components/marca'
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
  clientes: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.8a3.5 3.5 0 0 1 0 6.4M18.5 14.8c1.6.8 2.6 2.5 3 5.2" />
    </>
  ),
  factura: (
    <>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </>
  ),
  reportes: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  proveedores: (
    <>
      <path d="M2 7h11v9H2zM13 10h4l4 3v3h-8" />
      <circle cx="6" cy="18" r="1.8" />
      <circle cx="17" cy="18" r="1.8" />
    </>
  ),
  compras: (
    <>
      <path d="M5 8h14l-1.2 12H6.2z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </>
  ),
  gastos: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 9v.01M18 15v.01" />
    </>
  ),
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

export function Icono({ nombre, className = 'h-5 w-5' }: { nombre: keyof typeof iconos; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden {...trazo}>
      {iconos[nombre]}
    </svg>
  )
}

const RAPIDOS = ['/', '/vender', '/productos', '/caja', '/pedidos', '/mercaderia/transferencia']

export function Navegacion({ items, pie, negocio, logo }: { items: ItemNav[]; pie: ReactNode; negocio: string; logo: string | null }) {
  const ruta = usePathname()
  const [abierto, setAbierto] = useState(false)
  const activo = (it: ItemNav) => (it.exacto ? ruta === it.href : ruta === it.href || ruta.startsWith(it.href + '/'))

  // Agrupa por sección (la sección se declara en el primer ítem de cada grupo).
  const grupos: { seccion?: string; items: ItemNav[] }[] = []
  for (const it of items) {
    if (it.seccion || grupos.length === 0) grupos.push({ seccion: it.seccion, items: [] })
    grupos[grupos.length - 1].items.push(it)
  }
  const enConfig = grupos.some((g) => g.seccion === 'Configuración' && g.items.some(activo))
  // Abierto si se pidió, o siempre que se esté en una pantalla de configuración.
  const [configPedida, setConfigPedida] = useState(false)
  const config = configPedida || enConfig
  const rapidos = (RAPIDOS.map((h) => items.find((it) => it.href === h)).filter(Boolean) as ItemNav[]).slice(0, 4)

  const enlace = (it: ItemNav) => (
    <Link
      key={it.href}
      href={it.href}
      aria-current={activo(it) ? 'page' : undefined}
      onClick={() => setAbierto(false)}
      className={`flex h-10 items-center gap-3 rounded-lg px-3 text-[15px] transition-colors lg:h-9 lg:text-sm ${
        activo(it) ? 'bg-marca-clara font-semibold text-marca' : 'text-tinta-suave hover:bg-fondo hover:text-tinta'
      }`}
    >
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0" {...trazo}>
        {iconos[it.icono]}
      </svg>
      {it.texto}
    </Link>
  )

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between bg-negro px-4 lg:hidden print:hidden">
        <Link href="/" className="flex min-w-0 items-center" aria-label="Inicio">
          <Logotipo nombre={negocio} logo={logo} className="truncate text-xl" />
        </Link>
        <button
          onClick={() => setAbierto((a) => !a)}
          aria-expanded={abierto}
          aria-label="Menú"
          className="flex h-10 w-10 items-center justify-center rounded-lg text-white/80 hover:bg-white/10"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" {...trazo}>
            {abierto ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </header>
      <aside
        className={`${abierto ? 'flex' : 'hidden'} fixed inset-x-0 top-14 bottom-0 z-30 flex-col border-r border-linea bg-papel lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-60 lg:shrink-0 print:hidden`}
      >
        <Link href="/" className="mb-2 hidden h-16 items-center bg-negro px-5 lg:flex" aria-label="Inicio">
          <Logotipo nombre={negocio} logo={logo} className="truncate text-2xl" />
        </Link>
        <nav className="flex-1 overflow-y-auto px-3 pb-3" aria-label="Principal">
          {grupos.map((g, i) =>
            g.seccion === 'Configuración' ? (
              <div key={i} className="mt-3">
                <button
                  type="button"
                  onClick={() => setConfigPedida(!config)}
                  aria-expanded={config}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-xs font-semibold text-apagado hover:text-tinta"
                >
                  Configuración
                  <svg viewBox="0 0 24 24" className={`h-4 w-4 transition-transform ${config ? 'rotate-180' : ''}`} {...trazo}>
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
                {config && <div className="space-y-0.5">{g.items.map(enlace)}</div>}
              </div>
            ) : (
              <div key={i} className={g.seccion ? 'mt-3' : 'pt-2 lg:pt-0'}>
                {g.seccion && <p className="px-3 py-1.5 text-xs font-semibold text-apagado">{g.seccion}</p>}
                <div className="space-y-0.5">{g.items.map(enlace)}</div>
              </div>
            ),
          )}
        </nav>
        {pie}
      </aside>
      {/* En el celular: lo de todos los días, siempre a mano abajo. */}
      <nav
        aria-label="Accesos rápidos"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-linea bg-papel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden print:hidden"
      >
        {rapidos.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            onClick={() => setAbierto(false)}
            aria-current={activo(it) ? 'page' : undefined}
            className={`flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium ${activo(it) ? 'text-marca' : 'text-tinta-suave'}`}
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" {...trazo}>
              {iconos[it.icono]}
            </svg>
            {it.texto}
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setAbierto((a) => !a)}
          aria-expanded={abierto}
          className={`flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium ${abierto ? 'text-marca' : 'text-tinta-suave'}`}
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" {...trazo}>
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
          Más
        </button>
      </nav>
    </>
  )
}
