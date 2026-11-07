import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

type Variante = 'primario' | 'secundario' | 'peligro' | 'fantasma'
const estilosBoton: Record<Variante, string> = {
  primario: 'bg-marca text-white hover:bg-marca-oscura disabled:bg-marca/50',
  secundario: 'bg-papel text-tinta border border-linea shadow-xs hover:bg-fondo disabled:text-apagado',
  peligro: 'bg-papel text-error border border-error/30 hover:bg-error-claro',
  fantasma: 'text-marca hover:bg-marca-clara',
}
const baseBoton =
  'inline-flex items-center justify-center gap-2 rounded-lg px-4 h-10 text-sm font-semibold transition-colors disabled:cursor-not-allowed whitespace-nowrap'

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
        <h1 className="text-2xl font-bold tracking-tight sm:text-[1.75rem]">{titulo}</h1>
        {detalle && <p className="mt-1 text-sm text-tinta-suave">{detalle}</p>}
      </div>
      {acciones && <div className="flex flex-wrap gap-2">{acciones}</div>}
    </div>
  )
}

export function Tarjeta({ className, children, ...p }: ComponentProps<'section'>) {
  return (
    <section className={cx('rounded-xl border border-linea bg-papel shadow-[0_1px_2px_rgb(27_34_48/0.04)]', className)} {...p}>
      {children}
    </section>
  )
}

export function TituloTarjeta({ children, acciones }: { children: ReactNode; acciones?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-linea px-5 py-3">
      <h2 className="text-[15px] font-semibold">{children}</h2>
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

// Si se pasa un ancho o un alto propio, reemplaza al de base (si no, ganaría cualquiera de los dos).
const conMedidas = (className?: string) => {
  let base = baseInput
  if (/(^|\s)w-/.test(className ?? '')) base = base.replace('w-full ', '')
  if (/(^|\s)h-/.test(className ?? '')) base = base.replace(' h-10', '')
  return cx(base, className)
}

export function Input({ className, ...p }: ComponentProps<'input'>) {
  return <input className={conMedidas(className)} {...p} />
}

export function Select({ className, ...p }: ComponentProps<'select'>) {
  return <select className={cx(conMedidas(className), 'pr-8')} {...p} />
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

export function Etiqueta({ tono = 'neutro', children }: { tono?: 'neutro' | 'ok' | 'apagado' | 'alerta' | 'marca' | 'error'; children: ReactNode }) {
  const estilos = {
    error: 'bg-error-claro text-error',
    neutro: 'bg-fondo text-tinta-suave',
    ok: 'bg-ok-claro text-ok',
    apagado: 'bg-fondo text-apagado',
    alerta: 'bg-alerta-claro text-alerta',
    marca: 'bg-marca-clara text-marca',
  }[tono]
  return <span className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', estilos)}>{children}</span>
}

export function Vacio({ children, accion }: { children: ReactNode; accion?: ReactNode }) {
  return (
    <div className="px-5 py-12 text-center text-sm text-tinta-suave">
      {children}
      {accion && <div className="mt-4 flex flex-wrap justify-center gap-2">{accion}</div>}
    </div>
  )
}

/** Stock con color: rojo sin stock, naranja en el mínimo o menos. */
export function Stock({ cantidad, minimo }: { cantidad: number; minimo: number }) {
  const n = new Intl.NumberFormat('es-AR').format(cantidad)
  if (cantidad <= 0) return <Etiqueta tono="error">{cantidad < 0 ? n : 'Sin stock'}</Etiqueta>
  if (cantidad <= minimo) return <Etiqueta tono="alerta">{n}</Etiqueta>
  return <span className="num font-medium">{n}</span>
}

export const tablaCls = {
  tabla: 'w-full text-sm',
  th: 'px-4 py-2.5 text-left text-xs font-semibold text-tinta-suave border-b border-linea bg-fondo/70',
  td: 'px-4 py-3 border-b border-linea align-middle',
}
