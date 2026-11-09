'use client'

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import Link from 'next/link'
import { Aviso, Boton, Etiqueta } from '@/components/ui'
import { formatoPesos } from '@/lib/formato'
import { aPesos, calcularVenta, descuentoEfectivo } from '@/lib/venta-calculo'
import { buscarParaVender, preciosActuales, type ProductoVenta } from './actions'
import { Cobro } from './cobro'
import { ClienteCaja } from './cliente-caja'
import { ElegirCambio, type CambioCarrito } from './cambio'
import { clienteActual, type ClienteBuscado } from '../clientes/actions'

export type LineaCarrito = ProductoVenta & { cantidad: number; descuentoPct: number }
type Carrito = { lineas: LineaCarrito[]; descuentoGlobalPct: number; cliente?: ClienteBuscado | null; cambio?: CambioCarrito | null }

const VACIO: Carrito = { lineas: [], descuentoGlobalPct: 0, cliente: null, cambio: null }

function leer(clave: string): Carrito | null {
  try {
    const v = localStorage.getItem(clave)
    return v ? (JSON.parse(v) as Carrito) : null
  } catch {
    return null
  }
}
function guardar(clave: string, c: Carrito) {
  try {
    if (c.lineas.length || c.cliente || c.cambio) localStorage.setItem(clave, JSON.stringify(c))
    else localStorage.removeItem(clave)
  } catch {}
}

const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Argentina/Buenos_Aires' })

