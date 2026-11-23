'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Aviso, Boton, BotonLink, Campo, Input, Select, Tarjeta, TituloTarjeta, Textarea } from '@/components/ui'
import { parseNumero } from '@/lib/numeros'
import { MOTIVOS_CIERRE, type EstadoReparacion, type MotivoCierre } from '@/lib/reparaciones-texto'
import { cambiarEstado } from '../actions'

const aTexto = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','))

export function CopiarEnlace({ url }: { url: string }) {
  const [copiado, setCopiado] = useState(false)
  return (
    <div className="mt-2 flex gap-2">
      <input readOnly value={url} aria-label="Enlace de seguimiento" onFocus={(e) => e.target.select()} className="h-10 min-w-0 flex-1 rounded-lg border border-linea bg-fondo px-3 font-mono text-xs" />
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url)
            setCopiado(true)
            setTimeout(() => setCopiado(false), 2000)
          } catch {
            /* sin portapapeles: queda seleccionable */
          }
        }}
        className="h-10 shrink-0 rounded-lg border border-linea bg-papel px-3 text-sm font-medium hover:bg-fondo"
      >
        {copiado ? 'Copiado' : 'Copiar'}
      </button>
      <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 shrink-0 items-center rounded-lg border border-linea bg-papel px-3 text-sm font-medium hover:bg-fondo">
        Ver
      </a>
    </div>
  )
}

type Opcion = { id: number; nombre: string }

