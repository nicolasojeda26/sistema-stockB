'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Aviso, Boton } from '@/components/ui'
import { formatoPesos } from '@/lib/formato'
import { parseNumero } from '@/lib/numeros'
import { MEDIOS, aCentavos, aPesos, montosSugeridos, type MedioPago } from '@/lib/venta-calculo'
import { cobrar, facturarConsumidorFinal } from './actions'
import type { LineaCarrito } from './punto-de-venta'

type Pago = { medio: MedioPago; monto: string; cuotas: number }

const aTexto = (centavos: number) => (centavos / 100).toFixed(2).replace('.', ',').replace(',00', '')
const montoDe = (p: Pago) => aCentavos(parseNumero(p.monto) ?? 0)

export function Cobro({
  lineas: lineasIniciales,
  descuentoGlobalPct,
  totalCentavos,
  sucursal,
  alCerrar,
  alVender,
}: {
  lineas: LineaCarrito[]
  descuentoGlobalPct: number
  totalCentavos: number
  sucursal: string
  alCerrar: () => void
  alVender: () => void
}) {
  // Foto de la venta: el carrito se vacía apenas se registra.
  const [lineas] = useState(lineasIniciales)
  const [total] = useState(totalCentavos)
  const [pagos, setPagos] = useState<Pago[]>([{ medio: 'efectivo', monto: aTexto(totalCentavos), cuotas: 1 }])
  const [recibido, setRecibido] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<{
    ventaId: number
    vuelto: number
    comprobante?: { id: number; tipo: string; simulado: boolean }
    errorFactura?: string
    puedeFacturar?: boolean
  } | null>(null)
  const [facturando, iniciarFactura] = useTransition()
  const [telefono, setTelefono] = useState('')
  const [guardando, iniciar] = useTransition()
  const confirmarRef = useRef<HTMLButtonElement>(null)
  const nuevaRef = useRef<HTMLButtonElement>(null)

  const pagado = pagos.reduce((a, p) => a + montoDe(p), 0)
  const falta = total - pagado
  const efectivo = pagos.filter((p) => p.medio === 'efectivo').reduce((a, p) => a + montoDe(p), 0)
  const recibidoC = recibido.trim() ? aCentavos(parseNumero(recibido) ?? 0) : efectivo
  const vuelto = efectivo > 0 ? recibidoC - efectivo : 0
  const valido = falta === 0 && pagos.every((p) => montoDe(p) > 0) && (efectivo === 0 || recibidoC >= efectivo)

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !guardando) alCerrar()
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [alCerrar, guardando])
  useEffect(() => {
    if (hecho) nuevaRef.current?.focus()
  }, [hecho])

  function elegirMedio(medio: MedioPago) {
    setError(null)
    setPagos((ps) => {
      // Con un solo pago, tocar otro medio lo cambia; si ya hay varios, agrega uno por lo que falta.
      if (ps.length === 1) return [{ ...ps[0], medio, monto: aTexto(total) }]
      const resto = total - ps.reduce((a, p) => a + montoDe(p), 0)
      return [...ps, { medio, monto: resto > 0 ? aTexto(resto) : '', cuotas: 1 }]
    })
    if (medio !== 'efectivo') setRecibido('')
  }

  function dividir() {
    setPagos((ps) => [...ps, { medio: ps.some((p) => p.medio === 'efectivo') ? 'debito' : 'efectivo', monto: falta > 0 ? aTexto(falta) : '', cuotas: 1 }])
  }

  function confirmar() {
    if (!valido || guardando) return
    setError(null)
    iniciar(async () => {
      const r = await cobrar({
        items: lineas.map((l) => ({ productoId: l.id, cantidad: l.cantidad, descuentoPct: l.descuentoPct })),
        descuentoGlobalPct,
        pagos: pagos.map((p) => ({ medio: p.medio, monto: aPesos(montoDe(p)), cuotas: p.medio === 'credito' ? p.cuotas : null })),
        efectivoRecibido: efectivo > 0 ? aPesos(recibidoC) : null,
        totalEsperado: aPesos(total),
      })
      if (r.error || !r.ventaId) return setError(r.error ?? 'No se pudo registrar.')
      setHecho({ ventaId: r.ventaId, vuelto: r.vuelto ?? 0, comprobante: r.comprobante, errorFactura: r.errorFactura, puedeFacturar: r.puedeFacturar })
      alVender()
    })
  }

  const textoWhatsApp = () => {
    const filas = lineas.map((l) => `• ${l.cantidad} × ${l.nombre}`).join('\n')
    return `¡Gracias por tu compra en ${sucursal}!\n\n${filas}\n\nTotal: ${formatoPesos(aPesos(total))}\nComprobante N.º ${hecho?.ventaId}`
  }
  const linkWhatsApp = () => {
    const tel = telefono.replace(/\D/g, '')
    const destino = tel ? (tel.startsWith('54') ? tel : `549${tel.replace(/^0/, '')}`) : ''
    return `https://wa.me/${destino}?text=${encodeURIComponent(textoWhatsApp())}`
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-tinta/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Cobrar">
      <div className="max-h-[100dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-papel shadow-xl sm:rounded-2xl">
        {hecho ? (
          <div className="p-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-ok text-xl text-white">✓</div>
            <h2 className="mt-3 text-lg font-semibold">Venta N.º {hecho.ventaId} registrada</h2>
            <p className="text-sm text-tinta-suave">{formatoPesos(aPesos(total))}</p>
            {hecho.vuelto > 0 && (
              <div className="mt-5 rounded-xl bg-alerta-claro p-4">
                <p className="text-sm text-alerta">Vuelto</p>
                <p className="num text-4xl font-semibold text-tinta" data-testid="vuelto">
                  {formatoPesos(hecho.vuelto)}
                </p>
              </div>
            )}
            {hecho.comprobante && (
              <p className="mt-4 text-sm text-ok">
                {hecho.comprobante.tipo} emitida{hecho.comprobante.simulado ? ' (simulación)' : ''}
              </p>
            )}
            {hecho.errorFactura && (
              <div className="mt-4 text-left">
                <Aviso tipo="alerta">La venta quedó registrada, pero no se pudo facturar: {hecho.errorFactura}</Aviso>
              </div>
            )}
            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              {hecho.comprobante ? (
                <a
                  href={`/comprobante/${hecho.comprobante.id}?imprimir=1`}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex h-11 items-center justify-center rounded-lg border border-linea text-sm font-medium hover:bg-fondo"
                >
                  Imprimir factura
                </a>
              ) : (
                <div className="flex gap-2">
                  <a
                    href={`/ticket/${hecho.ventaId}?imprimir=1`}
                    target="_blank"
                    rel="noopener"
                    className="inline-flex h-11 flex-1 items-center justify-center rounded-lg border border-linea text-sm font-medium hover:bg-fondo"
                  >
                    Ticket
                  </a>
                  {hecho.puedeFacturar && (
                    <button
                      disabled={facturando}
                      onClick={() =>
                        iniciarFactura(async () => {
                          const f = await facturarConsumidorFinal(hecho.ventaId)
                          if (f.comprobante) {
                            setHecho((h) => (h ? { ...h, comprobante: f.comprobante, errorFactura: undefined } : h))
                            window.open(`/comprobante/${f.comprobante.id}?imprimir=1`, '_blank')
                          } else setHecho((h) => (h ? { ...h, errorFactura: f.error } : h))
                        })
                      }
                      className="inline-flex h-11 flex-1 items-center justify-center rounded-lg border border-marca/40 text-sm font-medium text-marca hover:bg-marca-clara"
                    >
                      {facturando ? 'Facturando…' : 'Facturar'}
                    </button>
                  )}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  inputMode="tel"
                  placeholder="Celular"
                  aria-label="Celular del cliente"
                  className="h-11 min-w-0 flex-1 rounded-lg border border-linea px-3 text-sm"
                />
                <a
                  href={linkWhatsApp()}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex h-11 shrink-0 items-center justify-center rounded-lg bg-[#1f9d55] px-3 text-sm font-medium text-white hover:bg-[#188046]"
                >
                  WhatsApp
                </a>
              </div>
            </div>
            <Boton ref={nuevaRef} onClick={alCerrar} className="mt-4 h-12 w-full text-base">
              Nueva venta
            </Boton>
          </div>
        ) : (
          <div className="p-5 sm:p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-tinta-suave">Total a cobrar</p>
                <p className="num text-4xl font-semibold tracking-tight">{formatoPesos(aPesos(total))}</p>
              </div>
              <button onClick={alCerrar} aria-label="Volver a la venta" className="rounded-lg px-2 py-1 text-tinta-suave hover:bg-fondo">
                ✕
              </button>
            </div>

            <p className="mt-5 mb-2 text-sm font-medium">¿Cómo paga?</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(Object.keys(MEDIOS) as MedioPago[]).map((m) => {
                const activo = pagos.length === 1 && pagos[0].medio === m
                return (
                  <button
                    key={m}
                    onClick={() => elegirMedio(m)}
                    aria-pressed={activo}
                    className={`h-12 rounded-xl border-2 text-sm font-medium transition-colors ${activo ? 'border-marca bg-marca-clara text-marca' : 'border-linea hover:border-marca/40'}`}
                  >
                    {MEDIOS[m]}
                  </button>
                )
              })}
            </div>

            {pagos.length > 1 && (
              <ul className="mt-4 space-y-2">
                {pagos.map((p, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <select
                      value={p.medio}
                      onChange={(e) => setPagos((ps) => ps.map((x, j) => (j === i ? { ...x, medio: e.target.value as MedioPago } : x)))}
                      aria-label={`Medio del pago ${i + 1}`}
                      className="h-10 w-36 rounded-lg border border-linea px-2 text-sm"
                    >
                      {(Object.keys(MEDIOS) as MedioPago[]).map((m) => (
                        <option key={m} value={m}>
                          {MEDIOS[m]}
                        </option>
                      ))}
                    </select>
                    <input
                      value={p.monto}
                      onChange={(e) => setPagos((ps) => ps.map((x, j) => (j === i ? { ...x, monto: e.target.value } : x)))}
                      inputMode="decimal"
                      aria-label={`Monto del pago ${i + 1}`}
                      className="num h-10 min-w-0 flex-1 rounded-lg border border-linea px-3 text-right"
                    />
                    <button
                      onClick={() => setPagos((ps) => ps.filter((_, j) => j !== i))}
                      aria-label={`Quitar pago ${i + 1}`}
                      className="h-10 w-10 rounded-lg text-apagado hover:bg-error-claro hover:text-error"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {pagos.some((p) => p.medio === 'credito') && (
              <label className="mt-3 flex items-center gap-2 text-sm">
                Cuotas
                <select
                  value={pagos.find((p) => p.medio === 'credito')!.cuotas}
                  onChange={(e) => setPagos((ps) => ps.map((x) => (x.medio === 'credito' ? { ...x, cuotas: Number(e.target.value) } : x)))}
                  className="h-9 rounded-lg border border-linea px-2"
                >
                  {[1, 2, 3, 6, 9, 12].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="mt-3 flex items-center justify-between text-sm">
              <button onClick={dividir} className="font-medium text-marca hover:underline">
                + Pagar con dos medios
              </button>
              {pagos.length > 1 && (
                <span className={`num font-medium ${falta === 0 ? 'text-ok' : 'text-error'}`}>
                  {falta === 0 ? 'Completo' : falta > 0 ? `Falta ${formatoPesos(aPesos(falta))}` : `Sobra ${formatoPesos(aPesos(-falta))}`}
                </span>
              )}
            </div>

            {efectivo > 0 && (
              <div className="mt-5 rounded-xl bg-fondo p-4">
                <label htmlFor="recibido" className="text-sm font-medium">
                  ¿Con cuánto paga en efectivo?
                </label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {montosSugeridos(efectivo).map((m) => (
                    <button
                      key={m}
                      onClick={() => setRecibido(String(m))}
                      className={`num h-9 rounded-lg border px-3 text-sm ${recibidoC === m * 100 ? 'border-marca bg-marca-clara text-marca' : 'border-linea bg-papel hover:border-marca/40'}`}
                    >
                      {formatoPesos(m).replace(',00', '')}
                    </button>
                  ))}
                </div>
                <input
                  id="recibido"
                  value={recibido}
                  onChange={(e) => setRecibido(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && confirmar()}
                  inputMode="decimal"
                  placeholder={`Justo: ${aTexto(efectivo)}`}
                  className="num mt-2 h-11 w-full rounded-lg border border-linea bg-papel px-3 text-right text-lg"
                />
                <div className="mt-3 flex items-baseline justify-between">
                  <span className="text-sm text-tinta-suave">Vuelto</span>
                  <span className={`num text-2xl font-semibold ${vuelto < 0 ? 'text-error' : ''}`}>
                    {vuelto < 0 ? `Faltan ${formatoPesos(aPesos(-vuelto))}` : formatoPesos(aPesos(vuelto))}
                  </span>
                </div>
              </div>
            )}

            {error && (
              <div className="mt-4">
                <Aviso tipo="error">{error}</Aviso>
              </div>
            )}
            <Boton ref={confirmarRef} onClick={confirmar} disabled={!valido || guardando} className="mt-5 h-14 w-full text-lg">
              {guardando ? 'Registrando…' : 'Confirmar cobro'}
            </Boton>
          </div>
        )}
      </div>
    </div>
  )
}