export function PuntoDeVenta({ usuarioId, sucursal, abierta, descuentoMax }: { usuarioId: number; sucursal: string; abierta: string; descuentoMax: number }) {
  const clave = `carrito-${usuarioId}`
  const [carrito, setCarrito] = useState<Carrito>(VACIO)
  const [busqueda, setBusqueda] = useState('')
  const [sugerencias, setSugerencias] = useState<ProductoVenta[]>([])
  const [aviso, setAviso] = useState<{ tipo: 'error' | 'alerta' | 'info'; texto: string } | null>(null)
  const [cobrando, setCobrando] = useState(false)
  const [eligiendoCambio, setEligiendoCambio] = useState(false)
  const escaner = useRef<HTMLInputElement>(null)
  const listo = useRef(false)
  const pedido = useRef(0)
  const demora = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* eslint-disable react-hooks/set-state-in-effect -- el carrito guardado vive en el navegador */
  useEffect(() => {
    const c = leer(clave)
    if (c?.lineas?.length || c?.cliente || c?.cambio) setCarrito({ ...VACIO, ...c })
    listo.current = true
  }, [clave])
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (listo.current) guardar(clave, carrito)
  }, [clave, carrito])

  const { lineas, descuentoGlobalPct } = carrito
  const cliente = carrito.cliente ?? null
  const cambio = carrito.cambio ?? null
  const calc = calcularVenta(lineas.map((l) => ({ precio: l.precio, cantidad: l.cantidad, descuentoPct: l.descuentoPct })), descuentoGlobalPct)
  const unidades = lineas.reduce((a, l) => a + l.cantidad, 0)
  const credito = cambio?.total ?? 0
  const aCobrar = Math.max(calc.total - credito, 0)

  const enfocar = () => setTimeout(() => escaner.current?.focus(), 0)

  function agregar(p: ProductoVenta) {
    setAviso(p.stock <= 0 ? { tipo: 'alerta', texto: `Ojo: "${p.nombre}" figura sin stock en el local. Se vende igual.` } : null)
    setSugerencias([])
    setBusqueda('')
    setCarrito((c) => {
      const i = c.lineas.findIndex((l) => l.id === p.id)
      if (i >= 0) {
        const l = { ...c.lineas[i], cantidad: c.lineas[i].cantidad + 1 }
        return { ...c, lineas: [l, ...c.lineas.filter((_, j) => j !== i)] }
      }
      return { ...c, lineas: [{ ...p, cantidad: 1, descuentoPct: 0 }, ...c.lineas] }
    })
    enfocar()
  }

  async function buscar(texto: string, enter: boolean) {
    if (demora.current) clearTimeout(demora.current)
    const n = ++pedido.current
    if (!texto.trim()) return setSugerencias([])
    const r = await buscarParaVender(texto)
    if (n !== pedido.current) return
    if (r.error) return setAviso({ tipo: 'error', texto: r.error })
    if (r.exacto) return enter ? agregar(r.exacto) : setSugerencias([r.exacto])
    setSugerencias(r.sugerencias)
    if (enter && r.sugerencias.length === 0) setAviso({ tipo: 'error', texto: `No hay ningún producto con «${texto.trim()}».` })
    else if (enter && r.sugerencias.length === 1) agregar(r.sugerencias[0])
  }

  const cambiar = (id: number, cambio: Partial<LineaCarrito>) =>
    setCarrito((c) => ({ ...c, lineas: c.lineas.map((l) => (l.id === id ? { ...l, ...cambio } : l)) }))

  const abrirCobro = useCallback(async () => {
    if (!carrito.lineas.length) return
    // Antes de cobrar, traer los precios actuales por si alguien los cambió.
    const precios = await preciosActuales(carrito.lineas.map((l) => l.id))
    const cambiados = carrito.lineas.filter((l) => precios[l.id] !== undefined && precios[l.id] !== l.precio)
    if (cambiados.length) {
      setCarrito((c) => ({ ...c, lineas: c.lineas.map((l) => ({ ...l, precio: precios[l.id] ?? l.precio })) }))
      setAviso({ tipo: 'info', texto: `Se actualizó el precio de ${cambiados.map((l) => l.nombre).join(', ')}. Revisá el total.` })
      return
    }
    // Y el saldo y el límite del cliente, que pueden haber cambiado.
    if (carrito.cliente) {
      const c = await clienteActual(carrito.cliente.id)
      setCarrito((x) => ({ ...x, cliente: c }))
      if (!c) {
        setAviso({ tipo: 'info', texto: 'El cliente elegido ya no está activo.' })
        return
      }
    }
    setCobrando(true)
  }, [carrito.lineas, carrito.cliente])

  useEffect(() => {
    const tecla = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault()
        if (!cobrando) void abrirCobro()
      }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [abrirCobro, cobrando])

  const excedido = (l: LineaCarrito) => descuentoEfectivo(l.descuentoPct, descuentoGlobalPct) > descuentoMax
  const hayExceso = lineas.some(excedido)

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-bold tracking-tight sm:text-[1.75rem]">Vender</h1>
          <p className="text-sm text-tinta-suave">
            Caja de {sucursal}, abierta a las {hora(abierta)}.{' '}
            <Link href="/caja" className="font-medium text-marca hover:underline">
              Ver caja
            </Link>
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <ClienteCaja cliente={cliente} setCliente={(c) => setCarrito((x) => ({ ...x, cliente: c }))} />
          <button
            type="button"
            onClick={() => setEligiendoCambio(true)}
            className="h-11 rounded-xl border border-linea bg-papel px-4 text-sm font-semibold text-tinta-suave hover:border-marca hover:text-marca"
          >
            Cambio de producto
          </button>
        </div>
        {cambio && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-ok/30 bg-ok-claro px-4 py-2.5 text-sm">
            <span className="min-w-0">
              <span className="block font-semibold text-ok">Cambio: devuelve de la venta N.º {cambio.ventaId}</span>
              <span className="block truncate text-xs text-tinta-suave">
                {cambio.items.map((i) => `${i.cantidad} × ${i.nombre}`).join(', ')}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="num font-bold text-ok">−{formatoPesos(aPesos(cambio.total))}</span>
              <button type="button" onClick={() => setCarrito((x) => ({ ...x, cambio: null }))} className="rounded-lg px-2 py-1 text-xs text-tinta-suave hover:bg-papel">
                Quitar
              </button>
            </span>
          </div>
        )}

        <div className="relative">
          <input
            ref={escaner}
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value)
              setAviso(null)
              const v = e.target.value
              if (demora.current) clearTimeout(demora.current)
              demora.current = setTimeout(() => void buscar(v, false), 200)
            }}
            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void buscar(busqueda, true)
              } else if (e.key === 'Escape') setSugerencias([])
            }}
            autoFocus
            autoComplete="off"
            aria-label="Escanear producto"
            placeholder="Escaneá el código o buscá por nombre"
            className="h-16 w-full rounded-xl border-2 border-linea bg-papel px-5 font-mono text-xl placeholder:font-sans placeholder:text-base placeholder:text-apagado focus:border-marca focus:outline-none focus:ring-4 focus:ring-marca/10"
          />
          {sugerencias.length > 0 && busqueda && (
            <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-linea bg-papel shadow-lg">
              {sugerencias.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => agregar(p)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-marca-clara"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{p.nombre}</span>
                      <span className="block text-xs text-apagado">
                        <span className="font-mono">{p.codigo}</span>{' '}
                        {p.stock > 0 ? <span>· {p.stock} en stock</span> : <span className="font-semibold text-error">· sin stock</span>}
                      </span>
                    </span>
                    <span className="num shrink-0 font-semibold">{formatoPesos(p.precio)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}

        <div className="overflow-hidden rounded-xl border border-linea bg-papel shadow-[0_1px_2px_rgb(27_34_48/0.04)]">
          {lineas.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <p className="text-base font-medium">Escaneá el primer producto</p>
              <p className="mt-1 text-sm text-apagado">Cada lectura suma una unidad. Cuando termines, apretá Cobrar o F2.</p>
            </div>
          ) : (
            <ul className="divide-y divide-linea">
              {lineas.map((l, i) => (
                <li key={l.id} className={`grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center ${i === 0 ? 'bg-marca-clara/40' : ''}`}>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{l.nombre}</p>
                    <p className="font-mono text-xs text-apagado">
                      {l.codigo} · {formatoPesos(l.precio)} c/u
                      {l.stock - l.cantidad < 0 && (
                        <span className="ml-2 font-sans">
                          <Etiqueta tono="error">sin stock</Etiqueta>
                        </span>
                      )}
                    </p>
                  </div>
                  <p className="num text-right font-semibold sm:order-last sm:w-28">{formatoPesos(aPesos(calc.subtotales[i]))}</p>
                  <div className="flex items-center gap-1">
                    <button
                      aria-label={`Restar uno de ${l.nombre}`}
                      onClick={() => (l.cantidad > 1 ? cambiar(l.id, { cantidad: l.cantidad - 1 }) : setCarrito((c) => ({ ...c, lineas: c.lineas.filter((x) => x.id !== l.id) })))}
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-linea text-lg hover:bg-fondo"
                    >
                      −
                    </button>
                    <Cantidad valor={l.cantidad} nombre={l.nombre} alCambiar={(n) => cambiar(l.id, { cantidad: n })} />
                    <button
                      aria-label={`Sumar uno de ${l.nombre}`}
                      onClick={() => cambiar(l.id, { cantidad: l.cantidad + 1 })}
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-linea text-lg hover:bg-fondo"
                    >
                      +
                    </button>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <label className="flex items-center gap-1 text-xs text-apagado">
                      Desc.
                      <input
                        value={l.descuentoPct || ''}
                        inputMode="decimal"
                        placeholder="0"
                        aria-label={`Descuento de ${l.nombre}`}
                        onChange={(e) => {
                          const n = Number(e.target.value.replace(',', '.'))
                          if (!Number.isNaN(n) && n >= 0 && n <= 100) cambiar(l.id, { descuentoPct: n })
                        }}
                        className={`num h-9 w-12 rounded-lg border text-center text-sm text-tinta ${excedido(l) ? 'border-error ring-2 ring-error/15' : 'border-linea'}`}
                      />
                      %
                    </label>
                    <button
                      aria-label={`Quitar ${l.nombre}`}
                      onClick={() => setCarrito((c) => ({ ...c, lineas: c.lineas.filter((x) => x.id !== l.id) }))}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-apagado hover:bg-error-claro hover:text-error"
                    >
                      ✕
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <aside className="lg:sticky lg:top-6 lg:self-start">
        <div className="rounded-xl border border-linea bg-papel p-5 shadow-sm">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between text-tinta-suave">
              <dt>
                {unidades} unidad{unidades === 1 ? '' : 'es'}
              </dt>
              <dd className="num">{formatoPesos(aPesos(calc.bruto))}</dd>
            </div>
            <div className="flex items-center justify-between text-tinta-suave">
              <dt>
                <label htmlFor="desc-general">Descuento general</label>
              </dt>
              <dd className="flex items-center gap-1">
                <input
                  id="desc-general"
                  value={descuentoGlobalPct || ''}
                  inputMode="decimal"
                  placeholder="0"
                  onChange={(e) => {
                    const n = Number(e.target.value.replace(',', '.'))
                    if (!Number.isNaN(n) && n >= 0 && n <= 100) setCarrito((c) => ({ ...c, descuentoGlobalPct: n }))
                  }}
                  className="num h-8 w-14 rounded-md border border-linea text-center text-tinta"
                />
                %
              </dd>
            </div>
            {calc.descuento > 0 && (
              <div className="flex justify-between text-ok">
                <dt>Descuentos</dt>
                <dd className="num">−{formatoPesos(aPesos(calc.descuento))}</dd>
              </div>
            )}
          </dl>
          <div className="mt-4 border-t border-linea pt-4">
            <p className="text-sm text-tinta-suave">Total</p>
            <p className="num text-4xl font-bold tracking-tight" data-testid="total">
              {formatoPesos(aPesos(calc.total))}
            </p>
            {cambio && (
              <dl className="mt-2 space-y-1 text-sm">
                <div className="flex justify-between text-ok">
                  <dt>Devuelve en el cambio</dt>
                  <dd className="num">−{formatoPesos(aPesos(credito))}</dd>
                </div>
                <div className="flex justify-between font-semibold">
                  <dt>{calc.total >= credito ? 'Paga la diferencia' : 'Le sobra'}</dt>
                  <dd className="num" data-testid="diferencia">
                    {formatoPesos(aPesos(Math.abs(calc.total - credito)))}
                  </dd>
                </div>
              </dl>
            )}
          </div>
          {hayExceso && (
            <div className="mt-3">
              <Aviso tipo="error">Tu descuento máximo es {descuentoMax} %. Bajá el descuento marcado.</Aviso>
            </div>
          )}
          <Boton onClick={() => void abrirCobro()} disabled={!lineas.length || hayExceso} className={`mt-4 h-14 w-full text-lg ${lineas.length ? 'max-lg:hidden!' : ''}`}>
            Cobrar <span className="text-sm font-normal opacity-70">F2</span>
          </Boton>
          {lineas.length > 0 && (
            <button
              onClick={() => {
                if (confirm('¿Cancelar esta venta y vaciar el carrito?')) {
                  setCarrito(VACIO)
                  setAviso(null)
                  enfocar()
                }
              }}
              className="mt-3 w-full text-center text-sm text-tinta-suave hover:text-error"
            >
              Cancelar venta
            </button>
          )}
        </div>
      </aside>

      {/* En el celular el total y Cobrar quedan siempre a la vista, arriba de la barra de abajo. */}
      {lineas.length > 0 && (
        <>
          <div className="h-20 lg:hidden" aria-hidden />
          <div className="fixed inset-x-0 bottom-16 z-20 flex items-center gap-3 border-t border-linea bg-papel/95 px-4 py-3 backdrop-blur lg:hidden print:hidden">
            <span className="min-w-0 flex-1">
              <span className="block text-xs text-tinta-suave">
                {cambio ? 'A cobrar con el cambio' : `Total, ${unidades} unidad${unidades === 1 ? '' : 'es'}`}
              </span>
              <span className="num block truncate text-xl font-bold">{formatoPesos(aPesos(cambio ? aCobrar : calc.total))}</span>
            </span>
            <Boton onClick={() => void abrirCobro()} disabled={hayExceso} className="h-12 px-6 text-base">
              Cobrar
            </Boton>
          </div>
        </>
      )}

      {eligiendoCambio && (
        <ElegirCambio
          alCerrar={() => {
            setEligiendoCambio(false)
            enfocar()
          }}
          alUsar={(c, venta) => {
            setCarrito((x) => ({ ...x, cambio: c, cliente: x.cliente ?? venta.cliente }))
            setEligiendoCambio(false)
            setAviso({ tipo: 'info', texto: 'Ahora escaneá el producto que se lleva.' })
            enfocar()
          }}
        />
      )}

      {cobrando && (
        <Cobro
          lineas={lineas}
          descuentoGlobalPct={descuentoGlobalPct}
          totalCentavos={calc.total}
          creditoCentavos={credito}
          cambio={cambio}
          cliente={cliente}
          sucursal={sucursal}
          alCerrar={() => {
            setCobrando(false)
            enfocar()
          }}
          alVender={() => {
            // Se vacía apenas se registra, para que una recarga no la cobre dos veces.
            setCarrito(VACIO)
            setAviso(null)
          }}
        />
      )}
    </div>
  )
}

/** Cantidad editable: se puede borrar para escribir otra; si queda vacía o en 0, vuelve a la anterior. */
function Cantidad({ valor, nombre, alCambiar }: { valor: number; nombre: string; alCambiar: (n: number) => void }) {
  const [texto, setTexto] = useState(String(valor))
  const [anterior, setAnterior] = useState(valor)
  if (valor !== anterior) {
    setAnterior(valor)
    setTexto(String(valor))
  }
  return (
    <input
      value={texto}
      inputMode="numeric"
      aria-label={`Cantidad de ${nombre}`}
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        const t = e.target.value.replace(/\D/g, '').slice(0, 4)
        setTexto(t)
        const n = Number.parseInt(t, 10)
        if (n > 0) alCambiar(n)
      }}
      onBlur={() => setTexto(String(valor))}
      className="num h-9 w-12 rounded-lg border border-linea text-center text-sm"
    />
  )
}
