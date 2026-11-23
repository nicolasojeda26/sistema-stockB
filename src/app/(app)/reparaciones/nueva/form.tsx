'use client'

import { useMemo, useState } from 'react'
import { FormAccion } from '@/components/form-accion'
import { Aviso, Boton, Campo, Input, Select, Textarea } from '@/components/ui'
import { formatoPesos } from '@/lib/formato'
import { numeroReparacion } from '@/lib/reparaciones-texto'
import { nuevaReparacion } from '../actions'

type Precio = { modelo: string; tipo: string; precio: number }
type Anterior = { id: number; cliente_nombre: string; cliente_telefono: string | null; cliente_dni: string | null; equipo: string; imei: string | null; tipo_reparacion: string | null }

const clave = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

export function FormReparacion({
  sucursales,
  sucursalPropia,
  modelos,
  precios,
  anterior,
}: {
  sucursales: { id: number; nombre: string }[]
  sucursalPropia: string | null
  modelos: string[]
  precios: Precio[]
  anterior: Anterior | null
}) {
  const [equipo, setEquipo] = useState(anterior?.equipo ?? '')
  const [tipo, setTipo] = useState(anterior?.tipo_reparacion ?? '')
  const [presupuesto, setPresupuesto] = useState(anterior ? '0' : '')
  // Si la persona escribe el presupuesto a mano, la lista ya no lo pisa.
  const [manual, setManual] = useState(!!anterior)

  const porClave = useMemo(() => new Map(precios.map((p) => [`${clave(p.modelo)}|${clave(p.tipo)}`, p.precio])), [precios])
  const tiposDelModelo = useMemo(() => {
    const m = clave(equipo)
    const delModelo = precios.filter((p) => clave(p.modelo) === m).map((p) => p.tipo)
    return delModelo.length ? delModelo : [...new Set(precios.map((p) => p.tipo))]
  }, [equipo, precios])
  const deLista = porClave.get(`${clave(equipo)}|${clave(tipo)}`)

  const actualizar = (e: string, t: string) => {
    const p = porClave.get(`${clave(e)}|${clave(t)}`)
    if (p != null && !manual) setPresupuesto(String(p).replace('.', ','))
  }

  return (
    <FormAccion accion={nuevaReparacion} className="space-y-5 p-5">
      {(estado, enviando) => {
        const e = estado.errores ?? {}
        return (
          <>
            {anterior && (
              <>
                <input type="hidden" name="garantia_de" value={anterior.id} />
                <Aviso tipo="info">
                  Reingreso por garantía de la reparación {numeroReparacion(anterior.id)}. Se cargaron los datos del cliente y del equipo.
                </Aviso>
              </>
            )}
            {sucursalPropia === null && (
              <Campo etiqueta="Sucursal donde se recibe">
                <Select name="sucursal_id" required defaultValue="">
                  <option value="">Elegí…</option>
                  {sucursales.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </Select>
              </Campo>
            )}
            <fieldset className="grid gap-4 sm:grid-cols-3">
              <legend className="mb-2 text-xs font-semibold tracking-wide text-apagado uppercase">Cliente</legend>
              <Campo etiqueta="Nombre y apellido">
                <Input name="cliente_nombre" required maxLength={120} autoComplete="off" defaultValue={anterior?.cliente_nombre} />
              </Campo>
              <Campo etiqueta="DNI" ayuda="Va en los comprobantes.">
                <Input name="cliente_dni" inputMode="numeric" maxLength={20} autoComplete="off" defaultValue={anterior?.cliente_dni ?? ''} />
              </Campo>
              <Campo etiqueta="Teléfono / WhatsApp" ayuda="Solo números, para avisarle.">
                <Input name="cliente_telefono" inputMode="tel" maxLength={40} placeholder="Ej.: 379 4123456" autoComplete="off" defaultValue={anterior?.cliente_telefono ?? ''} />
              </Campo>
            </fieldset>
            <fieldset className="grid gap-4 sm:grid-cols-2">
              <legend className="mb-2 text-xs font-semibold tracking-wide text-apagado uppercase">Equipo</legend>
              <Campo etiqueta="Marca y modelo">
                <Input
                  name="equipo"
                  list="modelos-equipo"
                  required
                  maxLength={120}
                  placeholder="Ej.: Samsung A15"
                  autoComplete="off"
                  value={equipo}
                  onChange={(ev) => {
                    setEquipo(ev.target.value)
                    actualizar(ev.target.value, tipo)
                  }}
                />
                <datalist id="modelos-equipo">
                  {modelos.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </Campo>
              <Campo etiqueta="IMEI o n.º de serie" ayuda="Opcional.">
                <Input name="imei" maxLength={40} inputMode="numeric" autoComplete="off" defaultValue={anterior?.imei ?? ''} />
              </Campo>
              <Campo etiqueta="Tipo de reparación" ayuda="Ej.: cambio de módulo, pin de carga. Si está en la lista de precios, completa el presupuesto.">
                <Input
                  name="tipo_reparacion"
                  list="tipos-reparacion"
                  maxLength={120}
                  autoComplete="off"
                  value={tipo}
                  onChange={(ev) => {
                    setTipo(ev.target.value)
                    actualizar(equipo, ev.target.value)
                  }}
                />
                <datalist id="tipos-reparacion">
                  {tiposDelModelo.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </Campo>
              <div className="sm:col-span-2">
                <Campo etiqueta="Qué le pasa">
                  <Textarea name="falla" required rows={3} maxLength={1000} placeholder="Ej.: pantalla rota, no da imagen. No carga." />
                </Campo>
              </div>
              <div className="sm:col-span-2">
                <Campo etiqueta="Cómo se recibe" ayuda="Rayas, golpes, con funda, con chip o memoria. Queda en el comprobante.">
                  <Textarea name="estado_equipo" rows={2} maxLength={1000} placeholder="Ej.: tapa rayada, sin chip, con funda." />
                </Campo>
              </div>
            </fieldset>
            <fieldset className="grid gap-4 sm:grid-cols-2">
              <legend className="mb-2 text-xs font-semibold tracking-wide text-apagado uppercase">Presupuesto</legend>
              <Campo
                etiqueta="Presupuesto estimado"
                ayuda={
                  deLista != null
                    ? manual && clave(presupuesto) !== clave(String(deLista).replace('.', ','))
                      ? `Precio de lista: ${formatoPesos(deLista)} (lo cambiaste a mano).`
                      : `Precio de lista: ${formatoPesos(deLista)}.`
                    : 'Opcional. Lo que se cobra se pone al terminar.'
                }
                error={e.presupuesto}
              >
                <Input
                  name="presupuesto"
                  inputMode="decimal"
                  placeholder="0"
                  value={presupuesto}
                  onChange={(ev) => {
                    setPresupuesto(ev.target.value)
                    setManual(ev.target.value.trim() !== '')
                  }}
                />
              </Campo>
              <Campo etiqueta="Para cuándo" ayuda="Opcional.">
                <Input name="prometido" type="date" />
              </Campo>
            </fieldset>
            <Boton type="submit" disabled={enviando} className="h-12 w-full text-base sm:w-auto sm:px-8">
              {enviando ? 'Guardando…' : 'Guardar e imprimir comprobante'}
            </Boton>
          </>
        )
      }}
    </FormAccion>
  )
}
