'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Aviso, Boton, Campo, Input, Select, Tarjeta, TituloTarjeta } from '@/components/ui'
import { guardarBorrador, leerBorrador } from '../../mercaderia/operacion'
import { cantidadValida, ListaProductos, type LineaCantidad } from '../lista-productos'
import { nuevoPedido } from '../actions'

export function FormPedido({ centralId, sucursales, usuarioId }: { centralId: number | null; sucursales: { id: number; nombre: string }[]; usuarioId: number }) {
  const clave = `borrador-pedido-${usuarioId}`
  const [lineas, setLineas] = useState<LineaCantidad[]>([])
  const [nota, setNota] = useState('')
  const [sucursalId, setSucursalId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, iniciar] = useTransition()
  const router = useRouter()
  const cargado = useRef(false)
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const b = leerBorrador<LineaCantidad[]>(clave)
    if (b?.length) setLineas(b)
    cargado.current = true
  }, [clave])
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (cargado.current) guardarBorrador(clave, lineas.length ? lineas : null)
  }, [clave, lineas])

  const enviar = () => {
    setError(null)
    if (sucursales.length && !sucursalId) return setError('Elegí para qué sucursal es.')
    if (lineas.some((l) => cantidadValida(l) === null)) return setError('Hay cantidades vacías o no válidas.')
    iniciar(async () => {
      const r = await nuevoPedido({ items: lineas.map((l) => ({ productoId: l.id, cantidad: cantidadValida(l)! })), nota, sucursalId: Number(sucursalId) || null })
      if (r.error) return setError(r.error)
      guardarBorrador(clave, null)
      router.push(`/pedidos?nuevo=${r.pedidoId}`)
    })
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
      <Tarjeta className="min-w-0 overflow-hidden">
        <TituloTarjeta>Productos que necesitás</TituloTarjeta>
        <ListaProductos lineas={lineas} setLineas={setLineas} depositoId={centralId} etiquetaStock="En depósito" />
      </Tarjeta>
      <Tarjeta className="h-fit space-y-4 p-5 lg:sticky lg:top-6">
        {sucursales.length > 0 && (
          <Campo etiqueta="Para la sucursal">
            <Select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)}>
              <option value="">Elegí…</option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </Select>
          </Campo>
        )}
        <Campo etiqueta="Nota para el depósito" ayuda="Opcional. Ej.: urgente para el sábado.">
          <Input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} />
        </Campo>
        {error && <Aviso tipo="error">{error}</Aviso>}
        <Boton onClick={enviar} disabled={guardando || !lineas.length} className="h-12 w-full text-base">
          {guardando ? 'Enviando…' : `Enviar pedido${lineas.length ? ` (${lineas.length} producto${lineas.length === 1 ? '' : 's'})` : ''}`}
        </Boton>
      </Tarjeta>
    </div>
  )
}
