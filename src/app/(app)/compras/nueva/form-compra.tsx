'use client'

import { useEffect, useRef, useState, useTransition, type KeyboardEvent } from 'react'
import Link from 'next/link'
import { Aviso, Boton, Campo, Input, Select, Tarjeta, TituloTarjeta, tablaCls as t } from '@/components/ui'
import { formatoEntero, formatoPesos, margen } from '@/lib/formato'
import { parseNumero } from '@/lib/numeros'
import { MEDIOS_PROVEEDOR, TIPOS_COMPROBANTE, totalesCompra, type MedioProveedor, type TipoComprobante } from '@/lib/compras-tipos'
import { buscarProducto, type ProductoLinea } from '../../mercaderia/actions'
import { AltaRapida } from '../../mercaderia/alta-rapida'
import { GrillaTalles } from '../../mercaderia/grilla'
import { guardarBorrador, leerBorrador, type Deposito } from '../../mercaderia/operacion'
import { crearProveedorRapido, type ProveedorCorto } from '../../proveedores/actions'
import { confirmarCompra } from '../actions'

type Linea = ProductoLinea & { cantidad: string; costoNuevo: string }
type Pago = 'cuenta' | 'pagada'
type Borrador = {
  proveedorId: string
  depositoId: string
  fecha: string
  tipo: TipoComprobante
  numero: string
  ivaPct: string
  percepciones: string
  lineas: Linea[]
}

const aTexto = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',')

