'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { requerirAdmin, requerirUsuario } from '@/lib/dal'
import { parseNumero } from '@/lib/numeros'
import { cajaAbierta, cerrarCaja, ErrorVenta, movimientoCaja } from '@/lib/ventas'
import type { Resultado } from '@/components/form-accion'

export async function registrarMovimiento(_: Resultado, f: FormData): Promise<Resultado> {
  const u = await requerirUsuario()
  const caja = await cajaAbierta(db(), u.id)
  if (!caja) return { error: 'No tenés una caja abierta.' }
  const tipo = f.get('tipo') === 'ingreso' ? 'ingreso' : 'retiro'
  const monto = parseNumero(String(f.get('monto') ?? ''))
  try {
    await movimientoCaja(db(), { cajaId: caja.id, usuarioId: u.id, tipo, monto: monto === null ? NaN : Math.round(monto * 100) / 100, motivo: String(f.get('motivo') ?? '') })
  } catch (e) {
    if (e instanceof ErrorVenta) return { error: e.message }
    throw e
  }
  revalidatePath('/caja')
  return { ok: tipo === 'retiro' ? 'Retiro registrado.' : 'Ingreso registrado.' }
}

export async function cerrar(_: Resultado, f: FormData): Promise<Resultado> {
  const u = await requerirUsuario()
  const caja = await cajaAbierta(db(), u.id)
  if (!caja) return { error: 'No tenés una caja abierta.' }
  const contado = parseNumero(String(f.get('contado') ?? ''))
  if (contado === null) return { error: 'Poné cuánto efectivo contaste en la caja.' }
  try {
    await cerrarCaja(db(), { cajaId: caja.id, usuarioId: u.id, efectivoContado: Math.round(contado * 100) / 100, nota: String(f.get('nota') ?? '').trim() || null })
  } catch (e) {
    if (e instanceof ErrorVenta) return { error: e.message }
    throw e
  }
  revalidatePath('/caja')
  redirect(`/caja/${caja.id}?cerrada=1`)
}

/** La administradora cierra una caja que alguien dejó abierta. */
export async function cerrarOtra(_: Resultado, f: FormData): Promise<Resultado> {
  const u = await requerirAdmin()
  const cajaId = Number(f.get('caja_id'))
  const contado = parseNumero(String(f.get('contado') ?? ''))
  if (!Number.isInteger(cajaId)) return { error: 'Falta la caja.' }
  if (contado === null) return { error: 'Poné cuánto efectivo hay en esa caja.' }
  try {
    const nota = String(f.get('nota') ?? '').trim()
    await cerrarCaja(db(), { cajaId, usuarioId: u.id, efectivoContado: Math.round(contado * 100) / 100, nota: `Cerrada por ${u.nombre}${nota ? `: ${nota}` : ''}` })
  } catch (e) {
    if (e instanceof ErrorVenta) return { error: e.message }
    throw e
  }
  revalidatePath('/caja')
  revalidatePath(`/caja/${cajaId}`)
  return { ok: 'Caja cerrada.' }
}
