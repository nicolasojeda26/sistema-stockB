'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { requerirPermiso } from '@/lib/dal'
import { entero, texto } from '@/lib/errores'
import { parseNumero } from '@/lib/numeros'
import { cambiarEstadoReparacion, ErrorReparacion, ingresarReparacion, type CambioEstado } from '@/lib/reparaciones'
import type { Resultado } from '@/components/form-accion'

const quien = (u: { id: number; rol: 'admin' | 'vendedora' | 'deposito'; sucursal_id: number | null }) => ({ id: u.id, rol: u.rol, sucursal_id: u.sucursal_id })

export async function nuevaReparacion(_: Resultado, f: FormData): Promise<Resultado> {
  const u = await requerirPermiso('reparaciones')
  const presupuestoTexto = texto(f, 'presupuesto')
  const presupuesto = presupuestoTexto ? parseNumero(presupuestoTexto) : null
  if (presupuestoTexto && (presupuesto === null || presupuesto < 0)) return { error: 'El presupuesto no es válido.', errores: { presupuesto: 'No válido' } }
  const prometido = texto(f, 'prometido')
  let id: number
  try {
    id = await ingresarReparacion(db(), {
      usuario: quien(u),
      sucursalId: u.rol === 'admin' ? (entero(f, 'sucursal_id') ?? 0) : (u.sucursal_id ?? 0),
      clienteNombre: texto(f, 'cliente_nombre'),
      clienteTelefono: texto(f, 'cliente_telefono'),
      equipo: texto(f, 'equipo'),
      imei: texto(f, 'imei'),
      falla: String(f.get('falla') ?? ''),
      estadoEquipo: String(f.get('estado_equipo') ?? ''),
      presupuesto: presupuesto === null ? null : Math.round(presupuesto * 100) / 100,
      prometido: /^\d{4}-\d{2}-\d{2}$/.test(prometido) ? prometido : null,
    })
  } catch (e) {
    if (e instanceof ErrorReparacion) return { error: e.message }
    throw e
  }
  revalidatePath('/reparaciones')
  redirect(`/reparaciones/${id}?nueva=1`)
}

export async function cambiarEstado(id: number, cambio: CambioEstado): Promise<{ error?: string }> {
  const u = await requerirPermiso('reparaciones')
  try {
    await cambiarEstadoReparacion(db(), { usuario: quien(u), id, cambio })
  } catch (e) {
    if (e instanceof ErrorReparacion) return { error: e.message }
    console.error(e)
    return { error: 'No se pudo guardar. Probá de nuevo.' }
  }
  revalidatePath('/reparaciones')
  revalidatePath(`/reparaciones/${id}`)
  return {}
}
