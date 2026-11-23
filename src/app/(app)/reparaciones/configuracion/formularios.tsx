'use client'

import { useState, useTransition } from 'react'
import { FormAccion } from '@/components/form-accion'
import { Boton, Campo, Input, Select, Textarea } from '@/components/ui'
import { formatoPesos } from '@/lib/formato'
import { borrarPrecio, cargarPrecios, guardarComprobantes, guardarEtapa, guardarPrecio, guardarTecnico, moverEtapa } from './actions'

export type EtapaFila = { id: number; nombre: string; fase: 'ingresado' | 'en_reparacion' | 'listo'; orden: number; activa: boolean; sistema: boolean; usos: number }
export type TecnicoFila = { id: number; nombre: string; activo: boolean; reparados: number }
export type PrecioFila = { id: number; modelo: string; tipo: string; precio: number; activo: boolean }

const FASES = { ingresado: 'Recién ingresado (sin empezar)', en_reparacion: 'En reparación o esperando', listo: 'Listo para retirar' } as const
const botonChico = 'rounded-md px-2.5 py-2 text-sm font-medium sm:py-1 sm:text-xs'

// ── Estados ─────────────────────────────────────────────────────────────

export function ListaEtapas({ etapas }: { etapas: EtapaFila[] }) {
  const [editando, setEditando] = useState<number | null>(null)
  const [moviendo, iniciar] = useTransition()
  return (
    <ol className="divide-y divide-linea">
      {etapas.map((e, i) => (
        <li key={e.id} className="px-5 py-3">
          {editando === e.id ? (
            <FormAccion accion={guardarEtapa} alGuardar={() => setEditando(null)} className="grid gap-3 sm:grid-cols-[1fr_260px_auto] sm:items-end">
              {(_, enviando) => (
                <>
                  <input type="hidden" name="id" value={e.id} />
                  <Campo etiqueta="Nombre">
                    <Input name="nombre" defaultValue={e.nombre} maxLength={80} required autoFocus />
                  </Campo>
                  {e.sistema ? (
                    <p className="text-xs text-tinta-suave sm:pb-3">Estado del sistema: solo se cambia el nombre.</p>
                  ) : (
                    <Campo etiqueta="Parte del proceso">
                      <Select name="fase" defaultValue={e.fase}>
                        <option value="ingresado">{FASES.ingresado}</option>
                        <option value="en_reparacion">{FASES.en_reparacion}</option>
                      </Select>
                    </Campo>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    {!e.sistema && (
                      <label className="flex items-center gap-1.5 text-sm">
                        <input type="checkbox" name="activa" defaultChecked={e.activa} className="h-4 w-4 accent-marca" />
                        Activo
                      </label>
                    )}
                    <Boton type="submit" disabled={enviando}>
                      Guardar
                    </Boton>
                    <Boton type="button" variante="secundario" onClick={() => setEditando(null)}>
                      Cancelar
                    </Boton>
                  </div>
                </>
              )}
            </FormAccion>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className={`font-medium ${e.activa ? '' : 'text-apagado line-through'}`}>
                  {i + 1}. {e.nombre}
                </p>
                <p className="text-xs text-tinta-suave">
                  {FASES[e.fase]}
                  {e.sistema ? ' · del sistema' : ''}
                  {e.usos ? ` · ${e.usos} equipo${e.usos === 1 ? '' : 's'} ahora` : ''}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" disabled={moviendo || i === 0} onClick={() => iniciar(() => moverEtapa(e.id, -1))} aria-label={`Subir ${e.nombre}`} className={`${botonChico} text-tinta-suave hover:bg-fondo disabled:opacity-30`}>
                  ↑
                </button>
                <button type="button" disabled={moviendo || i === etapas.length - 1} onClick={() => iniciar(() => moverEtapa(e.id, 1))} aria-label={`Bajar ${e.nombre}`} className={`${botonChico} text-tinta-suave hover:bg-fondo disabled:opacity-30`}>
                  ↓
                </button>
                <button type="button" onClick={() => setEditando(e.id)} className={`${botonChico} text-marca hover:bg-marca-clara`}>
                  Editar
                </button>
              </div>
            </div>
          )}
        </li>
      ))}
    </ol>
  )
}

export function NuevaEtapa() {
  return (
    <FormAccion accion={guardarEtapa} limpiarAlGuardar className="grid gap-3 p-5 sm:grid-cols-[1fr_260px_auto] sm:items-end">
      {(_, enviando) => (
        <>
          <Campo etiqueta="Estado nuevo">
            <Input name="nombre" placeholder="Ej.: Esperando repuesto del proveedor" maxLength={80} required />
          </Campo>
          <Campo etiqueta="Parte del proceso">
            <Select name="fase" defaultValue="en_reparacion">
              <option value="ingresado">{FASES.ingresado}</option>
              <option value="en_reparacion">{FASES.en_reparacion}</option>
            </Select>
          </Campo>
          <Boton type="submit" disabled={enviando}>
            Agregar
          </Boton>
        </>
      )}
    </FormAccion>
  )
}

// ── Técnicos ────────────────────────────────────────────────────────────

export function ListaTecnicos({ tecnicos }: { tecnicos: TecnicoFila[] }) {
  const [editando, setEditando] = useState<number | null>(null)
  if (!tecnicos.length) return <p className="px-5 py-6 text-center text-sm text-apagado">Todavía no hay técnicos cargados.</p>
  return (
    <ul className="divide-y divide-linea">
      {tecnicos.map((t) => (
        <li key={t.id} className="px-5 py-3">
          {editando === t.id ? (
            <FormAccion accion={guardarTecnico} alGuardar={() => setEditando(null)} className="flex flex-wrap items-end gap-2">
              {(_, enviando) => (
                <>
                  <input type="hidden" name="id" value={t.id} />
                  <Campo etiqueta="Nombre" className="min-w-52 flex-1">
                    <Input name="nombre" defaultValue={t.nombre} maxLength={80} required autoFocus />
                  </Campo>
                  <label className="flex h-10 items-center gap-1.5 text-sm">
                    <input type="checkbox" name="activo" defaultChecked={t.activo} className="h-4 w-4 accent-marca" />
                    Activo
                  </label>
                  <Boton type="submit" disabled={enviando}>
                    Guardar
                  </Boton>
                  <Boton type="button" variante="secundario" onClick={() => setEditando(null)}>
                    Cancelar
                  </Boton>
                </>
              )}
            </FormAccion>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <p className={t.activo ? 'font-medium' : 'text-apagado line-through'}>
                {t.nombre}
                <span className="ml-2 text-xs font-normal text-tinta-suave">{t.reparados} reparado{t.reparados === 1 ? '' : 's'}</span>
              </p>
              <button type="button" onClick={() => setEditando(t.id)} className={`${botonChico} text-marca hover:bg-marca-clara`}>
                Editar
              </button>
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

export function NuevoTecnico() {
  return (
    <FormAccion accion={guardarTecnico} limpiarAlGuardar className="flex flex-wrap items-end gap-2 p-5">
      {(_, enviando) => (
        <>
          <Campo etiqueta="Técnico nuevo" className="min-w-52 flex-1">
            <Input name="nombre" placeholder="Nombre y apellido" maxLength={80} required />
          </Campo>
          <Boton type="submit" disabled={enviando}>
            Agregar
          </Boton>
        </>
      )}
    </FormAccion>
  )
}

// ── Precios ─────────────────────────────────────────────────────────────

export function TablaPrecios({ precios }: { precios: PrecioFila[] }) {
  const [editando, setEditando] = useState<number | null>(null)
  const [, iniciar] = useTransition()
  if (!precios.length) return <p className="px-5 py-6 text-center text-sm text-apagado">No hay precios con esa búsqueda.</p>
  return (
    <ul className="divide-y divide-linea">
      {precios.map((p) => (
        <li key={p.id} className="px-5 py-2.5">
          {editando === p.id ? (
            <FormAccion accion={guardarPrecio} alGuardar={() => setEditando(null)} className="grid gap-2 sm:grid-cols-[1fr_1fr_140px_auto] sm:items-end">
              {(_, enviando) => (
                <>
                  <input type="hidden" name="id" value={p.id} />
                  <Campo etiqueta="Modelo">
                    <Input name="modelo" defaultValue={p.modelo} maxLength={120} required />
                  </Campo>
                  <Campo etiqueta="Tipo de reparación">
                    <Input name="tipo" defaultValue={p.tipo} maxLength={120} required />
                  </Campo>
                  <Campo etiqueta="Precio">
                    <Input name="precio" defaultValue={String(p.precio).replace('.', ',')} inputMode="decimal" required />
                  </Campo>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-1.5 text-sm">
                      <input type="checkbox" name="activo" defaultChecked={p.activo} className="h-4 w-4 accent-marca" />
                      Activo
                    </label>
                    <Boton type="submit" disabled={enviando}>
                      Guardar
                    </Boton>
                    <Boton type="button" variante="secundario" onClick={() => setEditando(null)}>
                      Cancelar
                    </Boton>
                  </div>
                </>
              )}
            </FormAccion>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className={`min-w-0 ${p.activo ? '' : 'text-apagado line-through'}`}>
                <span className="font-medium">{p.modelo}</span> · {p.tipo}
              </p>
              <div className="flex shrink-0 items-center gap-1">
                <span className="num mr-2 font-semibold">{formatoPesos(p.precio)}</span>
                <button type="button" onClick={() => setEditando(p.id)} className={`${botonChico} text-marca hover:bg-marca-clara`}>
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => confirm(`¿Borrar el precio de ${p.modelo} · ${p.tipo}?`) && iniciar(() => borrarPrecio(p.id))}
                  className={`${botonChico} text-tinta-suave hover:bg-error-claro hover:text-error`}
                >
                  Borrar
                </button>
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

export function NuevoPrecio({ modelos, tipos }: { modelos: string[]; tipos: string[] }) {
  return (
    <FormAccion accion={guardarPrecio} limpiarAlGuardar className="grid gap-2 p-5 sm:grid-cols-[1fr_1fr_140px_auto] sm:items-end">
      {(_, enviando) => (
        <>
          <Campo etiqueta="Modelo">
            <Input name="modelo" list="cfg-modelos" placeholder="Ej.: Samsung A15" maxLength={120} required />
            <datalist id="cfg-modelos">
              {modelos.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </Campo>
          <Campo etiqueta="Tipo de reparación">
            <Input name="tipo" list="cfg-tipos" placeholder="Ej.: Cambio de módulo" maxLength={120} required />
            <datalist id="cfg-tipos">
              {tipos.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </Campo>
          <Campo etiqueta="Precio">
            <Input name="precio" inputMode="decimal" placeholder="0" required />
          </Campo>
          <Boton type="submit" disabled={enviando}>
            Agregar
          </Boton>
        </>
      )}
    </FormAccion>
  )
}

export function PegarPrecios() {
  const [abierto, setAbierto] = useState(false)
  if (!abierto)
    return (
      <button type="button" onClick={() => setAbierto(true)} className="px-5 pb-5 text-sm font-medium text-marca hover:underline">
        Cargar muchos de una vez (pegar de Excel)
      </button>
    )
  return (
    <FormAccion accion={cargarPrecios} limpiarAlGuardar className="space-y-3 px-5 pb-5">
      {(_, enviando) => (
        <>
          <Campo etiqueta="Pegá las filas: modelo, tipo de reparación y precio" ayuda="Copiá las tres columnas de Excel y pegalas, o escribí «Samsung A15; Cambio de módulo; 45000» una por renglón. Si ya existe, se actualiza el precio.">
            <Textarea name="lista" rows={8} placeholder={'Samsung A15\tCambio de módulo\t45000\nMotorola G15\tPin de carga\t18000'} className="font-mono text-sm" />
          </Campo>
          <div className="flex gap-2">
            <Boton type="submit" disabled={enviando}>
              {enviando ? 'Cargando…' : 'Cargar'}
            </Boton>
            <Boton type="button" variante="secundario" onClick={() => setAbierto(false)}>
              Cerrar
            </Boton>
          </div>
        </>
      )}
    </FormAccion>
  )
}

// ── Comprobantes ────────────────────────────────────────────────────────

export function FormComprobantes({ ajustes }: { ajustes: { garantia_dias: string; clausulas_ingreso: string; clausulas_garantia: string; clausulas_entrega: string } }) {
  return (
    <FormAccion accion={guardarComprobantes} className="space-y-5 p-5">
      {(_, enviando) => (
        <>
          <Campo etiqueta="Días de garantía (por defecto)" ayuda="Se puede cambiar en cada reparación al marcarla lista." className="max-w-xs">
            <Input name="garantia_dias" inputMode="numeric" defaultValue={ajustes.garantia_dias} required />
          </Campo>
          <Campo etiqueta="Cláusulas del comprobante de ingreso (hoja 2, la firma el cliente)" ayuda="Una cláusula por renglón.">
            <Textarea name="clausulas_ingreso" defaultValue={ajustes.clausulas_ingreso} rows={8} />
          </Campo>
          <Campo etiqueta="Cláusulas del comprobante de garantía (cuando se entrega reparado)">
            <Textarea name="clausulas_garantia" defaultValue={ajustes.clausulas_garantia} rows={8} />
          </Campo>
          <Campo etiqueta="Cláusulas del comprobante de entrega sin costo (sin solución o devolución)">
            <Textarea name="clausulas_entrega" defaultValue={ajustes.clausulas_entrega} rows={6} />
          </Campo>
          <Boton type="submit" disabled={enviando}>
            Guardar
          </Boton>
        </>
      )}
    </FormAccion>
  )
}
