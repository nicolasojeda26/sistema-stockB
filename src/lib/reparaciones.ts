import type { Sql, TransactionSql } from 'postgres'

type Tx = Sql | TransactionSql
type Quien = { id: number; rol: 'admin' | 'vendedora' | 'deposito'; sucursal_id: number | null }

export class ErrorReparacion extends Error {}

export const ESTADOS_REPARACION = {
  ingresado: { texto: 'Ingresado', tono: 'neutro' },
  en_reparacion: { texto: 'En reparación', tono: 'alerta' },
  listo: { texto: 'Listo para retirar', tono: 'ok' },
  sin_reparacion: { texto: 'Sin reparación', tono: 'error' },
  entregado: { texto: 'Entregado', tono: 'apagado' },
  cancelado: { texto: 'Cancelado', tono: 'apagado' },
} as const
export type EstadoReparacion = keyof typeof ESTADOS_REPARACION

/** Estados en los que el equipo sigue en el local. */
export const EN_LOCAL: EstadoReparacion[] = ['ingresado', 'en_reparacion', 'listo', 'sin_reparacion']

export const numeroReparacion = (id: number) => `R-${String(id).padStart(5, '0')}`

const limpiar = (s: string | null | undefined, max: number) => {
  const t = String(s ?? '').trim().replace(/\s+/g, ' ')
  return t ? t.slice(0, max) : null
}

export type DatosIngreso = {
  usuario: Quien
  sucursalId: number
  clienteNombre: string
  clienteTelefono?: string | null
  equipo: string
  imei?: string | null
  falla: string
  estadoEquipo?: string | null
  presupuesto?: number | null
  prometido?: string | null
}

/** Toma de equipo: queda registrado con número, para imprimir el comprobante al cliente. */
export async function ingresarReparacion(sql: Sql, d: DatosIngreso): Promise<number> {
  const nombre = limpiar(d.clienteNombre, 120)
  const equipo = limpiar(d.equipo, 120)
  const falla = String(d.falla ?? '').trim().slice(0, 1000)
  if (!nombre) throw new ErrorReparacion('Poné el nombre del cliente.')
  if (!equipo) throw new ErrorReparacion('Poné la marca y el modelo del equipo.')
  if (!falla) throw new ErrorReparacion('Contá qué le pasa al equipo.')
  if (d.presupuesto != null && !(d.presupuesto >= 0)) throw new ErrorReparacion('El presupuesto no es válido.')
  if (d.usuario.rol !== 'admin' && d.usuario.sucursal_id !== d.sucursalId) throw new ErrorReparacion('Solo podés recibir equipos en tu sucursal.')
  return sql.begin(async (tx) => {
    const [s] = await tx<{ tipo: string; activa: boolean }[]>`select tipo, activa from sucursales where id = ${d.sucursalId}`
    if (!s?.activa) throw new ErrorReparacion('Elegí la sucursal.')
    const [r] = await tx<{ id: number }[]>`
      insert into reparaciones (sucursal_id, cliente_nombre, cliente_telefono, equipo, imei, falla, estado_equipo, presupuesto, prometido, recibido_por)
      values (${d.sucursalId}, ${nombre}, ${limpiar(d.clienteTelefono, 40)}, ${equipo}, ${limpiar(d.imei, 40)}, ${falla},
        ${String(d.estadoEquipo ?? '').trim().slice(0, 1000) || null}, ${d.presupuesto ?? null}, ${d.prometido || null}, ${d.usuario.id})
      returning id`
    await tx`insert into reparacion_eventos (reparacion_id, estado, nota, usuario_id) values (${r.id}, 'ingresado', null, ${d.usuario.id})`
    return r.id
  })
}

async function leerParaCambiar(tx: Tx, id: number, u: Quien) {
  const [r] = await tx<{ id: number; sucursal_id: number; estado: EstadoReparacion; precio: number | null }[]>`
    select id, sucursal_id, estado, precio from reparaciones where id = ${id} for update`
  if (!r || (u.rol !== 'admin' && r.sucursal_id !== u.sucursal_id)) throw new ErrorReparacion('No encontramos esa reparación.')
  return r
}

export type CambioEstado =
  | { accion: 'empezar'; nota?: string | null }
  | { accion: 'listo'; precio: number; diagnostico?: string | null }
  | { accion: 'sin_reparacion'; precio?: number | null; diagnostico?: string | null }
  | { accion: 'entregar_sin_cobro'; nota?: string | null }
  | { accion: 'cancelar'; nota?: string | null }
  | { accion: 'nota'; nota: string }

