'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { coincide, ordenRelevancia } from '@/lib/busqueda'
import { requerirVendedor } from '@/lib/dal'
import { abrirCaja, cajaAbierta, ErrorVenta, itemsDevolvibles, registrarVenta, saldoCliente } from '@/lib/ventas'
import type { ClienteBuscado } from '../clientes/actions'
import { parseNumero } from '@/lib/numeros'
import { CONSUMIDOR_FINAL, facturarVenta, leerConfig } from '@/lib/arca/facturacion'
import type { Resultado } from '@/components/form-accion'

export type ProductoVenta = { id: number; codigo: string; nombre: string; precio: number; stock: number }

const conStock = (sucursalId: number) => db()`
  select p.id, p.codigo, p.nombre, p.precio,
    coalesce((select s.cantidad from stock s join depositos d on d.id = s.deposito_id
              where s.producto_id = p.id and d.sucursal_id = ${sucursalId} and d.es_principal), 0) as stock
  from productos p`

/** Escaneo en la caja: código exacto o sugerencias por nombre, con el stock del local. */
export async function buscarParaVender(q: string): Promise<{ exacto?: ProductoVenta; sugerencias: ProductoVenta[]; error?: string }> {
  const u = await requerirVendedor()
  const caja = await cajaAbierta(db(), u.id)
  if (!caja) return { sugerencias: [], error: 'La caja está cerrada.' }
  const texto = String(q ?? '').trim().slice(0, 100)
  if (!texto) return { sugerencias: [] }
  const [exacto] = await db()<(ProductoVenta & { activo: boolean })[]>`
    ${conStock(caja.sucursal_id)} where lower(p.codigo) = lower(${texto})`
  if (exacto) {
    if (!(await db()`select 1 from productos where id = ${exacto.id} and activo`).length) return { sugerencias: [], error: `"${exacto.nombre}" está dado de baja.` }
    return { exacto, sugerencias: [] }
  }
  const sugerencias = await db()<ProductoVenta[]>`
    ${conStock(caja.sucursal_id)}
    where p.activo and ${coincide(db(), texto)}
    order by ${ordenRelevancia(db(), texto)} limit 8`
  return { sugerencias }
}

/** Precios actuales de los productos del carrito (por si alguien los cambió). */
export async function preciosActuales(ids: number[]): Promise<Record<number, number>> {
  await requerirVendedor()
  const lista = z.array(z.number().int()).max(300).parse(ids)
  const filas = await db()<{ id: number; precio: number }[]>`select id, precio from productos where id = any(${lista}::int[])`
  return Object.fromEntries(filas.map((f) => [f.id, f.precio]))
}

const Cobro = z.object({
  items: z.array(z.object({ productoId: z.number().int(), cantidad: z.number().int().min(1).max(10000), descuentoPct: z.number().min(0).max(100) })).min(1).max(300),
  descuentoGlobalPct: z.number().min(0).max(100),
  pagos: z
    .array(
      z.object({
        medio: z.enum(['efectivo', 'transferencia', 'debito', 'credito', 'cuenta_corriente']),
        monto: z.number().positive().max(1e10),
        cuotas: z.number().int().min(1).max(24).nullable().optional(),
      }),
    )
    .max(6),
  efectivoRecibido: z.number().nonnegative().max(1e10).nullable(),
  totalEsperado: z.number().nonnegative(),
  clienteId: z.number().int().nullable().optional(),
  paraRetirar: z.boolean().optional(),
  cambio: z
    .object({
      ventaId: z.number().int(),
      items: z.array(z.object({ ventaItemId: z.number().int(), cantidad: z.number().int().min(1).max(10000) })).min(1).max(100),
      excedente: z.enum(['efectivo', 'cuenta_corriente']),
    })
    .nullable()
    .optional(),
})

export type ResultadoCobro = {
  ventaId?: number
  vuelto?: number
  /** Cambio de producto: lo que se le devolvió en efectivo o le quedó a favor. */
  reintegro?: number
  aFavor?: number
  error?: string
  /** Factura emitida automáticamente (si está activado). */
  comprobante?: { id: number; tipo: string; simulado: boolean }
  /** La venta quedó registrada pero la factura no salió. */
  errorFactura?: string
  puedeFacturar?: boolean
}

