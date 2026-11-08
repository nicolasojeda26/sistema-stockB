'use client'

import { useEffect, useRef, useState, useTransition, type KeyboardEvent } from 'react'
import Link from 'next/link'
import { Aviso, Boton, Campo, Etiqueta, Input, Select, Tarjeta, TituloTarjeta, tablaCls as t } from '@/components/ui'
import { formatoEntero, formatoPesos } from '@/lib/formato'
import { buscarProducto, confirmarOperacion, stockEn, type ProductoLinea } from './actions'
import { AltaRapida } from './alta-rapida'
import { GrillaTalles } from './grilla'

export type Deposito = { id: number; nombre: string; propio: boolean; es_principal: boolean; sucursal_id: number | null }
type Tipo = 'ingreso' | 'transferencia' | 'ajuste'
type Linea = ProductoLinea & { cantidad: string }

export const MOTIVOS_AJUSTE = [
  { valor: 'Recuento', ayuda: 'Poné la cantidad que contaste: el sistema calcula la diferencia.' },
  { valor: 'Rotura', ayuda: 'Poné cuántas unidades se rompieron: se descuentan.' },
  { valor: 'Pérdida o robo', ayuda: 'Poné cuántas unidades faltan: se descuentan.' },
  { valor: 'Otro', ayuda: 'Poné la diferencia: positiva suma, negativa resta (ej.: -2).' },
] as const

const TEXTOS: Record<Tipo, { boton: string; listo: string }> = {
  ingreso: { boton: 'Confirmar ingreso', listo: 'Ingreso registrado' },
  transferencia: { boton: 'Confirmar transferencia', listo: 'Transferencia registrada' },
  ajuste: { boton: 'Confirmar ajuste', listo: 'Ajuste registrado' },
}

export function leerBorrador<T>(clave: string): T | null {
  try {
    const v = localStorage.getItem(clave)
    return v ? (JSON.parse(v) as T) : null
  } catch {
    return null
  }
}
export function guardarBorrador(clave: string, valor: unknown) {
  try {
    if (valor === null) localStorage.removeItem(clave)
    else localStorage.setItem(clave, JSON.stringify(valor))
  } catch {}
}