/** Avanza la reparación. El cobro no pasa por acá: se hace en la caja y la marca como entregada. */
export async function cambiarEstadoReparacion(sql: Sql, d: { usuario: Quien; id: number; cambio: CambioEstado }) {
  return sql.begin(async (tx) => {
    const r = await leerParaCambiar(tx, d.id, d.usuario)
    const c = d.cambio
    const evento = (estado: string, nota: string | null) =>
      tx`insert into reparacion_eventos (reparacion_id, estado, nota, usuario_id) values (${r.id}, ${estado}, ${nota}, ${d.usuario.id})`
    if (r.estado === 'entregado' || r.estado === 'cancelado') {
      if (c.accion !== 'nota') throw new ErrorReparacion('Esta reparación ya está cerrada.')
    }
    switch (c.accion) {
      case 'empezar':
        if (r.estado !== 'ingresado') throw new ErrorReparacion('Ya está en reparación o terminada.')
        await tx`update reparaciones set estado = 'en_reparacion', actualizado = now() where id = ${r.id}`
        await evento('en_reparacion', limpiar(c.nota, 500))
        break
      case 'listo': {
        if (!(c.precio > 0)) throw new ErrorReparacion('Poné cuánto se cobra.')
        if (!['ingresado', 'en_reparacion', 'listo', 'sin_reparacion'].includes(r.estado)) throw new ErrorReparacion('No se puede marcar como lista.')
        const diag = String(c.diagnostico ?? '').trim().slice(0, 1000) || null
        await tx`
          update reparaciones set estado = 'listo', precio = ${c.precio}, diagnostico = coalesce(${diag}, diagnostico),
            listo_en = coalesce(listo_en, now()), actualizado = now()
          where id = ${r.id}`
        await evento('listo', diag)
        break
      }
      case 'sin_reparacion': {
        const diag = String(c.diagnostico ?? '').trim().slice(0, 1000) || null
        if (c.precio != null && !(c.precio >= 0)) throw new ErrorReparacion('El importe no es válido.')
        await tx`
          update reparaciones set estado = 'sin_reparacion', precio = ${c.precio && c.precio > 0 ? c.precio : null},
            diagnostico = coalesce(${diag}, diagnostico), listo_en = coalesce(listo_en, now()), actualizado = now()
          where id = ${r.id}`
        await evento('sin_reparacion', diag)
        break
      }
      case 'entregar_sin_cobro':
        if (!['listo', 'sin_reparacion'].includes(r.estado)) throw new ErrorReparacion('Primero marcala como lista o sin reparación.')
        if (r.precio && Number(r.precio) > 0) throw new ErrorReparacion('Tiene un importe a cobrar: cobrala en la caja.')
        await tx`update reparaciones set estado = 'entregado', entregado_en = now(), entregado_por = ${d.usuario.id}, actualizado = now() where id = ${r.id}`
        await evento('entregado', limpiar(c.nota, 500) ?? 'Entregado sin cobro.')
        break
      case 'cancelar':
        if (!['ingresado', 'en_reparacion'].includes(r.estado)) throw new ErrorReparacion('Solo se cancela antes de terminarla.')
        await tx`update reparaciones set estado = 'cancelado', actualizado = now() where id = ${r.id}`
        await evento('cancelado', limpiar(c.nota, 500))
        break
      case 'nota': {
        const nota = limpiar(c.nota, 500)
        if (!nota) throw new ErrorReparacion('Escribí la nota.')
        await evento(r.estado, nota)
        break
      }
    }
  })
}

/** Datos para cobrar en la caja: solo las listas (o sin reparación con importe) de esa sucursal. */
export type ReparacionCobrable = { id: number; equipo: string; falla: string; cliente_nombre: string; cliente_telefono: string | null; precio: number }

export async function reparacionesCobrables(sql: Tx, sucursalId: number, q = ''): Promise<ReparacionCobrable[]> {
  const texto = q.trim().slice(0, 60)
  const num = Number(texto.replace(/^r-?/i, '').replace(/\D/g, ''))
  return sql<ReparacionCobrable[]>`
    select id, equipo, falla, cliente_nombre, cliente_telefono, precio from reparaciones
    where sucursal_id = ${sucursalId} and estado in ('listo', 'sin_reparacion') and precio > 0
      ${texto ? sql`and (${num ? sql`id = ${num} or` : sql``} cliente_nombre ilike ${'%' + texto + '%'} or equipo ilike ${'%' + texto + '%'} or cliente_telefono ilike ${'%' + texto + '%'})` : sql``}
    order by listo_en nulls last, id limit 20`
}

/** Texto de la línea de la venta. */
export const lineaReparacion = (r: { id: number; equipo: string; falla: string }) =>
  `Reparación ${numeroReparacion(r.id)} · ${r.equipo} · ${r.falla.replace(/\s+/g, ' ').slice(0, 60)}`

/** Link de WhatsApp para avisar al cliente (Argentina: 54 9 + característica + número). */
export function linkWhatsApp(telefono: string | null, texto: string): string | null {
  if (!telefono) return null
  let n = telefono.replace(/\D/g, '')
  if (n.length < 8) return null
  if (n.startsWith('54')) n = n.slice(2)
  if (n.startsWith('0')) n = n.slice(1)
  n = n.replace(/^(\d{2,4})15(\d{6,8})$/, '$1$2')
  if (!n.startsWith('9')) n = '9' + n
  return `https://wa.me/54${n}?text=${encodeURIComponent(texto)}`
}
