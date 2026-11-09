'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Aviso, Boton, Campo, Input, Select, Tarjeta, TituloTarjeta } from '@/components/ui'
import { stockEn } from '../../mercaderia/actions'
import { cantidadValida, ListaProductos, type LineaCantidad } from '../../pedidos/lista-productos'
import { nuevoEnvio } from '../actions'

type Opcion = { id: number; nombre: string }

export function FormEnvio({
  origenes,
  destinos,
  origenInicial,
  pedido,
}: {
  origenes: Opcion[]
  destinos: Opcion[]
  origenInicial: number | null
  pedido: { id: number; deposito_id: number; sucursal: string; items: { id: number; codigo: string; nombre: string; falta: number }[] } | null
  usuarioId: number
}) {
  const [origenId, setOrigenId] = useState(String(origenInicial ?? ''))
  const [destinoId, setDestinoId] = useState(pedido ? String(pedido.deposito_id) : '')
  const [lineas, setLineas] = useState<LineaCantidad[]>(
    pedido?.items.map((i) => ({ id: i.id, codigo: i.codigo, nombre: i.nombre, stock: 0, cantidad: String(i.falta), pedida: i.falta })) ?? [],
  )
  const [nota, setNota] = useState('')
  const [cerrar, setCerrar] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guardando, iniciar] = useTransition()
  const router = useRouter()
  const ids = useRef('')

  // Stock en el origen de cada producto de la lista (al cambiar de origen o al venir de un pedido).
  useEffect(() => {
    const clave = `${origenId}:${lineas.map((l) => l.id).join(',')}`
    if (!origenId || !lineas.length || clave === ids.current) return
    ids.current = clave
    void stockEn(
      lineas.map((l) => l.id),
      Number(origenId),
    ).then((s) => setLineas((ls) => ls.map((l) => ({ ...l, stock: s[l.id] ?? l.stock }))))
  }, [origenId, lineas])

  const incompleto = pedido && lineas.some((l) => l.pedida !== undefined && (cantidadValida(l) ?? 0) < l.pedida)

  const enviar = () => {
    setError(null)
    if (!origenId || !destinoId) return setError('Elegí de dónde sale y a dónde va.')
    if (origenId === destinoId) return setError('El origen y el destino son el mismo.')
    if (lineas.some((l) => cantidadValida(l) === null && l.cantidad.trim() !== '0')) return setError('Hay cantidades vacías o no válidas (poné 0 si no mandás ese producto).')
    iniciar(async () => {
      const r = await nuevoEnvio({
        origenId: Number(origenId),
        destinoId: Number(destinoId),
        items: lineas.map((l) => ({ productoId: l.id, cantidad: cantidadValida(l) ?? 0 })),
        nota,
        pedidoId: pedido?.id ?? null,
        cerrarPedido: cerrar,
      })
      if (r.error) return setError(r.error)
      router.push(`/envios/${r.envioId}?enviado=1`)
    })
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
      <Tarjeta className="min-w-0 overflow-hidden">
        <TituloTarjeta>{pedido ? `Lo que pidió ${pedido.sucursal}` : 'Qué mandás'}</TituloTarjeta>
        {pedido && <p className="px-5 pt-3 text-sm text-tinta-suave">Ajustá las cantidades a lo que realmente mandás. Si de algo no hay, poné 0.</p>}
        <ListaProductos lineas={lineas} setLineas={setLineas} depositoId={Number(origenId) || null} etiquetaStock="Hay" avisarSinStock />
      </Tarjeta>
      <Tarjeta className="h-fit space-y-4 p-5 lg:sticky lg:top-6">
        <Campo etiqueta="Sale de">
          <Select value={origenId} onChange={(e) => setOrigenId(e.target.value)}>
            {origenes.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre}
              </option>
            ))}
          </Select>
        </Campo>
        <Campo etiqueta="Va a">
          <Select value={destinoId} onChange={(e) => setDestinoId(e.target.value)} disabled={!!pedido}>
            <option value="">Elegí la sucursal…</option>
            {destinos
              .filter((d) => String(d.id) !== origenId)
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nombre}
                </option>
              ))}
          </Select>
        </Campo>
        <Campo etiqueta="Nota" ayuda="Opcional. Ej.: va en la caja azul.">
          <Input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} />
        </Campo>
        {incompleto && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={cerrar} onChange={(e) => setCerrar(e.target.checked)} className="mt-0.5 h-4 w-4 accent-marca" />
            <span>
              Dar el pedido por terminado
              <span className="block text-xs text-tinta-suave">Si no, lo que falta queda pendiente para otro envío.</span>
            </span>
          </label>
        )}
        {lineas.some((l) => (cantidadValida(l) ?? 0) > l.stock) && <Aviso tipo="alerta">Hay productos con menos stock del que mandás: revisá que estén.</Aviso>}
        {error && <Aviso tipo="error">{error}</Aviso>}
        <Boton onClick={enviar} disabled={guardando || !lineas.length} className="h-12 w-full text-base">
          {guardando ? 'Enviando…' : 'Confirmar envío'}
        </Boton>
      </Tarjeta>
    </div>
  )
}
