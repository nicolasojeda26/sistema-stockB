'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requerirAdmin, requerirUsuario } from '@/lib/dal'
import { anularVenta, ErrorVenta, marcarRetirada, registrarDevolucion } from '@/lib/ventas'
import { CONSUMIDOR_FINAL, ErrorFactura, facturaDeVenta, facturarVenta, guardarCliente, notaDeCredito, type Receptor } from '@/lib/arca/facturacion'
import type { Resultado } from '@/components/form-accion'

const refrescar = (id: number) => {
  revalidatePath(`/ventas/${id}`)
  revalidatePath('/ventas')
  revalidatePath('/caja')
  revalidatePath('/comprobantes')
}

/** La vendedora solo opera sobre ventas de su sucursal. */
async function ventaPermitida(ventaId: number) {
  const u = await requerirUsuario()
  const [v] = await db()<{ sucursal_id: number }[]>`select sucursal_id from ventas where id = ${ventaId}`
  if (!v || (u.rol !== 'admin' && v.sucursal_id !== u.sucursal_id)) throw new ErrorVenta('No encontramos esa venta.')
  return u
}

export async function anular(_: Resultado, f: FormData): Promise<Resultado> {
  const u = await requerirAdmin()
  const id = Number(f.get('id'))
  const motivo = String(f.get('motivo') ?? '').trim()
  if (!Number.isInteger(id)) return { error: 'Falta la venta.' }
  if (!motivo) return { error: 'Contá por qué se anula.' }
  try {
    const [v] = await db()<{ estado: string; total: number; devs: number }[]>`
      select estado, total, (select count(*)::int from devoluciones d where d.venta_id = v.id) as devs from ventas v where id = ${id}`
    if (!v || v.estado === 'anulada') return { error: 'La venta no existe o ya está anulada.' }
    if (v.devs > 0) return { error: 'Esta venta ya tiene devoluciones: devolvé lo que queda en lugar de anularla.' }
    // Si estaba facturada, primero la nota de crédito: sin ella no se anula.
    await notaDeCredito(db(), { ventaId: id, total: Number(v.total), usuarioId: u.id })
    await anularVenta(db(), { ventaId: id, usuarioId: u.id, motivo })
  } catch (e) {
    if (e instanceof ErrorVenta || e instanceof ErrorFactura) return { error: e.message }
    throw e
  }
  refrescar(id)
  return { ok: 'Venta anulada. El stock volvió al local.' }
}

const ReceptorZ = z.object({
  docTipo: z.number().int(),
  docNro: z.string().trim().max(20),
  nombre: z.string().trim().max(120).nullable(),
  condicionIva: z.number().int(),
  domicilio: z.string().trim().max(200).nullable().optional(),
})

export async function facturar(ventaId: number, receptor: z.input<typeof ReceptorZ> | null): Promise<{ id?: number; error?: string }> {
  try {
    const u = await ventaPermitida(ventaId)
    const r: Receptor = receptor ? ReceptorZ.parse({ ...receptor, docNro: receptor.docNro.replace(/\D/g, '') }) : CONSUMIDOR_FINAL
    const c = await facturarVenta(db(), { ventaId, receptor: r, usuarioId: u.id })
    await guardarCliente(db(), r)
    refrescar(ventaId)
    return { id: c.id }
  } catch (e) {
    refrescar(ventaId)
    if (e instanceof ErrorVenta || e instanceof ErrorFactura) return { error: e.message }
    if (e instanceof z.ZodError) return { error: 'Revisá los datos del cliente.' }
    console.error(e)
    return { error: 'No se pudo facturar. Probá de nuevo.' }
  }
}

export async function buscarCliente(docTipo: number, docNro: string) {
  await requerirUsuario()
  const [c] = await db()<{ nombre: string; condicion_iva: number; domicilio: string | null }[]>`
    select nombre, condicion_iva, domicilio from clientes where doc_tipo = ${docTipo} and doc_nro = ${docNro.replace(/\D/g, '')}`
  return c ?? null
}

export async function devolver(datos: {
  ventaId: number
  items: { ventaItemId: number; cantidad: number }[]
  medio: 'efectivo' | 'transferencia' | 'debito' | 'credito' | 'cuenta_corriente'
  motivo: string
}): Promise<{ ok?: string; error?: string; avisoFactura?: string }> {
  let u
  try {
    u = await ventaPermitida(datos.ventaId)
  } catch (e) {
    return { error: (e as Error).message }
  }
  let dev
  try {
    dev = await registrarDevolucion(db(), { ...datos, usuario: { id: u.id, rol: u.rol } })
  } catch (e) {
    if (e instanceof ErrorVenta) return { error: e.message }
    throw e
  }
  refrescar(datos.ventaId)
  revalidatePath('/clientes')
  // La nota de crédito va aparte: si ARCA falla, la devolución queda hecha y se reintenta.
  try {
    await notaDeCredito(db(), { ventaId: datos.ventaId, devolucionId: dev.devolucionId, total: dev.total, usuarioId: u.id })
  } catch (e) {
    return { ok: 'Devolución registrada.', avisoFactura: `No se pudo emitir la nota de crédito: ${(e as Error).message} Podés reintentarla desde esta pantalla.` }
  }
  return { ok: 'Devolución registrada.' }
}

export async function reintentarNotaCredito(devolucionId: number): Promise<{ error?: string }> {
  const [d] = await db()<{ venta_id: number; total: number }[]>`select venta_id, total from devoluciones where id = ${devolucionId}`
  if (!d) return { error: 'La devolución no existe.' }
  try {
    const u = await ventaPermitida(d.venta_id)
    const [ya] = await db()`select 1 from comprobantes where devolucion_id = ${devolucionId} and estado = 'autorizado'`
    if (ya) return {}
    if (!(await facturaDeVenta(db(), d.venta_id))) return { error: 'La venta no tiene factura.' }
    await notaDeCredito(db(), { ventaId: d.venta_id, devolucionId, total: Number(d.total), usuarioId: u.id })
  } catch (e) {
    return { error: (e as Error).message }
  } finally {
    refrescar(d.venta_id)
  }
  return {}
}

export async function retirar(ventaId: number): Promise<{ error?: string }> {
  try {
    const u = await ventaPermitida(ventaId)
    await marcarRetirada(db(), { ventaId, usuario: { id: u.id, rol: u.rol }, sucursalId: u.sucursal_id })
  } catch (e) {
    return { error: (e as Error).message }
  }
  refrescar(ventaId)
  return {}
}
