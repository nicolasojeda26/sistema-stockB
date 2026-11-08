'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { requerirAdmin } from '@/lib/dal'
import { entero, marcado, mensajeError, texto } from '@/lib/errores'
import { centavos, parseNumero } from '@/lib/numeros'
import { ajustarCuentaProveedor, ErrorCompra, MEDIOS_PROVEEDOR, registrarPagoProveedor, type MedioProveedor } from '@/lib/compras'
import type { Resultado } from '@/components/form-accion'

export type ProveedorCorto = { id: number; nombre: string; cuit: string | null }

const cuitValido = (c: string) => c.length === 11

export async function guardarProveedor(_: Resultado, f: FormData): Promise<Resultado> {
  await requerirAdmin()
  const id = entero(f, 'id')
  const nombre = texto(f, 'nombre').replace(/\s+/g, ' ').slice(0, 120)
  const cuit = texto(f, 'cuit').replace(/\D/g, '') || null
  const errores: Record<string, string> = {}
  if (nombre.length < 2) errores.nombre = 'Poné el nombre.'
  if (cuit && !cuitValido(cuit)) errores.cuit = 'El CUIT tiene 11 números.'
  if (Object.keys(errores).length) return { error: 'Revisá los campos marcados.', errores }
  const datos = {
    nombre,
    cuit,
    condicion_iva: Number(texto(f, 'condicion_iva')) || null,
    telefono: texto(f, 'telefono').slice(0, 40) || null,
    email: texto(f, 'email').slice(0, 120) || null,
    contacto: texto(f, 'contacto').slice(0, 120) || null,
    notas: texto(f, 'notas').slice(0, 500) || null,
  }
  let nuevoId = id
  try {
    if (id) await db()`update proveedores set ${db()({ ...datos, activo: marcado(f, 'activo') })} where id = ${id}`
    else {
      const [p] = await db()<{ id: number }[]>`insert into proveedores ${db()(datos)} returning id`
      nuevoId = p.id
    }
  } catch (e) {
    const msg = mensajeError(e, 'Ya hay un proveedor con ese nombre o CUIT.')
    return { error: msg }
  }
  revalidatePath('/proveedores')
  if (!id) redirect(`/proveedores/${nuevoId}`)
  revalidatePath(`/proveedores/${id}`)
  return { ok: 'Cambios guardados.' }
}

/** Alta rápida desde la carga de una compra. */
export async function crearProveedorRapido(nombre: string, cuit: string): Promise<{ proveedor?: ProveedorCorto; error?: string }> {
  await requerirAdmin()
  const n = String(nombre ?? '').trim().replace(/\s+/g, ' ').slice(0, 120)
  const c = String(cuit ?? '').replace(/\D/g, '') || null
  if (n.length < 2) return { error: 'Poné el nombre del proveedor.' }
  if (c && !cuitValido(c)) return { error: 'El CUIT tiene 11 números.' }
  try {
    const [p] = await db()<ProveedorCorto[]>`insert into proveedores (nombre, cuit) values (${n}, ${c}) returning id, nombre, cuit`
    revalidatePath('/proveedores')
    return { proveedor: p }
  } catch (e) {
    return { error: mensajeError(e, 'Ya hay un proveedor con ese nombre o CUIT.') }
  }
}

export async function pagarProveedor(_: Resultado, f: FormData): Promise<Resultado> {
  const u = await requerirAdmin()
  const proveedorId = entero(f, 'proveedor_id')
  const monto = parseNumero(texto(f, 'monto'))
  const medio = texto(f, 'medio') as MedioProveedor
  if (!proveedorId) return { error: 'Falta el proveedor.' }
  if (monto === null || monto <= 0) return { error: 'Poné el monto.', errores: { monto: 'Monto no válido.' } }
  if (!(medio in MEDIOS_PROVEEDOR)) return { error: 'Elegí cómo se paga.' }
  try {
    const r = await registrarPagoProveedor(db(), {
      proveedorId,
      usuario: { id: u.id, rol: u.rol },
      monto: centavos(monto),
      medio,
      desdeCaja: medio === 'efectivo' && marcado(f, 'desde_caja'),
      nota: texto(f, 'nota') || null,
    })
    revalidatePath(`/proveedores/${proveedorId}`)
    revalidatePath('/proveedores')
    revalidatePath('/caja')
    return { ok: r.saldo > 0 ? 'Pago registrado. Todavía le debés plata.' : r.saldo < 0 ? 'Pago registrado. Quedó saldo a tu favor.' : 'Pago registrado. La cuenta quedó en cero.' }
  } catch (e) {
    if (e instanceof ErrorCompra) return { error: e.message }
    throw e
  }
}

export async function ajustarProveedor(_: Resultado, f: FormData): Promise<Resultado> {
  const u = await requerirAdmin()
  const proveedorId = entero(f, 'proveedor_id')
  const monto = parseNumero(texto(f, 'monto'))
  const tipo = texto(f, 'tipo')
  if (!proveedorId || monto === null || monto <= 0) return { error: 'Poné un monto válido.' }
  try {
    await ajustarCuentaProveedor(db(), {
      proveedorId,
      usuario: { id: u.id, rol: u.rol },
      tipo: tipo === 'nota_credito' ? 'nota_credito' : 'ajuste',
      // Ajuste: "deuda" suma a lo que le debemos; "favor" resta.
      monto: tipo === 'favor' ? -centavos(monto) : centavos(monto),
      nota: texto(f, 'nota'),
    })
  } catch (e) {
    if (e instanceof ErrorCompra) return { error: e.message }
    throw e
  }
  revalidatePath(`/proveedores/${proveedorId}`)
  revalidatePath('/proveedores')
  return { ok: 'Registrado.' }
}
