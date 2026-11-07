'use client'

import { useState, useTransition } from 'react'
import { Aviso, Boton, Campo, Input, Select } from '@/components/ui'
import { CONDICIONES_RECEPTOR, DOC_TIPOS, letraComprobante, type CondicionEmisor } from '@/lib/arca/comprobantes'
import { formatoPesos } from '@/lib/formato'
import { MEDIOS, type MedioPago } from '@/lib/venta-calculo'
import type { ItemVendido } from '@/lib/ventas'
import { buscarCliente, devolver, facturar, reintentarNotaCredito, retirar } from '../actions'

export function FacturarVenta({
  ventaId,
  condicionEmisor,
  total,
  identificarDesde,
}: {
  ventaId: number
  condicionEmisor: CondicionEmisor | null
  total: number
  identificarDesde: number
}) {
  const obligatorio = total >= identificarDesde
  const [conDatos, setConDatos] = useState(obligatorio)
  const [docTipo, setDocTipo] = useState('96')
  const [docNro, setDocNro] = useState('')
  const [nombre, setNombre] = useState('')
  const [condicion, setCondicion] = useState('5')
  const [domicilio, setDomicilio] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, iniciar] = useTransition()

  const letra = condicionEmisor ? letraComprobante(condicionEmisor, conDatos ? Number(condicion) : 5) : null

  function emitir() {
    setError(null)
    iniciar(async () => {
      const r = await facturar(
        ventaId,
        conDatos ? { docTipo: Number(docTipo), docNro, nombre, condicionIva: Number(condicion), domicilio: domicilio || null } : null,
      )
      if (r.error) return setError(r.error)
      if (r.id) window.open(`/comprobante/${r.id}?imprimir=1`, '_blank')
    })
  }

  async function completar() {
    if (!docNro.trim()) return
    const c = await buscarCliente(Number(docTipo), docNro)
    if (c) {
      setNombre(c.nombre)
      setCondicion(String(c.condicion_iva))
      setDomicilio(c.domicilio ?? '')
    }
  }

  return (
    <div className="space-y-3 border-t border-linea p-5 text-sm">
      {error && <Aviso tipo="error">{error}</Aviso>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setConDatos(false)}
          disabled={obligatorio}
          className={`h-9 flex-1 rounded-lg border text-sm ${!conDatos ? 'border-marca bg-marca-clara text-marca' : 'border-linea'} disabled:opacity-40`}
        >
          Consumidor final
        </button>
        <button
          type="button"
          onClick={() => setConDatos(true)}
          className={`h-9 flex-1 rounded-lg border text-sm ${conDatos ? 'border-marca bg-marca-clara text-marca' : 'border-linea'}`}
        >
          Con datos del cliente
        </button>
      </div>
      {obligatorio && <p className="text-xs text-alerta">Por el monto, hay que identificar al cliente.</p>}
      {conDatos && (
        <div className="grid gap-3">
          <div className="grid grid-cols-[110px_1fr] gap-2">
            <Select value={docTipo} onChange={(e) => setDocTipo(e.target.value)} aria-label="Tipo de documento">
              {Object.entries(DOC_TIPOS)
                .filter(([k]) => k !== '99')
                .map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
            </Select>
            <Input value={docNro} onChange={(e) => setDocNro(e.target.value)} onBlur={completar} inputMode="numeric" placeholder="Número" aria-label="Número de documento" />
          </div>
          <Campo etiqueta="Nombre o razón social">
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </Campo>
          <Campo etiqueta="Condición frente al IVA">
            <Select value={condicion} onChange={(e) => setCondicion(e.target.value)}>
              {Object.entries(CONDICIONES_RECEPTOR).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo etiqueta="Domicilio" ayuda="Opcional">
            <Input value={domicilio} onChange={(e) => setDomicilio(e.target.value)} />
          </Campo>
        </div>
      )}
      <Boton onClick={emitir} disabled={ocupado} className="w-full">
        {ocupado ? 'Pidiendo autorización…' : `Emitir Factura ${letra ?? ''}`.trim()}
      </Boton>
    </div>
  )
}

type MedioDevolucion = MedioPago | 'cuenta_corriente'
const NOMBRES: Record<MedioDevolucion, string> = { ...MEDIOS, cuenta_corriente: 'Saldo a favor de la clienta' }

export function DevolverVenta({ ventaId, items, facturada, conCliente = false }: { ventaId: number; items: ItemVendido[]; facturada: boolean; conCliente?: boolean }) {
  const [cantidades, setCantidades] = useState<Record<number, number>>({})
  const [medio, setMedio] = useState<MedioDevolucion>('efectivo')
  const [motivo, setMotivo] = useState('')
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error' | 'alerta'; texto: string } | null>(null)
  const [ocupado, iniciar] = useTransition()
  const total = items.reduce((a, i) => a + Math.round(i.unitario * 100) * (cantidades[i.id] ?? 0), 0) / 100

  function confirmar() {
    if (!confirm(`¿Devolver ${formatoPesos(total)} como ${NOMBRES[medio].toLowerCase()}?`)) return
    iniciar(async () => {
      const r = await devolver({ ventaId, items: Object.entries(cantidades).map(([id, c]) => ({ ventaItemId: Number(id), cantidad: c })), medio, motivo })
      if (r.error) return setMsg({ tipo: 'error', texto: r.error })
      setMsg(r.avisoFactura ? { tipo: 'alerta', texto: r.avisoFactura } : { tipo: 'ok', texto: r.ok! })
      setCantidades({})
      setMotivo('')
    })
  }

  return (
    <div className="space-y-3 p-5 text-sm">
      {msg && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}
      <ul className="space-y-2">
        {items.map((i) => {
          const max = i.cantidad - i.devuelto
          return (
            <li key={i.id} className="flex items-center justify-between gap-2">
              <span className="min-w-0">
                <span className="block truncate">{i.nombre}</span>
                <span className="text-xs text-apagado">
                  {formatoPesos(i.unitario)} c/u · puede devolver {max}
                </span>
              </span>
              <Select
                value={cantidades[i.id] ?? 0}
                onChange={(e) => setCantidades((c) => ({ ...c, [i.id]: Number(e.target.value) }))}
                aria-label={`Unidades a devolver de ${i.nombre}`}
                className="h-9 w-20"
              >
                {Array.from({ length: max + 1 }, (_, n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </li>
          )
        })}
      </ul>
      <div className="grid grid-cols-2 gap-2">
        <Campo etiqueta="Se devuelve en">
          <Select value={medio} onChange={(e) => setMedio(e.target.value as MedioDevolucion)}>
            {(Object.keys(NOMBRES) as MedioDevolucion[])
              .filter((m) => m !== 'cuenta_corriente' || conCliente)
              .map((m) => (
                <option key={m} value={m}>
                  {NOMBRES[m]}
                </option>
              ))}
          </Select>
        </Campo>
        <Campo etiqueta="Motivo">
          <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: no le quedó" />
        </Campo>
      </div>
      <p className="text-xs text-apagado">
        {medio === 'cuenta_corriente'
          ? 'No sale plata: queda a favor de la clienta para su próxima compra.'
          : 'La plata sale de tu caja.'}{' '}
        El producto vuelve al stock de tu local.{facturada ? ' Se emite la nota de crédito.' : ''}
      </p>
      <Boton onClick={confirmar} disabled={ocupado || total <= 0 || !motivo.trim()} variante="secundario" className="w-full">
        {total > 0 ? `Devolver ${formatoPesos(total)}` : 'Elegí qué se devuelve'}
      </Boton>
    </div>
  )
}

export function ReintentarNC({ devolucionId }: { devolucionId: number }) {
  const [error, setError] = useState<string | null>(null)
  const [ocupado, iniciar] = useTransition()
  return (
    <div className="mt-2">
      {error && <p className="mb-1 text-xs text-error">{error}</p>}
      <button
        disabled={ocupado}
        onClick={() =>
          iniciar(async () => {
            const r = await reintentarNotaCredito(devolucionId)
            setError(r.error ?? null)
          })
        }
        className="text-xs font-medium text-marca hover:underline"
      >
        {ocupado ? 'Emitiendo…' : 'Falta la nota de crédito · Emitir ahora'}
      </button>
    </div>
  )
}

export function MarcarRetirada({ ventaId }: { ventaId: number }) {
  const [error, setError] = useState<string | null>(null)
  const [ocupado, iniciar] = useTransition()
  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-error">{error}</span>}
      <Boton
        variante="secundario"
        disabled={ocupado}
        onClick={() =>
          iniciar(async () => {
            const r = await retirar(ventaId)
            setError(r.error ?? null)
          })
        }
      >
        Marcar como retirada
      </Boton>
    </span>
  )
}
