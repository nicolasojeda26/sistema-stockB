'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requerirAdmin, requerirVendedor } from '@/lib/dal'
import { entero, marcado, texto } from '@/lib/errores'
import { centavos, parseNumero } from '@/lib/numeros'
import { anularGasto, ErrorCompra, registrarGasto, type MedioGasto } from '@/lib/compras'
import { MEDIOS_GASTO } from '@/lib/compras-tipos'
import { hoyAR } from '@/lib/formato'
import type { Resultado } from '@/components/form-accion'

export async function cargarGasto(_: Resultado, f: FormData): Promise<Resultado> {
  const u = await requerirVendedor()
  const monto = parseNumero(texto(f, 'monto'))
  const medio = (u.rol === 'admin' ? texto(f, 'medio') : 'efectivo') as MedioGasto
  const fecha = u.rol === 'admin' ? texto(f, 'fecha') || hoyAR() : hoyAR()
  if (monto === null || monto <= 0) return { error: 'Poné el monto.', errores: { monto: 'Monto no válido.' } }
  if (!(medio in MEDIOS_GASTO)) return { error: 'Elegí cómo se pagó.' }
  if (fecha > hoyAR()) return { error: 'La fecha no puede ser futura.', errores: { fecha: 'Fecha futura.' } }
  try {
    await registrarGasto(db(), {
      usuario: { id: u.id, rol: u.rol, sucursal_id: u.sucursal_id },
      sucursalId: entero(f, 'sucursal_id') || null,
      fecha,
      categoria: texto(f, 'categoria'),
      descripcion: texto(f, 'descripcion') || null,
      monto: centavos(monto),
      medio,
      desdeCaja: u.rol !== 'admin' || (medio === 'efectivo' && marcado(f, 'desde_caja')),
    })
  } catch (e) {
    if (e instanceof ErrorCompra) return { error: e.message }
    throw e
  }
  revalidatePath('/gastos')
  revalidatePath('/caja')
  return { ok: 'Gasto registrado.' }
}

export async function anular(gastoId: number): Promise<{ error?: string }> {
  const u = await requerirAdmin()
  try {
    await anularGasto(db(), { gastoId, usuario: { id: u.id, rol: u.rol } })
  } catch (e) {
    if (e instanceof ErrorCompra) return { error: e.message }
    throw e
  }
  revalidatePath('/gastos')
  revalidatePath('/caja')
  return {}
}
