import 'server-only'
import { db } from './db'
import type { Usuario } from './dal'

export type DepositoOpcion = { id: number; nombre: string; sucursal_id: number | null; es_principal: boolean; propio: boolean }

/**
 * Depósitos activos con un nombre para mostrar ("Centro · Local").
 * `propio` = la usuaria puede sacar o cargar mercadería ahí:
 * la administradora en todos; la vendedora, solo en los de su sucursal.
 */
export async function depositosPara(u: Usuario): Promise<DepositoOpcion[]> {
  const filas = await db()<Omit<DepositoOpcion, 'propio'>[]>`
    select d.id, coalesce(s.nombre, 'Central') || ' · ' || d.nombre as nombre, d.sucursal_id, d.es_principal
    from depositos d left join sucursales s on s.id = d.sucursal_id
    where d.activo and (s.id is null or s.activa)
    order by (d.sucursal_id is not distinct from ${u.sucursal_id}) desc, s.nombre nulls last, d.es_principal desc, d.nombre`
  return filas.map((d) => ({ ...d, propio: u.rol === 'admin' || d.sucursal_id === u.sucursal_id }))
}

export async function puedeUsarDeposito(u: Usuario, depositoId: number): Promise<boolean> {
  if (u.rol === 'admin') return true
  const [d] = await db()`select 1 from depositos where id = ${depositoId} and activo and sucursal_id = ${u.sucursal_id}`
  return !!d
}