export async function cobrar(datos: z.input<typeof Cobro>): Promise<ResultadoCobro> {
  const u = await requerirVendedor()
  const r = Cobro.safeParse(datos)
  if (!r.success) return { error: 'Revisá los datos del cobro.' }
  let res
  try {
    res = await registrarVenta(db(), { ...r.data, usuario: { id: u.id, rol: u.rol } })
  } catch (e) {
    if (e instanceof ErrorVenta) return { error: e.message }
    console.error(e)
    return { error: 'No se pudo registrar la venta. Probá de nuevo.' }
  }
  revalidatePath('/caja')
  revalidatePath('/ventas')
  const config = await leerConfig(db())
  if (r.data.clienteId) revalidatePath(`/clientes/${r.data.clienteId}`)
  const salida: ResultadoCobro = {
    ventaId: res.ventaId,
    vuelto: res.vuelto,
    reintegro: res.reintegro,
    aFavor: res.aFavor,
    puedeFacturar: config.modo !== 'desactivada',
  }
  if (config.modo !== 'desactivada' && config.facturar_automatico) {
    // La venta ya está guardada: si la factura falla, se avisa y se puede reintentar.
    try {
      const c = await facturarVenta(db(), { ventaId: res.ventaId, receptor: CONSUMIDOR_FINAL, usuarioId: u.id })
      salida.comprobante = { id: c.id, tipo: c.tipo, simulado: c.simulado }
    } catch (e) {
      salida.errorFactura = (e as Error).message
    }
  }
  return salida
}

/** Factura a consumidor final desde la pantalla de cobro. */
export async function facturarConsumidorFinal(ventaId: number): Promise<{ comprobante?: { id: number; tipo: string; simulado: boolean }; error?: string }> {
  const u = await requerirVendedor()
  const [v] = await db()<{ usuario_id: number }[]>`select usuario_id from ventas where id = ${ventaId}`
  if (!v || (u.rol !== 'admin' && v.usuario_id !== u.id)) return { error: 'No encontramos la venta.' }
  try {
    const c = await facturarVenta(db(), { ventaId, receptor: CONSUMIDOR_FINAL, usuarioId: u.id })
    revalidatePath(`/ventas/${ventaId}`)
    return { comprobante: { id: c.id, tipo: c.tipo, simulado: c.simulado } }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export async function abrir(_: Resultado, f: FormData): Promise<Resultado> {
  const u = await requerirVendedor()
  const sucursalId = u.rol === 'admin' ? Number(f.get('sucursal_id')) : u.sucursal_id
  const monto = parseNumero(String(f.get('monto_inicial') ?? '').trim() || '0')
  if (!sucursalId) return { error: 'Elegí la sucursal.' }
  if (monto === null || monto < 0) return { error: 'El monto inicial no es válido.' }
  try {
    await abrirCaja(db(), { usuarioId: u.id, sucursalId, montoInicial: Math.round(monto * 100) / 100 })
  } catch (e) {
    if (e instanceof ErrorVenta) return { error: e.message }
    throw e
  }
  revalidatePath('/vender')
  revalidatePath('/caja')
  return { ok: 'Caja abierta.' }
}

export type VentaParaCambio = {
  ventaId: number
  creado: Date
  cliente: ClienteBuscado | null
  items: { ventaItemId: number; nombre: string; disponibles: number; unitario: number }[]
}

/** Para un cambio de producto: la venta original (por número o escaneando el ticket de cambio). */
export async function ventaParaCambio(q: string): Promise<{ venta?: VentaParaCambio; error?: string }> {
  const u = await requerirVendedor()
  const caja = await cajaAbierta(db(), u.id)
  if (!caja) return { error: 'La caja está cerrada.' }
  const id = Number(String(q ?? '').replace(/\D/g, ''))
  if (!id) return { error: 'Escaneá el ticket o escribí el número de venta.' }
  const sql = db()
  const [v] = await sql<{ id: number; creado: Date; estado: string; sucursal_id: number; cliente_id: number | null }[]>`
    select id, creado, estado, sucursal_id, cliente_id from ventas where id = ${id}`
  if (!v) return { error: `No existe la venta N.º ${id}.` }
  if (v.estado === 'anulada') return { error: `La venta N.º ${id} está anulada.` }
  if (u.rol !== 'admin' && v.sucursal_id !== caja.sucursal_id) return { error: 'Esa venta es de otra sucursal: el cambio se hace allá.' }
  const items = (await itemsDevolvibles(sql, id))
    .filter((i) => i.cantidad - i.devuelto > 0)
    .map((i) => ({ ventaItemId: i.id, nombre: i.nombre, disponibles: i.cantidad - i.devuelto, unitario: i.unitario }))
  if (!items.length) return { error: 'De esa venta ya se devolvió todo.' }
  let cliente: ClienteBuscado | null = null
  if (v.cliente_id) {
    const [c] = await sql<ClienteBuscado[]>`select id, nombre, telefono, doc_nro, limite_credito, 0 as saldo from clientes where id = ${v.cliente_id}`
    if (c) cliente = { ...c, saldo: await saldoCliente(sql, c.id) }
  }
  return { venta: { ventaId: v.id, creado: v.creado, cliente, items } }
}