export function AccionesReparacion({
  id,
  estado,
  etapaId,
  precio,
  presupuesto,
  tipoReparacion,
  tecnicoId,
  garantiaDias,
  etapas,
  tecnicos,
  puedeCobrar,
  puedeReingresar,
}: {
  id: number
  estado: EstadoReparacion
  etapaId: number | null
  precio: number | null
  presupuesto: number | null
  tipoReparacion: string | null
  tecnicoId: number | null
  garantiaDias: number
  etapas: (Opcion & { fase: string })[]
  tecnicos: Opcion[]
  puedeCobrar: boolean
  puedeReingresar: boolean
}) {
  const router = useRouter()
  const [modo, setModo] = useState<'estado' | 'listo' | 'sin_reparacion' | 'nota' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guardando, iniciar] = useTransition()
  const cerrada = estado === 'entregado' || estado === 'cancelado'

  const hacer = (cambio: Parameters<typeof cambiarEstado>[1], confirmar?: string, despues?: string) => {
    if (confirmar && !confirm(confirmar)) return
    setError(null)
    iniciar(async () => {
      const r = await cambiarEstado(id, cambio)
      if (r.error) return setError(r.error)
      setModo(null)
      if (despues) router.push(despues)
    })
  }

  const tecnicoDe = (f: FormData) => Number(f.get('tecnico_id')) || null
  const pasos = etapas.filter((e) => e.id !== etapaId)

  return (
    <Tarjeta>
      <TituloTarjeta>{cerrada ? 'Reparación cerrada' : 'Qué sigue'}</TituloTarjeta>
      <div className="space-y-3 p-5">
        {!cerrada && !modo && (
          <div className="grid gap-2">
            {pasos.length > 0 && (
              <Boton onClick={() => setModo('estado')} variante={estado === 'ingresado' ? 'primario' : 'secundario'}>
                Informar estado
              </Boton>
            )}
            {['ingresado', 'en_reparacion', 'sin_reparacion'].includes(estado) && (
              <Boton onClick={() => setModo('listo')} variante={estado === 'en_reparacion' ? 'primario' : 'secundario'}>
                Está lista (reparada)
              </Boton>
            )}
            {(estado === 'listo' || estado === 'sin_reparacion') &&
              precio != null &&
              precio > 0 &&
              (puedeCobrar ? (
                <BotonLink href={`/vender?reparacion=${id}`} className="justify-center">
                  Cobrar y entregar en la caja
                </BotonLink>
              ) : (
                <p className="text-sm text-tinta-suave">Se cobra en la caja: quien vende la busca con el número.</p>
              ))}
            {estado === 'listo' && (
              <Boton variante="secundario" onClick={() => setModo('listo')}>
                Cambiar importe o técnico
              </Boton>
            )}
            {(estado === 'sin_reparacion' || estado === 'listo') && !(precio && precio > 0) && (
              <Boton onClick={() => hacer({ accion: 'entregar_sin_cobro' }, '¿Entregar el equipo sin cobrar?', `/reparaciones/${id}?entregada=1`)} disabled={guardando}>
                Entregar sin cobrar
              </Boton>
            )}
            {['ingresado', 'en_reparacion', 'listo'].includes(estado) && (
              <Boton variante="secundario" onClick={() => setModo('sin_reparacion')}>
                No se repara (sin solución, no aceptó…)
              </Boton>
            )}
            {['ingresado', 'en_reparacion'].includes(estado) && (
              <button
                type="button"
                onClick={() => hacer({ accion: 'cancelar', nota: 'Cancelada' }, '¿Cancelar la reparación? (por ejemplo, se cargó por error)')}
                className="text-sm text-tinta-suave hover:text-error"
              >
                Cancelar (cargada por error)
              </button>
            )}
          </div>
        )}

        {cerrada && puedeReingresar && !modo && (
          <BotonLink href={`/reparaciones/nueva?garantia=${id}`} variante="secundario" className="w-full justify-center">
            Reingreso por garantía
          </BotonLink>
        )}

        {modo === 'estado' && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              const f = new FormData(e.currentTarget)
              hacer({ accion: 'etapa', etapaId: Number(f.get('etapa_id')), tecnicoId: tecnicoDe(f), nota: String(f.get('nota') ?? '') })
            }}
          >
            <Campo etiqueta="Nuevo estado">
              <Select name="etapa_id" required defaultValue="" autoFocus>
                <option value="">Elegí…</option>
                {pasos.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre}
                  </option>
                ))}
              </Select>
            </Campo>
            <SelectTecnico tecnicos={tecnicos} tecnicoId={tecnicoId} />
            <Campo etiqueta="Detalle (opcional)" ayuda="Queda en el historial interno; el cliente ve solo el estado.">
              <Textarea name="nota" rows={2} maxLength={500} />
            </Campo>
            <Botones guardando={guardando} cancelar={() => setModo(null)} />
          </form>
        )}

        {modo === 'listo' && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              const f = new FormData(e.currentTarget)
              const n = parseNumero(String(f.get('precio') ?? ''))
              if (n === null || n <= 0) return setError('Poné cuánto se cobra.')
              const dias = Number(f.get('garantia_dias'))
              hacer({
                accion: 'listo',
                precio: n,
                diagnostico: String(f.get('diagnostico') ?? ''),
                tecnicoId: tecnicoDe(f),
                garantiaDias: Number.isInteger(dias) ? dias : null,
                tipoReparacion: String(f.get('tipo_reparacion') ?? ''),
              })
            }}
          >
            <Campo etiqueta="Cuánto se cobra">
              <Input name="precio" defaultValue={aTexto(precio ?? presupuesto)} inputMode="decimal" placeholder="0" required autoFocus />
            </Campo>
            <SelectTecnico tecnicos={tecnicos} tecnicoId={tecnicoId} requerido />
            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="Tipo de reparación">
                <Input name="tipo_reparacion" defaultValue={tipoReparacion ?? ''} maxLength={120} />
              </Campo>
              <Campo etiqueta="Garantía (días)">
                <Input name="garantia_dias" inputMode="numeric" defaultValue={garantiaDias} required />
              </Campo>
            </div>
            <Campo etiqueta="Qué se hizo" ayuda="Queda en el historial.">
              <Textarea name="diagnostico" rows={2} maxLength={1000} />
            </Campo>
            <Botones guardando={guardando} cancelar={() => setModo(null)} />
          </form>
        )}

        {modo === 'sin_reparacion' && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              const f = new FormData(e.currentTarget)
              const t = String(f.get('precio') ?? '').trim()
              const n = t ? parseNumero(t) : null
              if (t && (n === null || n < 0)) return setError('El importe no es válido.')
              hacer({
                accion: 'sin_reparacion',
                motivo: String(f.get('motivo')) as MotivoCierre,
                precio: n,
                diagnostico: String(f.get('diagnostico') ?? ''),
                tecnicoId: tecnicoDe(f),
              })
            }}
          >
            <Campo etiqueta="Por qué no se repara">
              <Select name="motivo" required defaultValue="" autoFocus>
                <option value="">Elegí…</option>
                {(Object.keys(MOTIVOS_CIERRE) as MotivoCierre[]).map((m) => (
                  <option key={m} value={m}>
                    {MOTIVOS_CIERRE[m]}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo etiqueta="Cargo por revisión (opcional)" ayuda="Vacío = se entrega sin costo.">
              <Input name="precio" inputMode="decimal" placeholder="0" />
            </Campo>
            <SelectTecnico tecnicos={tecnicos} tecnicoId={tecnicoId} />
            <Campo etiqueta="Detalle" ayuda="Queda en el historial.">
              <Textarea name="diagnostico" rows={2} maxLength={1000} />
            </Campo>
            <Botones guardando={guardando} cancelar={() => setModo(null)} />
          </form>
        )}

        {modo === 'nota' ? (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault()
              hacer({ accion: 'nota', nota: String(new FormData(e.currentTarget).get('nota') ?? '') })
            }}
          >
            <Textarea name="nota" rows={2} maxLength={500} placeholder="Ej.: el cliente aprobó el presupuesto por teléfono." autoFocus />
            <Botones guardando={guardando} cancelar={() => setModo(null)} texto="Agregar nota" />
          </form>
        ) : (
          !modo && (
            <button type="button" onClick={() => setModo('nota')} className="text-sm font-medium text-marca hover:underline">
              + Agregar una nota interna
            </button>
          )
        )}
        {error && <Aviso tipo="error">{error}</Aviso>}
      </div>
    </Tarjeta>
  )
}

function SelectTecnico({ tecnicos, tecnicoId, requerido = false }: { tecnicos: Opcion[]; tecnicoId: number | null; requerido?: boolean }) {
  if (!tecnicos.length) return null
  return (
    <Campo etiqueta={requerido ? 'Técnico que lo reparó' : 'Técnico (opcional)'}>
      <Select name="tecnico_id" defaultValue={tecnicoId ?? ''} required={requerido}>
        <option value="">{requerido ? 'Elegí…' : '—'}</option>
        {tecnicos.map((t) => (
          <option key={t.id} value={t.id}>
            {t.nombre}
          </option>
        ))}
      </Select>
    </Campo>
  )
}

function Botones({ guardando, cancelar, texto = 'Guardar' }: { guardando: boolean; cancelar: () => void; texto?: string }) {
  return (
    <div className="flex gap-2">
      <Boton type="submit" disabled={guardando}>
        {guardando ? 'Guardando…' : texto}
      </Boton>
      <Boton type="button" variante="secundario" onClick={cancelar}>
        Cancelar
      </Boton>
    </div>
  )
}