export function FormCompra({
  proveedores: proveedoresIniciales,
  depositos,
  categorias,
  hoy,
  cajaAbierta,
  proveedorInicial,
  usuarioId,
}: {
  proveedores: ProveedorCorto[]
  depositos: Deposito[]
  categorias: { id: number; nombre: string }[]
  hoy: string
  cajaAbierta: boolean
  proveedorInicial: number | null
  usuarioId: number
}) {
  const clave = `borrador-compra-${usuarioId}`
  const [proveedores, setProveedores] = useState(proveedoresIniciales)
  const [proveedorId, setProveedorId] = useState(proveedorInicial ? String(proveedorInicial) : '')
  const [nuevoProv, setNuevoProv] = useState<{ nombre: string; cuit: string; error?: string } | null>(null)
  const inicialDep = String((depositos.find((d) => d.es_principal) ?? depositos[0])?.id ?? '')
  const [depositoId, setDepositoId] = useState(inicialDep)
  const [fecha, setFecha] = useState(hoy)
  const [tipo, setTipo] = useState<TipoComprobante>('A')
  const [numero, setNumero] = useState('')
  const [ivaPct, setIvaPct] = useState('21')
  const [percepciones, setPercepciones] = useState('')
  const [lineas, setLineas] = useState<Linea[]>([])
  const [actualizarCostos, setActualizarCostos] = useState(true)
  const [pago, setPago] = useState<Pago>('cuenta')
  const [medio, setMedio] = useState<MedioProveedor>('transferencia')
  const [desdeCaja, setDesdeCaja] = useState(cajaAbierta)
  const [montoPago, setMontoPago] = useState('')
  const [nota, setNota] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [sugerencias, setSugerencias] = useState<ProductoLinea[]>([])
  const [noEncontrado, setNoEncontrado] = useState<string | null>(null)
  const [grilla, setGrilla] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [listo, setListo] = useState<{ compraId: number; operacionId: number; total: number; unidades: number } | null>(null)
  const [guardando, iniciar] = useTransition()
  const escaner = useRef<HTMLInputElement>(null)
  const cargado = useRef(false)

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const b = leerBorrador<Borrador>(clave)
    if (b?.lineas?.length) {
      if (!proveedorInicial && proveedores.some((p) => String(p.id) === b.proveedorId)) setProveedorId(b.proveedorId)
      if (depositos.some((d) => String(d.id) === b.depositoId)) setDepositoId(b.depositoId)
      setFecha(b.fecha || hoy)
      setTipo(b.tipo ?? 'A')
      setNumero(b.numero ?? '')
      setIvaPct(b.ivaPct ?? '21')
      setPercepciones(b.percepciones ?? '')
      setLineas(b.lineas)
    }
    cargado.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave])
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (cargado.current)
      guardarBorrador(clave, lineas.length ? ({ proveedorId, depositoId, fecha, tipo, numero, ivaPct, percepciones, lineas } satisfies Borrador) : null)
  }, [clave, proveedorId, depositoId, fecha, tipo, numero, ivaPct, percepciones, lineas])

  function agregar(p: ProductoLinea, cantidad = 1) {
    setError(null)
    setNoEncontrado(null)
    setSugerencias([])
    setBusqueda('')
    setLineas((ls) => {
      const i = ls.findIndex((l) => l.id === p.id)
      if (i >= 0) {
        const copia = [...ls]
        copia[i] = { ...copia[i], cantidad: String((Number.parseInt(copia[i].cantidad, 10) || 0) + cantidad) }
        return [copia[i], ...copia.filter((_, j) => j !== i)]
      }
      return [{ ...p, cantidad: String(cantidad), costoNuevo: aTexto(Number(p.costo)) }, ...ls]
    })
    escaner.current?.focus()
  }

  const pedido = useRef(0)
  const demora = useRef<ReturnType<typeof setTimeout> | null>(null)
  async function buscar(texto: string, enter: boolean) {
    if (demora.current) clearTimeout(demora.current)
    const n = ++pedido.current
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
    } else if (e.key === 'Escape') setSugerencias([])
  }

  const cambiar = (id: number, c: Partial<Linea>) => setLineas((ls) => ls.map((l) => (l.id === id ? { ...l, ...c } : l)))
  const cantidadDe = (l: Linea) => {
    const n = Number(l.cantidad.trim())
    return Number.isInteger(n) && n > 0 ? n : null
  }
  const costoDe = (l: Linea) => {
    const n = parseNumero(l.costoNuevo)
    return n !== null && n >= 0 ? n : null
  }
  const invalidas = lineas.filter((l) => cantidadDe(l) === null || costoDe(l) === null)
  const iva = tipo === 'A' ? Number(ivaPct) : 0
  const perc = parseNumero(percepciones || '0')
  const totales = totalesCompra(
    lineas.map((l) => ({ cantidad: cantidadDe(l) ?? 0, costo: costoDe(l) ?? 0 })),
    iva,
    perc !== null && perc >= 0 ? perc : 0,
  )
  const unidades = lineas.reduce((a, l) => a + (cantidadDe(l) ?? 0), 0)
  const montoPagoN = montoPago.trim() ? parseNumero(montoPago) : totales.total

  function confirmar() {
    setError(null)
    if (!proveedorId) return setError('Elegí el proveedor.')
    if (!lineas.length) return setError('Agregá los productos de la factura.')
    if (invalidas.length) return setError('Hay cantidades o costos vacíos o no válidos.')
    if (perc === null || perc < 0) return setError('Las percepciones no son válidas.')
    if (pago === 'pagada' && !(montoPagoN && montoPagoN > 0)) return setError('Poné cuánto se pagó.')
    iniciar(async () => {
      const r = await confirmarCompra({
        proveedorId: Number(proveedorId),
        depositoId: Number(depositoId),
        fecha,
        tipoComprobante: tipo,
        numero: numero.trim() || null,
        items: lineas.map((l) => ({ productoId: l.id, cantidad: cantidadDe(l)!, costo: costoDe(l)! })),
        ivaPct: iva,
        percepciones: perc,
        totalEsperado: totales.total,
        actualizarCostos,
        nota: nota.trim() || null,
        pago: pago === 'pagada' ? { monto: montoPagoN!, medio, desdeCaja: medio === 'efectivo' && desdeCaja } : null,
      })
      if (r.error || !r.compraId) return setError(r.error ?? 'No se pudo guardar.')
      setListo({ compraId: r.compraId, operacionId: r.operacionId!, total: totales.total, unidades })
      setLineas([])
      setNumero('')
      setPercepciones('')
      setNota('')
      setMontoPago('')
      setPago('cuenta')
      guardarBorrador(clave, null)
    })
  }

  if (listo)
    return (
      <Tarjeta className="max-w-xl p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ok text-white">✓</span>
          <div>
            <h2 className="text-lg font-semibold">Compra N.º {listo.compraId} registrada</h2>
            <p className="text-sm text-tinta-suave">
              {formatoEntero(listo.unidades)} unidades ingresaron al stock · {formatoPesos(listo.total)}
            </p>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <Boton onClick={() => setListo(null)} autoFocus>
            Cargar otra
          </Boton>
          <Link href={`/compras/${listo.compraId}`} className="inline-flex h-10 items-center rounded-lg border border-linea px-4 text-sm font-medium hover:bg-fondo">
            Ver compra
          </Link>
          <Link href={`/etiquetas?operacion=${listo.operacionId}`} className="inline-flex h-10 items-center rounded-lg border border-linea px-4 text-sm font-medium hover:bg-fondo">
            Imprimir etiquetas
          </Link>
        </div>
      </Tarjeta>
    )

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
      <div className="min-w-0 space-y-5">
        <Tarjeta className="p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Proveedor">
              {nuevoProv ? (
                <div className="space-y-2 rounded-lg border border-linea p-3">
                  <Input value={nuevoProv.nombre} onChange={(e) => setNuevoProv({ ...nuevoProv, nombre: e.target.value })} placeholder="Nombre o razón social" aria-label="Nombre del proveedor nuevo" autoFocus />
                  <Input value={nuevoProv.cuit} onChange={(e) => setNuevoProv({ ...nuevoProv, cuit: e.target.value })} placeholder="CUIT (opcional)" inputMode="numeric" aria-label="CUIT del proveedor nuevo" />
                  {nuevoProv.error && <p className="text-sm text-error">{nuevoProv.error}</p>}
                  <div className="flex gap-2">
                    <Boton
                      type="button"
                      className="flex-1"
                      onClick={async () => {
                        const r = await crearProveedorRapido(nuevoProv.nombre, nuevoProv.cuit)
                        if (r.proveedor) {
                          setProveedores((ps) => [...ps, r.proveedor!].sort((a, b) => a.nombre.localeCompare(b.nombre)))
                          setProveedorId(String(r.proveedor.id))
                          setNuevoProv(null)
                        } else setNuevoProv({ ...nuevoProv, error: r.error })
                      }}
                    >
                      Guardar proveedor
                    </Boton>
                    <Boton type="button" variante="secundario" onClick={() => setNuevoProv(null)}>
                      Cancelar
                    </Boton>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)} className="min-w-0 flex-1">
                    <option value="">Elegí el proveedor…</option>
                    {proveedores.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                  </Select>
                  <Boton type="button" variante="secundario" onClick={() => setNuevoProv({ nombre: '', cuit: '' })} aria-label="Nuevo proveedor">
                    + Nuevo
                  </Boton>
                </div>
              )}
            </Campo>
            <Campo etiqueta="Entra en">
              <Select value={depositoId} onChange={(e) => setDepositoId(e.target.value)}>
                {depositos.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nombre}
                  </option>
                ))}
              </Select>
            </Campo>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Campo etiqueta="Comprobante">
              <Select
                value={tipo}
                onChange={(e) => {
                  const v = e.target.value as TipoComprobante
                  setTipo(v)
                  if (v !== 'A') setIvaPct('0')
                  else if (ivaPct === '0') setIvaPct('21')
                }}
              >
                {Object.entries(TIPOS_COMPROBANTE).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo etiqueta="Número">
              <Input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="0003-00001234" className="font-mono" />
            </Campo>
            <Campo etiqueta="Fecha">
              <Input type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} />
            </Campo>
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
                demora.current = setTimeout(() => void buscar(v, false), 200)
              }}
              onKeyDown={teclaEscaner}
              autoComplete="off"
              placeholder="Código de barras o nombre"
              className="h-14 w-full rounded-xl border border-linea bg-fondo px-4 font-mono text-lg placeholder:font-sans placeholder:text-base placeholder:text-apagado focus:border-marca focus:bg-papel focus:outline-none focus:ring-4 focus:ring-marca/10"
            />
            {sugerencias.length > 0 && busqueda && (
              <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-linea bg-papel shadow-lg" role="listbox">
                {sugerencias.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => agregar(p)} className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-marca-clara">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{p.nombre}</span>
                        <span className="block font-mono text-xs text-apagado">{p.codigo}</span>
                      </span>
                      <span className="num shrink-0 text-xs text-tinta-suave">costo {formatoPesos(Number(p.costo))}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {grilla && (
            <GrillaTalles
              depositoId={Number(depositoId) || null}
              mostrarStock={false}
              alAgregar={(items) => {
                setGrilla(false)
                for (const i of items) agregar(i.producto, i.cantidad)
              }}
              alCerrar={() => setGrilla(false)}
            />
          )}
          {noEncontrado && (
            <div className="mt-4">
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
            {lineas.length ? `${formatoEntero(lineas.length)} producto${lineas.length === 1 ? '' : 's'} · ${formatoEntero(unidades)} unidades` : 'Productos de la factura'}
          </TituloTarjeta>
          {lineas.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-apagado">Escaneá cada prenda o cargá por talle y color. El costo viene con el último que pagaste: corregilo si cambió.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className={t.tabla}>
                <thead>
                  <tr>
                    <th className={t.th}>Producto</th>
                    <th className={`${t.th} w-24 text-right`}>Cantidad</th>
                    <th className={`${t.th} w-36 text-right`}>Costo unitario{tipo === 'A' ? ' (sin IVA)' : ''}</th>
                    <th className={`${t.th} text-right`}>Subtotal</th>
                    <th className={`${t.th} w-0`} />
                  </tr>
                </thead>
                <tbody>
                  {lineas.map((l) => {
                    const c = costoDe(l)
                    const n = cantidadDe(l)
                    const m = c !== null ? margen(c, Number(l.precio)) : null
                    const subio = c !== null && Number(l.costo) > 0 && c > Number(l.costo)
                    return (
                      <tr key={l.id}>
                        <td className={t.td}>
                          <span className="block font-medium">{l.nombre}</span>
                          <span className="block text-xs text-apagado">
                            <span className="font-mono">{l.codigo}</span> · vende a {formatoPesos(Number(l.precio))}
                            {m !== null && (
                              <span className={m < 50 ? 'font-medium text-alerta' : ''}>
                                {' '}
                                · margen {m.toLocaleString('es-AR')} %
                              </span>
                            )}
                          </span>
                        </td>
                        <td className={`${t.td} text-right`}>
                          <Input
                            value={l.cantidad}
                            inputMode="numeric"
                            aria-label={`Cantidad de ${l.nombre}`}
                            onChange={(e) => cambiar(l.id, { cantidad: e.target.value })}
                            className={`num text-right ${n === null ? 'border-error' : ''}`}
                          />
                        </td>
                        <td className={`${t.td} text-right`}>
                          <Input
                            value={l.costoNuevo}
                            inputMode="decimal"
                            aria-label={`Costo de ${l.nombre}`}
                            onChange={(e) => cambiar(l.id, { costoNuevo: e.target.value })}
                            className={`num text-right ${c === null ? 'border-error' : ''}`}
                          />
                          {subio && <span className="mt-0.5 block text-xs text-alerta">antes {formatoPesos(Number(l.costo))}</span>}
                        </td>
                        <td className={`${t.td} num text-right`}>{c !== null && n !== null ? formatoPesos(c * n) : '—'}</td>
                        <td className={t.td}>
                          <button
                            onClick={() => setLineas((ls) => ls.filter((x) => x.id !== l.id))}
                            aria-label={`Quitar ${l.nombre}`}
                            className="h-9 w-9 rounded-lg text-apagado hover:bg-error-claro hover:text-error"
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
      </div>

      <div className="min-w-0">
        <Tarjeta className="space-y-4 p-5 lg:sticky lg:top-6">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-tinta-suave">{tipo === 'A' ? 'Neto gravado' : 'Subtotal'}</dt>
              <dd className="num">{formatoPesos(totales.neto)}</dd>
            </div>
            {tipo === 'A' && (
              <div className="flex items-center justify-between gap-2">
                <dt className="text-tinta-suave">IVA</dt>
                <dd className="flex items-center gap-2">
                  <select value={ivaPct} onChange={(e) => setIvaPct(e.target.value)} aria-label="Alícuota de IVA" className="h-8 rounded-lg border border-linea px-1 text-sm">
                    {['21', '10.5', '27', '0'].map((v) => (
                      <option key={v} value={v}>
                        {v.replace('.', ',')} %
                      </option>
                    ))}
                  </select>
                  <span className="num">{formatoPesos(totales.iva)}</span>
                </dd>
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <dt className="text-tinta-suave">Percepciones</dt>
              <dd>
                <input
                  value={percepciones}
                  onChange={(e) => setPercepciones(e.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                  aria-label="Percepciones"
                  className="num h-8 w-28 rounded-lg border border-linea px-2 text-right text-sm"
                />
              </dd>
            </div>
          </dl>
          <div className="border-t border-linea pt-3">
            <p className="text-sm text-tinta-suave">Total de la factura</p>
            <p className="num text-3xl font-bold tracking-tight" data-testid="total">
              {formatoPesos(totales.total)}
            </p>
          </div>

          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={actualizarCostos} onChange={(e) => setActualizarCostos(e.target.checked)} className="mt-0.5 h-4 w-4 accent-marca" />
            <span>
              Actualizar el costo de los productos
              <span className="block text-xs text-tinta-suave">Así los márgenes y la valorización del stock quedan al día.</span>
            </span>
          </label>

          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">Pago</legend>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="pago" checked={pago === 'cuenta'} onChange={() => setPago('cuenta')} className="accent-marca" />
              Queda en la cuenta del proveedor
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="pago" checked={pago === 'pagada'} onChange={() => setPago('pagada')} className="accent-marca" />
              La pagué ahora
            </label>
            {pago === 'pagada' && (
              <div className="space-y-2 rounded-lg bg-fondo p-3">
                <div className="grid grid-cols-2 gap-2">
                  <Select value={medio} onChange={(e) => setMedio(e.target.value as MedioProveedor)} aria-label="Medio de pago">
                    {Object.entries(MEDIOS_PROVEEDOR).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                  <Input value={montoPago} onChange={(e) => setMontoPago(e.target.value)} inputMode="decimal" placeholder={aTexto(totales.total)} aria-label="Monto pagado" className="num text-right" />
                </div>
                {medio === 'efectivo' && (
                  <label className={`flex items-center gap-2 text-sm ${cajaAbierta ? '' : 'opacity-60'}`}>
                    <input type="checkbox" checked={desdeCaja && cajaAbierta} disabled={!cajaAbierta} onChange={(e) => setDesdeCaja(e.target.checked)} className="h-4 w-4 accent-marca" />
                    {cajaAbierta ? 'Sale de mi caja' : 'Sale de la caja (abrí la tuya primero)'}
                  </label>
                )}
                <p className="text-xs text-tinta-suave">Si pagaste una parte, poné cuánto: el resto queda en la cuenta.</p>
              </div>
            )}
          </fieldset>
          <Campo etiqueta="Nota" ayuda="Opcional">
            <Input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} />
          </Campo>
          {error && <Aviso tipo="error">{error}</Aviso>}
          <Boton onClick={confirmar} disabled={guardando || !lineas.length} className="h-12 w-full text-base">
            {guardando ? 'Guardando…' : 'Confirmar compra'}
          </Boton>
        </Tarjeta>
      </div>
    </div>
  )
}
