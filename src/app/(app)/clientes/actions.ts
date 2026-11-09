'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requerirVendedor } from '@/lib/dal'
import { entero, mensajeError, texto } from '@/lib/errores'
import { centavos, parseNumero } from '@/lib/numeros'
import { ajustarCuenta, ErrorVenta, registrarPagoCuenta, saldoCliente } from '@/lib/ventas'
import type { Resultado } from '@/components/form-accion'

export type ClienteBuscado = { id: number; nombre: string; telefono: string | null; doc_nro: string | null; saldo: number; limite_credito: number }

/** Para elegir la clienta en la caja: por nombre, teléfono o documento. */
export async function buscarClientes(q: string): Promise<ClienteBuscado[]> {
  await requerirVendedor()
  const sql = db()
  const t = String(q ?? '').trim().slice(0, 60)
  if (!t) return []
  const digitos = t.replace(/\D/g, '')
  const palabras = t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)
  return sql<ClienteBuscado[]>`
    select c.id, c.nombre, c.telefono, c.doc_nro, c.limite_credito,
      coalesce((select sum(monto) from cuenta_movimientos m where m.cliente_id = c.id), 0) as saldo
    from clientes c
    where c.activo and (
      (${palabras.length > 0} ${palabras.reduce((acc, w) => sql`${acc} and normalizar(c.nombre) like ${'%' + w + '%'}`, sql``)})
      ${digitos.length >= 4 ? sql`or regexp_replace(coalesce(c.telefono, ''), '\\D', '', 'g') like ${'%' + digitos + '%'} or c.doc_nro like ${digitos + '%'}` : sql``}
    )
    order by lower(c.nombre) limit 8`
}

/** Datos al día de una clienta (saldo y límite), para la caja. */
export async function clienteActual(id: number): Promise<ClienteBuscado | null> {
  await requerirVendedor()
  if (!Number.isInteger(id)) return null
  const [c] = await db()<ClienteBuscado[]>`
    select c.id, c.nombre, c.telefono, c.doc_nro, c.limite_credito,
      coalesce((select sum(monto) from cuenta_movimientos m where m.cliente_id = c.id), 0) as saldo
    from clientes c where c.id = ${id} and c.activo`
  return c ?? null
}

const Rapida = z.object({
  nombre: z.string().trim().min(2, 'Poné el nombre.').max(120),
  telefono: z.string().trim().max(40),
  docNro: z.string().trim().max(20),
})

/** Alta rápida desde la caja (nombre y, si quiere, teléfono y DNI). */
export async function crearClienteRapido(datos: z.input<typeof Rapida>): Promise<{ cliente?: ClienteBuscado; error?: string }> {
  await requerirVendedor()
  const r = Rapida.safeParse(datos)
  if (!r.success) return { error: r.error.issues[0]?.message }
  const doc = r.data.docNro.replace(/\D/g, '') || null
  try {
    const [c] = await db()<ClienteBuscado[]>`
      insert into clientes (nombre, telefono, doc_tipo, doc_nro, condicion_iva)
      values (${r.data.nombre}, ${r.data.telefono || null}, ${doc ? (doc.length === 11 ? 80 : 96) : 99}, ${doc}, 5)
      returning id, nombre, telefono, doc_nro, 0 as saldo, limite_credito`
    revalidatePath('/clientes')
    return { cliente: c }
  } catch (e) {
    return { error: mensajeError(e, 'Ya hay un cliente con ese documento.') }
  }
}