export function OperacionStock({
  tipo,
  depositos,
  categorias,
  usuarioId,
  articuloInicial = null,
}: {
  tipo: Tipo
  depositos: Deposito[]
  categorias: { id: number; nombre: string }[]
  usuarioId: number
  /** Viene de la ficha del artículo: abre la grilla de talles directamente. */
  articuloInicial?: number | null
}) {
  const propios = depositos.filter((d) => d.propio)
  const inicialPropio = String((propios.find((d) => d.es_principal) ?? propios[0])?.id ?? '')
  const claveBorrador = `borrador-${tipo}-${usuarioId}`

  // Depósito donde entra (ingreso/ajuste) o desde donde sale (transferencia).
  const [depositoId, setDepositoId] = useState(inicialPropio)
  const [destinoId, setDestinoId] = useState('')
  const [motivo, setMotivo] = useState<string>(MOTIVOS_AJUSTE[0].valor)
  const [nota, setNota] = useState('')
  const [lineas, setLineas] = useState<Linea[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [sugerencias, setSugerencias] = useState<ProductoLinea[]>([])
  const [noEncontrado, setNoEncontrado] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [listo, setListo] = useState<{ id: number; unidades: number; productos: number } | null>(null)
  const [guardando, iniciar] = useTransition()
  const [grilla, setGrilla] = useState(articuloInicial !== null)
  const escaner = useRef<HTMLInputElement>(null)
  const cargado = useRef(false)

  // Recuperar la lista si se recargó la página a mitad de camino
  // (el borrador vive en el navegador: se lee después de montar).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const b = leerBorrador<{ depositoId: string; destinoId: string; motivo: string; nota: string; lineas: Linea[] }>(claveBorrador)
    if (b?.lineas?.length) {
      if (depositos.some((d) => String(d.id) === b.depositoId && d.propio)) setDepositoId(b.depositoId)
      setDestinoId(b.destinoId ?? '')
      setMotivo(b.motivo ?? MOTIVOS_AJUSTE[0].valor)
      setNota(b.nota ?? '')
      setLineas(b.lineas)
    }
    cargado.current = true
  }, [claveBorrador, depositos])
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (cargado.current) guardarBorrador(claveBorrador, lineas.length ? { depositoId, destinoId, motivo, nota, lineas } : null)
  }, [claveBorrador, depositoId, destinoId, motivo, nota, lineas])

  const esRecuento = tipo === 'ajuste' && motivo === 'Recuento'
  const resta = tipo === 'ajuste' && (motivo === 'Rotura' || motivo === 'Pérdida o robo')

  function agregar(p: ProductoLinea) {
    setError(null)
    setNoEncontrado(null)
    setSugerencias([])
    setBusqueda('')
    setLineas((ls) => {
      const i = ls.findIndex((l) => l.id === p.id)
      if (i >= 0 && !esRecuento) {
        // Escanear de nuevo el mismo producto suma una unidad.
        const copia = [...ls]
        const actual = Number.parseInt(copia[i].cantidad, 10) || 0
        copia[i] = { ...copia[i], cantidad: String(actual + 1) }
        return [copia[i], ...copia.filter((_, j) => j !== i)]
      }
      if (i >= 0) return ls
      return [{ ...p, cantidad: esRecuento ? String(Math.max(p.stock, 0)) : '1' }, ...ls]
    })
    escaner.current?.focus()
  }

  /** Desde la grilla: suma cantidades (en recuento, reemplaza por lo contado). */
  function agregarVarios(items: { producto: ProductoLinea; cantidad: number }[]) {
    setGrilla(false)
    setError(null)
    setLineas((ls) => {
      let copia = [...ls]
      for (const { producto, cantidad } of items) {
        const i = copia.findIndex((l) => l.id === producto.id)
        if (i >= 0) {
          const actual = esRecuento ? 0 : Number.parseInt(copia[i].cantidad, 10) || 0
          copia[i] = { ...copia[i], cantidad: String(actual + cantidad) }
        } else {
          const { id, codigo, nombre, precio, costo, activo, stock } = producto
          copia = [{ id, codigo, nombre, precio, costo, activo, stock, cantidad: String(cantidad) }, ...copia]
        }
      }
      return copia
    })
    escaner.current?.focus()
  }

  const pedido = useRef(0)
  const demora = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function buscar(texto: string, enter: boolean) {
    if (demora.current) clearTimeout(demora.current)
    const n = ++pedido.current // descarta respuestas viejas si se sigue escribiendo
    if (!texto.trim()) return setSugerencias([])
    const r = await buscarProducto(texto, Number(depositoId) || null)
    if (n !== pedido.current) return
    if (r.exacto) {
      if (enter) agregar(r.exacto)
      else setSugerencias([r.exacto])
    } else {
      setSugerencias(r.sugerencias)
      if (enter && r.sugerencias.length === 0) setNoEncontrado(texto.trim())
    }
  }

  function teclaEscaner(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (sugerencias.length === 1 && busqueda.trim() && !/^\d{6,}$/.test(busqueda.trim())) agregar(sugerencias[0])
      else void buscar(busqueda, true)
    } else if (e.key === 'Escape') {
      setSugerencias([])
    }
  }

  async function cambiarDeposito(id: string) {
    setDepositoId(id)
    if (!lineas.length || !id) return
    const stock = await stockEn(lineas.map((l) => l.id), Number(id))
    setLineas((ls) => ls.map((l) => ({ ...l, stock: stock[l.id] ?? 0 })))
  }

  const cantidadDe = (l: Linea) => Number.parseInt(l.cantidad, 10)
  const diferencia = (l: Linea) => {
    const n = cantidadDe(l)
    if (Number.isNaN(n)) return null
    return esRecuento ? n - l.stock : resta ? -n : n
  }
  const invalidas = lineas.filter((l) => {
    const n = cantidadDe(l)
    if (Number.isNaN(n) || String(n) !== l.cantidad.trim()) return true
    if (esRecuento) return n < 0
    if (tipo === 'ajuste' && motivo === 'Otro') return n === 0
    return n <= 0
  })
  const totalUnidades = lineas.reduce((a, l) => a + Math.abs(diferencia(l) ?? 0), 0)

  const origenNombre = depositos.find((d) => String(d.id) === depositoId)?.nombre
  const faltaDestino = tipo === 'transferencia' && !destinoId

  function confirmar() {
    setError(null)
    if (invalidas.length) return setError('Hay cantidades vacías o no válidas en la lista.')
    if (faltaDestino) return setError('Elegí a qué depósito va la mercadería.')
    iniciar(async () => {
      const r = await confirmarOperacion({
        tipo,
        origenId: tipo === 'transferencia' ? Number(depositoId) : null,
        destinoId: tipo === 'transferencia' ? Number(destinoId) : Number(depositoId),
        motivo: tipo === 'ajuste' ? motivo : null,
        nota: nota.trim() || null,
        items: lineas.map((l) =>
          esRecuento ? { productoId: l.id, contado: cantidadDe(l) } : { productoId: l.id, cantidad: resta ? -cantidadDe(l) : cantidadDe(l) },
        ),
      })
      if (r.error || !r.operacionId) return setError(r.error ?? 'No se pudo guardar.')
      setListo({ id: r.operacionId, unidades: totalUnidades, productos: lineas.length })
      setLineas([])
      setNota('')
      guardarBorrador(claveBorrador, null)
    })
  }

  if (!propios.length)
    return <Aviso tipo="alerta">No tenés depósitos asignados. Pedile a una administradora que revise tu sucursal.</Aviso>

  if (listo)
    return (
      <Tarjeta className="max-w-xl p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ok text-white">✓</span>
          <div>
            <h2 className="text-lg font-semibold">{TEXTOS[tipo].listo}</h2>
            <p className="text-sm text-tinta-suave">
              {formatoEntero(listo.productos)} producto{listo.productos === 1 ? '' : 's'} · {formatoEntero(listo.unidades)} unidades
            </p>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <Boton onClick={() => setListo(null)} autoFocus>
            Cargar otro
          </Boton>
          <Link href={`/mercaderia/${listo.id}`} className="inline-flex h-10 items-center rounded-lg border border-linea px-4 text-sm font-medium hover:bg-fondo">
            Ver detalle
          </Link>
          {tipo === 'ingreso' && (
            <Link href={`/etiquetas?operacion=${listo.id}`} className="inline-flex h-10 items-center rounded-lg border border-linea px-4 text-sm font-medium hover:bg-fondo">
              Imprimir etiquetas
            </Link>
          )}
        </div>
      </Tarjeta>
    )

  return (
    <div className="min-w-0 space-y-5">
      <Tarjeta className="p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Campo etiqueta={tipo === 'transferencia' ? 'Sale de' : tipo === 'ingreso' ? 'Entra en' : 'Depósito'}>
            <Select value={depositoId} onChange={(e) => cambiarDeposito(e.target.value)}>
              {propios.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nombre}
                </option>
              ))}
            </Select>
          </Campo>
          {tipo === 'transferencia' && (
            <Campo etiqueta="Va a">
              <Select value={destinoId} onChange={(e) => setDestinoId(e.target.value)}>
                <option value="">Elegí el destino…</option>
                {depositos
                  .filter((d) => String(d.id) !== depositoId)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nombre}
                    </option>
                  ))}
              </Select>
            </Campo>
          )}
          {tipo === 'ajuste' && (
            <Campo etiqueta="Motivo" ayuda={MOTIVOS_AJUSTE.find((m) => m.valor === motivo)?.ayuda}>
              <Select
                value={motivo}
                onChange={(e) => {
                  setMotivo(e.target.value)
                  if (e.target.value === 'Recuento') setLineas((ls) => ls.map((l) => ({ ...l, cantidad: String(Math.max(l.stock, 0)) })))
                  else setLineas((ls) => ls.map((l) => ({ ...l, cantidad: '1' })))
                }}
              >
                {MOTIVOS_AJUSTE.map((m) => (
                  <option key={m.valor}>{m.valor}</option>
                ))}
              </Select>
            </Campo>
          )}
        </div>

        <div className="relative mt-5">
          <div className="mb-1.5 flex items-end justify-between gap-3">
            <label htmlFor="escaner" className="block text-sm font-medium">
              Escaneá o buscá el producto
            </label>
            <button type="button" onClick={() => setGrilla(true)} className="text-sm font-semibold text-marca hover:underline">
              Cargar por talle y color
            </button>
          </div>
          <input
            id="escaner"
            ref={escaner}
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value)
              setNoEncontrado(null)
              const v = e.target.value
              if (demora.current) clearTimeout(demora.current)
              // Los lectores escriben muy rápido: se espera a que paren antes de sugerir.
              demora.current = setTimeout(() => void buscar(v, false), 200)
            }}
            onKeyDown={teclaEscaner}
            autoFocus
            autoComplete="off"
            placeholder="Código de barras o nombre"
            className="h-14 w-full rounded-xl border border-linea bg-fondo px-4 font-mono text-lg placeholder:font-sans placeholder:text-base placeholder:text-apagado focus:border-marca focus:bg-papel focus:outline-none focus:ring-4 focus:ring-marca/10"
          />
          {sugerencias.length > 0 && busqueda && (
            <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-linea bg-papel shadow-lg" role="listbox">
              {sugerencias.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => agregar(p)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-marca-clara"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{p.nombre}</span>
                      <span className="block font-mono text-xs text-apagado">{p.codigo}</span>
                    </span>
                    <span className="num shrink-0 text-xs text-tinta-suave">{formatoEntero(p.stock)} en stock</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {grilla && (
          <GrillaTalles
            depositoId={Number(depositoId) || null}
            articuloInicial={articuloInicial}
            mostrarStock={tipo !== 'ingreso'}
            alAgregar={agregarVarios}
            alCerrar={() => setGrilla(false)}
          />
        )}
        {noEncontrado && (
          <div className="mt-4">
            {tipo === 'ingreso' ? (
              <AltaRapida
                codigoInicial={/\s/.test(noEncontrado) || noEncontrado.length > 64 ? '' : noEncontrado}
                nombreInicial={/\s/.test(noEncontrado) ? noEncontrado : ''}
                categorias={categorias}
                alCrear={(p) => agregar(p)}
                alCancelar={() => {
                  setNoEncontrado(null)
                  escaner.current?.focus()
                }}
              />
            ) : (
              <Aviso tipo="alerta">No hay ningún producto con «{noEncontrado}».</Aviso>
            )}
          </div>
        )}
      </Tarjeta>

      <Tarjeta className="overflow-hidden">
        <TituloTarjeta
          acciones={
            lineas.length > 0 && (
              <button
                onClick={() => {
                  if (confirm('¿Vaciar la lista?')) setLineas([])
                }}
                className="text-xs text-tinta-suave hover:text-error"
              >
                Vaciar lista
              </button>
            )
          }
        >
          {lineas.length ? `${formatoEntero(lineas.length)} producto${lineas.length === 1 ? '' : 's'} · ${formatoEntero(totalUnidades)} unidades` : 'Lista'}
        </TituloTarjeta>
        {lineas.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-apagado">Escaneá los productos: cada lectura suma una unidad.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className={t.tabla}>
              <thead>
                <tr>
                  <th className={t.th}>Producto</th>
                  <th className={`${t.th} text-right`}>{tipo === 'transferencia' ? `Stock en origen` : 'Stock actual'}</th>
                  <th className={`${t.th} w-36 text-right`}>{esRecuento ? 'Contado' : resta ? 'A descontar' : tipo === 'ajuste' ? 'Diferencia' : 'Cantidad'}</th>
                  {tipo !== 'transferencia' && <th className={`${t.th} text-right`}>Queda</th>}
                  <th className={`${t.th} w-0`} />
                </tr>
              </thead>
              <tbody>
                {lineas.map((l) => {
                  const dif = diferencia(l)
                  const queda = dif === null ? null : tipo === 'transferencia' ? l.stock - Math.abs(dif) : l.stock + dif
                  const mala = invalidas.includes(l)
                  return (
                    <tr key={l.id}>
                      <td className={t.td}>
                        <span className="block font-medium">{l.nombre}</span>
                        <span className="block font-mono text-xs text-apagado">
                          {l.codigo} · {formatoPesos(l.precio)}
                        </span>
                      </td>
                      <td className={`${t.td} num text-right text-tinta-suave`}>{formatoEntero(l.stock)}</td>
                      <td className={`${t.td} text-right`}>
                        <Input
                          value={l.cantidad}
                          inputMode="numeric"
                          aria-label={`Cantidad de ${l.nombre}`}
                          onChange={(e) => setLineas((ls) => ls.map((x) => (x.id === l.id ? { ...x, cantidad: e.target.value } : x)))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              escaner.current?.focus()
                            }
                          }}
                          className={`num h-9 w-24 text-right ${mala ? 'border-error ring-2 ring-error/15' : ''}`}
                        />
                      </td>
                      {tipo !== 'transferencia' && (
                        <td className={`${t.td} num text-right font-medium`}>
                          {queda === null ? '—' : queda < 0 ? <Etiqueta tono="alerta">{formatoEntero(queda)}</Etiqueta> : formatoEntero(queda)}
                          {tipo === 'ajuste' && dif !== null && dif !== 0 && (
                            <span className={`block text-xs ${dif > 0 ? 'text-ok' : 'text-error'}`}>
                              {dif > 0 ? '+' : ''}
                              {formatoEntero(dif)}
                            </span>
                          )}
                        </td>
                      )}
                      <td className={t.td}>
                        <button
                          onClick={() => setLineas((ls) => ls.filter((x) => x.id !== l.id))}
                          aria-label={`Quitar ${l.nombre}`}
                          className="flex h-8 w-8 items-center justify-center rounded-md text-apagado hover:bg-error-claro hover:text-error"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>

      {lineas.length > 0 && (
        <Tarjeta className="space-y-4 p-5">
          {tipo === 'transferencia' && lineas.some((l) => (cantidadDe(l) || 0) > l.stock) && (
            <Aviso tipo="alerta">
              Hay productos con más unidades que las que figuran en {origenNombre}. Se puede transferir igual, pero ese stock va a quedar en negativo.
            </Aviso>
          )}
          <Campo etiqueta="Nota" ayuda={tipo === 'ingreso' ? 'Opcional. Ej.: proveedor y número de remito.' : 'Opcional.'}>
            <Input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} />
          </Campo>
          {error && <Aviso tipo="error">{error}</Aviso>}
          <Boton onClick={confirmar} disabled={guardando || faltaDestino} className="h-12 px-6 text-base">
            {guardando ? 'Guardando…' : TEXTOS[tipo].boton}
          </Boton>
        </Tarjeta>
      )}
    </div>
  )
}
