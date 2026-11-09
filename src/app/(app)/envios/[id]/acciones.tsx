'use client'

import { useRef, useState, useTransition, type KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Aviso, Boton, Campo, Input, Tarjeta, TituloTarjeta, tablaCls as t } from '@/components/ui'
import { cancelar, recibir, resolver } from '../actions'

type Item = { id: number; codigo: string; nombre: string; enviada: number }

/** La sucursal cuenta lo que llegó: escaneando cada unidad o escribiendo la cantidad. No ve lo que se mandó hasta confirmar. */
export function Recepcion({ envioId, items }: { envioId: number; items: Item[] }) {
  const [contados, setContados] = useState<Record<number, string>>({})
  const [escaneo, setEscaneo] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)
  const [nota, setNota] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, iniciar] = useTransition()
  const ref = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const valor = (id: number) => {
    const v = contados[id]
    if (v === undefined || v.trim() === '') return null
    const n = Number(v)
    return Number.isInteger(n) && n >= 0 ? n : NaN
  }
  function escanear(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const c = escaneo.trim().toLowerCase()
    const it = items.find((i) => i.codigo.toLowerCase() === c)
    setEscaneo('')
    if (!it) return setAviso(`«${escaneo.trim()}» no viene en este envío.`)
    setAviso(null)
    setContados((x) => ({ ...x, [it.id]: String((valor(it.id) || 0) + 1) }))
  }
  const sinContar = items.filter((i) => valor(i.id) === null).length
  const invalidos = items.some((i) => Number.isNaN(valor(i.id)))

  return (
    <Tarjeta className="overflow-hidden">
      <TituloTarjeta>Contá lo que llegó</TituloTarjeta>
      <div className="space-y-2 p-5 pb-3">
        <p className="text-sm text-tinta-suave">Escaneá cada unidad (suma de a una) o escribí cuántas contaste. Si de algo no llegó nada, poné 0.</p>
        <input
          ref={ref}
          autoFocus
          value={escaneo}
          onChange={(e) => setEscaneo(e.target.value)}
          onKeyDown={escanear}
          aria-label="Escanear lo que llegó"
          placeholder="Escaneá cada producto"
          className="h-12 w-full rounded-xl border border-linea bg-fondo px-4 font-mono placeholder:font-sans placeholder:text-apagado focus:border-marca focus:bg-papel focus:outline-none focus:ring-4 focus:ring-marca/10"
        />
        {aviso && <p className="text-sm text-alerta">{aviso}</p>}
      </div>
      <div className="overflow-x-auto">
        <table className={t.tabla}>
          <thead>
            <tr>
              <th className={t.th}>Producto</th>
              <th className={`${t.th} w-32 text-right`}>Contaste</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td className={t.td}>
                  <span className="block font-medium">{i.nombre}</span>
                  <span className="font-mono text-xs text-apagado">{i.codigo}</span>
                </td>
                <td className={`${t.td} text-right`}>
                  <Input
                    value={contados[i.id] ?? ''}
                    onChange={(e) => setContados((x) => ({ ...x, [i.id]: e.target.value }))}
                    inputMode="numeric"
                    placeholder="—"
                    aria-label={`Contaste de ${i.nombre}`}
                    className={`num text-right ${Number.isNaN(valor(i.id)) ? 'border-error' : ''}`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-3 border-t border-linea p-5">
        <Campo etiqueta="Nota" ayuda="Opcional. Ej.: una funda vino rota.">
          <Input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} />
        </Campo>
        {error && <Aviso tipo="error">{error}</Aviso>}
        <Boton
          disabled={guardando || invalidos || sinContar > 0}
          onClick={() =>
            iniciar(async () => {
              setError(null)
              const r = await recibir(
                envioId,
                items.map((i) => ({ productoId: i.id, cantidad: valor(i.id) ?? 0 })),
                nota,
              )
              if (r.error) setError(r.error)
              else router.replace(`/envios/${envioId}?recibido=${r.diferencias ?? 0}`)
            })
          }
          className="h-12 w-full text-base sm:w-auto sm:px-8"
        >
          {sinContar ? `Falta contar ${sinContar} producto${sinContar === 1 ? '' : 's'}` : guardando ? 'Guardando…' : 'Confirmar recepción'}
        </Boton>
      </div>
    </Tarjeta>
  )
}

export function Resolver({ envioId }: { envioId: number }) {
  const [nota, setNota] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, iniciar] = useTransition()
  const hacer = (accion: 'perdida' | 'devolver') =>
    iniciar(async () => {
      setError(null)
      const r = await resolver(envioId, accion, nota)
      if (r.error) setError(r.error)
    })
  return (
    <Tarjeta className="w-full max-w-2xl space-y-3 p-5">
      <h2 className="font-semibold">¿Qué pasó con la diferencia?</h2>
      <Campo etiqueta="Detalle" ayuda="Opcional, queda registrado.">
        <Input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={200} />
      </Campo>
      {error && <Aviso tipo="error">{error}</Aviso>}
      <div className="flex flex-wrap gap-2">
        <Boton variante="secundario" disabled={ocupado} onClick={() => hacer('devolver')}>
          No se llegó a mandar: vuelve al depósito
        </Boton>
        <Boton variante="peligro" disabled={ocupado} onClick={() => confirm('¿Dar de baja lo que falta?') && hacer('perdida')}>
          Se perdió o rompió: dar de baja
        </Boton>
      </div>
      <p className="text-xs text-tinta-suave">Si sobró algo (llegó de más), se descuenta del depósito que lo mandó en los dos casos.</p>
    </Tarjeta>
  )
}

export function CancelarEnvio({ envioId }: { envioId: number }) {
  const [error, setError] = useState<string | null>(null)
  const [ocupado, iniciar] = useTransition()
  return (
    <div>
      {error && <Aviso tipo="error">{error}</Aviso>}
      <Boton
        variante="secundario"
        disabled={ocupado}
        onClick={() => {
          if (!confirm('¿Cancelar el envío? Todo vuelve al stock de donde salió.')) return
          iniciar(async () => setError((await cancelar(envioId)).error ?? null))
        }}
      >
        Cancelar envío
      </Boton>
    </div>
  )
}