export async function guardarCliente(_: Resultado, f: FormData): Promise<Resultado> {
  const u = await requerirVendedor()
  const id = entero(f, 'id')
  const nombre = texto(f, 'nombre').replace(/\s+/g, ' ').slice(0, 120)
  const doc = texto(f, 'doc_nro').replace(/\D/g, '').slice(0, 11) || null
  const limite = parseNumero(texto(f, 'limite_credito') || '0')
  const errores: Record<string, string> = {}
  if (nombre.length < 2) errores.nombre = 'Poné el nombre.'
  if (doc && doc.length !== 11 && (doc.length < 7 || doc.length > 8)) errores.doc_nro = 'DNI de 7 u 8 números o CUIT de 11.'
  if (limite === null || limite < 0) errores.limite_credito = 'Monto no válido.'
  if (Object.keys(errores).length) return { error: 'Revisá los campos marcados.', errores }
  const datos = {
    nombre,
    telefono: texto(f, 'telefono').slice(0, 40) || null,
    email: texto(f, 'email').slice(0, 120) || null,
    domicilio: texto(f, 'domicilio').slice(0, 200) || null,
    notas: texto(f, 'notas').slice(0, 500) || null,
    doc_nro: doc,
    doc_tipo: doc ? (doc.length === 11 ? 80 : 96) : 99,
    condicion_iva: Number(texto(f, 'condicion_iva')) || 5,
  }
  let nuevoId = id
  try {
    if (id) {
      await db()`update clientes set ${db()(datos)} where id = ${id}`
      // El límite de cuenta corriente y la baja los maneja solo la administradora.
      if (u.rol === 'admin')
        await db()`update clientes set limite_credito = ${centavos(limite!)}, activo = ${f.get('activo') === 'on'} where id = ${id}`
    } else {
      const [c] = await db()<{ id: number }[]>`
        insert into clientes ${db()({ ...datos, limite_credito: u.rol === 'admin' ? centavos(limite!) : 0 })} returning id`
      nuevoId = c.id
    }
  } catch (e) {
    const msg = mensajeError(e, 'Ya hay un cliente con ese documento.')
    return { error: msg, errores: (e as { code?: string }).code === '23505' ? { doc_nro: msg } : undefined }
  }
  revalidatePath('/clientes')
  if (!id) redirect(`/clientes/${nuevoId}`)
  revalidatePath(`/clientes/${id}`)
  return { ok: 'Cambios guardados.' }
}

export async function pagarCuenta(_: Resultado, f: FormData): Promise<Resultado> {
  const u = await requerirVendedor()
  const clienteId = entero(f, 'cliente_id')
  const monto = parseNumero(texto(f, 'monto'))
  const medio = texto(f, 'medio')
  if (!clienteId) return { error: 'Falta el cliente.' }
  if (monto === null || monto <= 0) return { error: 'Poné el monto que paga.', errores: { monto: 'Monto no válido.' } }
  if (!['efectivo', 'transferencia', 'debito', 'credito'].includes(medio)) return { error: 'Elegí cómo paga.' }
  try {
    const r = await registrarPagoCuenta(db(), {
      clienteId,
      usuario: { id: u.id, rol: u.rol },
      monto: centavos(monto),
      medio: medio as 'efectivo',
      nota: texto(f, 'nota') || null,
    })
    revalidatePath(`/clientes/${clienteId}`)
    revalidatePath('/caja')
    return { ok: r.saldo > 0 ? `Pago registrado. Le queda debiendo ${r.saldo.toLocaleString('es-AR')}.` : r.saldo < 0 ? 'Pago registrado. Le queda saldo a favor.' : 'Pago registrado. La cuenta quedó en cero.' }
  } catch (e) {
    if (e instanceof ErrorVenta) return { error: e.message }
    throw e
  }
}

export async function ajustarSaldo(_: Resultado, f: FormData): Promise<Resultado> {
  const u = await requerirVendedor()
  const clienteId = entero(f, 'cliente_id')
  const monto = parseNumero(texto(f, 'monto'))
  const sentido = texto(f, 'sentido') === 'favor' ? -1 : 1
  if (!clienteId || monto === null || monto <= 0) return { error: 'Poné un monto válido.' }
  try {
    await ajustarCuenta(db(), { clienteId, usuario: { id: u.id, rol: u.rol }, monto: centavos(monto) * sentido, nota: texto(f, 'nota') })
  } catch (e) {
    if (e instanceof ErrorVenta) return { error: e.message }
    throw e
  }
  revalidatePath(`/clientes/${clienteId}`)
  return { ok: `Ajuste registrado. Saldo: ${(await saldoCliente(db(), clienteId)).toLocaleString('es-AR')}.` }
}
