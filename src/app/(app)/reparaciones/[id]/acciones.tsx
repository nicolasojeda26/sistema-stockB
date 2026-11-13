'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Aviso, Boton, BotonLink, Campo, Input, Tarjeta, TituloTarjeta, Textarea } from '@/components/ui'
import { parseNumero } from '@/lib/numeros'
import type { EstadoReparacion } from '@/lib/reparaciones'
import { cambiarEstado } from '../actions'

/** Al recibir un equipo, abre la impresión del comprobante una vez. */
export function ImprimirAlEntrar() {
  const router = useRouter()
  useEffect(() => {
    const t = setTimeout(() => {
      window.print()
      router.replace(window.location.pathname, { scroll: false })
    }, 400)
    return () => clearTimeout(t)
  }, [router])
  return null
}

const aTexto = (n: number | null) => (n == null ? '' : String(n).replace('.', ','))

export function AccionesReparacion({
  id,
  estado,
  precio,
  presupuesto,
  puedeCobrar,
}: {
  id: number
  estado: EstadoReparacion
  precio: number | null
  presupuesto: number | null
  puedeCobrar: boolean
}) {
  const [modo, setModo] = useState<'listo' | 'sin_reparacion' | 'nota' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [importe, setImporte] = useState(aTexto(precio ?? presupuesto))
  const [texto, setTexto] = useState('')
  const [guardando, iniciar] = useTransition()
  const cerrada = estado === 'entregado' || estado === 'cancelado'

  const hacer = (cambio: Parameters<typeof cambiarEstado>[1], confirmar?: string) => {
    if (confirmar && !confirm(confirmar)) return
    setError(null)
    iniciar(async () => {
      const r = await cambiarEstado(id, cambio)
      if (r.error) return setError(r.error)
      setModo(null)
      setTexto('')
    })
  }

  return (
    <Tarjeta>
      <TituloTarjeta>{cerrada ? 'Reparación cerrada' : 'Qué sigue'}</TituloTarjeta>
      <div className="space-y-3 p-5">
        {!cerrada && !modo && (
          <div className="grid gap-2">
            {estado === 'ingresado' && (
              <Boton onClick={() => hacer({ accion: 'empezar' })} disabled={guardando}>
                Empezar la reparación
              </Boton>
            )}
            {['ingresado', 'en_reparacion', 'sin_reparacion'].includes(estado) && (
              <Boton onClick={() => setModo('listo')} variante={estado === 'ingresado' ? 'secundario' : 'primario'}>
                Está lista
              </Boton>
            )}
            {(estado === 'listo' || estado === 'sin_reparacion') && precio != null && precio > 0 && (
              puedeCobrar ? (
                <BotonLink href={`/vender?reparacion=${id}`} className="justify-center">
                  Cobrar y entregar en la caja
                </BotonLink>
              ) : (
                <p className="text-sm text-tinta-suave">Se cobra en la caja: quien vende la busca con el número.</p>
              )
            )}
            {estado === 'listo' && (
              <Boton variante="secundario" onClick={() => setModo('listo')}>
                Cambiar importe
              </Boton>
            )}
            {(estado === 'sin_reparacion' || estado === 'listo') && !(precio && precio > 0) && (
              <Boton onClick={() => hacer({ accion: 'entregar_sin_cobro' }, '¿Entregar el equipo sin cobrar?')} disabled={guardando}>
                Entregar sin cobrar
              </Boton>
            )}
            {['ingresado', 'en_reparacion', 'listo'].includes(estado) && (
              <Boton variante="secundario" onClick={() => setModo('sin_reparacion')}>
                No se pudo reparar
              </Boton>
            )}
            {['ingresado', 'en_reparacion'].includes(estado) && (
              <button
                type="button"
                onClick={() => hacer({ accion: 'cancelar', nota: 'Cancelada' }, '¿Cancelar la reparación? (por ejemplo, el cliente se lo llevó sin repararlo)')}
                className="text-sm text-tinta-suave hover:text-error"
              >
                Cancelar reparación
              </button>
            )}
          </div>
        )}

        {(modo === 'listo' || modo === 'sin_reparacion') && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              const n = importe.trim() ? parseNumero(importe) : null
              if (importe.trim() && (n === null || n < 0)) return setError('El importe no es válido.')
              if (modo === 'listo') hacer({ accion: 'listo', precio: n ?? 0, diagnostico: texto })
              else hacer({ accion: 'sin_reparacion', precio: n, diagnostico: texto })
            }}
          >
            <Campo etiqueta={modo === 'listo' ? 'Cuánto se cobra' : 'Cargo por revisión (opcional)'}>
              <Input value={importe} onChange={(e) => setImporte(e.target.value)} inputMode="decimal" placeholder="0" required={modo === 'listo'} autoFocus />
            </Campo>
            <Campo etiqueta={modo === 'listo' ? 'Qué se hizo' : 'Por qué no se pudo'} ayuda="Queda en el historial.">
              <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} maxLength={1000} />
            </Campo>
            <div className="flex gap-2">
              <Boton type="submit" disabled={guardando}>
                Guardar
              </Boton>
              <Boton type="button" variante="secundario" onClick={() => setModo(null)}>
                Cancelar
              </Boton>
            </div>
          </form>
        )}

        {modo === 'nota' ? (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault()
              hacer({ accion: 'nota', nota: texto })
            }}
          >
            <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} maxLength={500} placeholder="Ej.: el cliente aprobó el presupuesto por teléfono." autoFocus />
            <div className="flex gap-2">
              <Boton type="submit" disabled={guardando}>
                Agregar nota
              </Boton>
              <Boton type="button" variante="secundario" onClick={() => setModo(null)}>
                Cancelar
              </Boton>
            </div>
          </form>
        ) : (
          !modo && (
            <button type="button" onClick={() => setModo('nota')} className="text-sm font-medium text-marca hover:underline">
              + Agregar una nota
            </button>
          )
        )}
        {error && <Aviso tipo="error">{error}</Aviso>}
      </div>
    </Tarjeta>
  )
}
