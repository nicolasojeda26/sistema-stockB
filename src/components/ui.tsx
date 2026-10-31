import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

type Variante = 'primario' | 'secundario' | 'peligro' | 'fantasma'
const estilosBoton: Record<Variante, string> = {
  primario: 'bg-marca text-white hover:bg-marca-oscura disabled:bg-marca/50',
  secundario: 'bg-papel text-tinta border border-linea hover:bg-fondo disabled:text-apagado',
  peligro: 'bg-papel text-error border border-error/30 hover:bg-error-claro',
  fantasma: 'text-marca hover:bg-marca-clara',
}
const baseBoton =
  'inline-flex items-center justify-center gap-2 rounded-lg px-4 h-10 text-sm font-medium transition-colors disabled:cursor-not-allowed whitespace-nowrap'

export function Boton({ variante = 'primario', className, ...p }: ComponentProps<'button'> & { variante?: Variante }) {
  return <button className={cx(baseBoton, estilosBoton[variante], className)} {...p} />
}

export function BotonLink({
  variante = 'primario',
  className,
  ...p
}: ComponentProps<typeof Link> & { variante?: Variante }) {
  return <Link className={cx(baseBoton, estilosBoton[variante], className)} {...p} />
}

export function Encabezado({ titulo, detalle, acciones }: { titulo: string; detalle?: ReactNode; acciones?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
        {detalle && <p className="mt-1 text-sm text-tinta-suave">{detalle}</p>}
      </div>
      {acciones && <div className="flex flex-wrap gap-2">{acciones}</div>}
    </div>
  )
}

export function Tarjeta({ className, children, ...p }: ComponentProps<'section'>) {
  return (
    <section className={cx('rounded-xl border border-linea bg-papel', className)} {...p}>
      {children}
    </section>
  )
}

export function TituloTarjeta({ children, acciones }: { children: ReactNode; acciones?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-linea px-5 py-3">
      <h2 className="text-sm font-semibold">{children}</h2>
      {acciones}
    </div>
  )
}

export function Campo({
  etiqueta,
  ayuda,
  error,
  children,
  className,
}: {
  etiqueta: string
  ayuda?: ReactNode
  error?: string
  children: ReactNode
  className?: string
}) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1.5 block text-sm font-medium text-tinta">{etiqueta}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-error">{error}</span>
      ) : (
        ayuda && <span className="mt-1 block text-xs text-apagado">{ayuda}</span>
      )}
    </label>
  )
}

const baseInput =
  'w-full rounded-lg border border-linea bg-papel px-3 h-10 text-sm text-tinta placeholder:text-apagado focus:border-marca focus:outline-none focus:ring-2 focus:ring-marca/15 disabled:bg-fondo'

export function Input({ className, ...p }: ComponentProps<'input'>) {
  return <input className={cx(baseInput, className)} {...p} />
}

export function Select({ className, ...p }: ComponentProps<'select'>) {
  return <select className={cx(baseInput, 'pr-8', className)} {...p} />
}

export function Aviso({ tipo = 'info', children }: { tipo?: 'info' | 'ok' | 'error' | 'alerta'; children: ReactNode }) {
  const estilos = {
    info: 'bg-marca-clara text-marca-oscura',
    ok: 'bg-ok-claro text-ok',
    error: 'bg-error-claro text-error',
    alerta: 'bg-alerta-claro text-alerta',
  }[tipo]
  return (
    <div role={tipo === 'error' ? 'alert' : 'status'} className={cx('rounded-lg px-4 py-3 text-sm', estilos)}>
      {children}
    </div>
  )
}

export function Etiqueta({ tono = 'neutro', children }: { tono?: 'neutro' | 'ok' | 'apagado' | 'alerta' | 'marca'; children: ReactNode }) {
  const estilos = {
    neutro: 'bg-fondo text-tinta-suave',
    ok: 'bg-ok-claro text-ok',
    apagado: 'bg-fondo text-apagado',
    alerta: 'bg-alerta-claro text-alerta',
    marca: 'bg-marca-clara text-marca',
  }[tono]
  return <span className={cx('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium', estilos)}>{children}</span>
}

export function Vacio({ children }: { children: ReactNode }) {
  return <div className="px-5 py-12 text-center text-sm text-apagado">{children}</div>
}

export const tablaCls = {
  tabla: 'w-full text-sm',
  th: 'px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-apagado border-b border-linea bg-fondo/60',
  td: 'px-4 py-3 border-b border-linea align-middle',
}
