import type { Sql, TransactionSql } from 'postgres'
import { ErrorStock, registrarOperacionTx } from './stock'
import { puedeEn } from './permisos'

/**
 * Pedidos y envíos entre el depósito y las sucursales.
 * - La sucursal pide (pedido).
 * - Quien envía arma el envío: la mercadería sale del origen y queda en el depósito interno "En camino".
 * - La sucursal cuenta lo que llegó y confirma: entra lo contado. Si no coincide, queda "con diferencias"
 *   y la administración decide (se perdió o vuelve al origen).
 */

export class ErrorEnvio extends Error {}

type Quien = { id: number; rol: 'admin' | 'vendedora' | 'deposito'; sucursal_id: number | null; permisos?: readonly string[] }
type Tx = Sql | TransactionSql
type Item = { productoId: number; cantidad: number }

export async function depositoTransito(sql: Tx): Promise<number> {
  const [d] = await sql<{ id: number }[]>`select id from depositos where es_transito`
  if (!d) throw new ErrorEnvio('Falta el depósito "En camino" (migración 012).')
  return d.id
}

function unificar(items: Item[]): Item[] {
  const m = new Map<number, number>()
  for (const i of items) {
    if (!Number.isInteger(i.cantidad) || i.cantidad <= 0) throw new ErrorEnvio('Hay una cantidad no válida.')
    m.set(i.productoId, (m.get(i.productoId) ?? 0) + i.cantidad)
  }
  if (!m.size) throw new ErrorEnvio('La lista está vacía.')
  return [...m].map(([productoId, cantidad]) => ({ productoId, cantidad }))
}

async function sucursalDe(sql: Tx, depositoId: number) {
  const [d] = await sql<{ sucursal_id: number | null; activo: boolean; es_transito: boolean }[]>`
    select sucursal_id, activo, es_transito from depositos where id = ${depositoId}`
  if (!d || !d.activo || d.es_transito) throw new ErrorEnvio('El depósito no existe o está inactivo.')
  return d.sucursal_id
}

// ── Pedidos ─────────────────────────────────────────────────────────────

export async function crearPedido(sql: Sql, d: { usuario: Quien; items: Item[]; nota?: string | null; sucursalId?: number | null }) {
  const sucursalId = d.usuario.rol === 'admin' ? (d.sucursalId ?? d.usuario.sucursal_id) : d.usuario.sucursal_id
  if (!sucursalId) throw new ErrorEnvio('Elegí para qué sucursal es el pedido.')
  if (d.usuario.rol === 'deposito' || !puedeEn(d.usuario, 'pedidos')) throw new ErrorEnvio('Los pedidos los hacen las sucursales.')
  const items = unificar(d.items)
  return sql.begin(async (tx) => {
    const [dep] = await tx<{ id: number; tipo: string }[]>`
      select d.id, s.tipo from depositos d join sucursales s on s.id = d.sucursal_id
      where d.sucursal_id = ${sucursalId} and d.es_principal and d.activo and s.activa`
    if (!dep) throw new ErrorEnvio('La sucursal no tiene depósito principal.')
    if (dep.tipo === 'deposito') throw new ErrorEnvio('El depósito no se hace pedidos a sí mismo.')
    const [p] = await tx<{ id: number }[]>`
      insert into pedidos (sucursal_id, deposito_id, nota, usuario_id)
      values (${sucursalId}, ${dep.id}, ${d.nota?.trim().slice(0, 300) || null}, ${d.usuario.id}) returning id`
    const json = JSON.stringify(items.map((i) => ({ producto_id: i.productoId, cantidad: i.cantidad })))
    const n = await tx`
      insert into pedido_items (pedido_id, producto_id, cantidad)
      select ${p.id}, x.producto_id, x.cantidad from jsonb_to_recordset(${json}::text::jsonb) as x(producto_id int, cantidad int)
      join productos pr on pr.id = x.producto_id returning id`
    if (n.length !== items.length) throw new ErrorEnvio('Algún producto no existe.')
    return { pedidoId: p.id }
  })
}

export async function cancelarPedido(sql: Sql, d: { usuario: Quien; pedidoId: number }) {
  const [p] = await sql<{ sucursal_id: number; estado: string; usuario_id: number | null }[]>`select sucursal_id, estado, usuario_id from pedidos where id = ${d.pedidoId}`
  if (!p) throw new ErrorEnvio('El pedido no existe.')
  if (d.usuario.rol !== 'admin' && d.usuario.rol !== 'deposito' && p.sucursal_id !== d.usuario.sucursal_id) throw new ErrorEnvio('Ese pedido es de otra sucursal.')
  if (p.estado === 'enviado' || p.estado === 'cancelado') throw new ErrorEnvio('El pedido ya está cerrado.')
  await sql`update pedidos set estado = 'cancelado', cerrado_en = now() where id = ${d.pedidoId}`
}

// ── Envíos ──────────────────────────────────────────────────────────────

export async function crearEnvio(
  sql: Sql,
  d: { usuario: Quien; origenId: number; destinoId: number; items: Item[]; nota?: string | null; pedidoId?: number | null; cerrarPedido?: boolean },
) {
  const items = unificar(d.items)
  if (d.origenId === d.destinoId) throw new ErrorEnvio('El origen y el destino son el mismo depósito.')
  return sql.begin(async (tx) => {
    const sucOrigen = await sucursalDe(tx, d.origenId)
    await sucursalDe(tx, d.destinoId)
    if (d.usuario.rol !== 'admin' && sucOrigen !== d.usuario.sucursal_id) throw new ErrorEnvio('Solo podés enviar desde tu depósito.')
    const transito = await depositoTransito(tx)
    const [e] = await tx<{ id: number }[]>`
      insert into envios (origen_id, destino_id, pedido_id, nota, enviado_por)
      values (${d.origenId}, ${d.destinoId}, ${d.pedidoId ?? null}, ${d.nota?.trim().slice(0, 300) || null}, ${d.usuario.id}) returning id`
    try {
      await registrarOperacionTx(tx, {
        tipo: 'transferencia',
        origenId: d.origenId,
        destinoId: transito,
        motivo: `Envío N.º ${e.id}`,
        nota: d.nota ?? null,
        usuarioId: d.usuario.id,
        items,
      })
    } catch (err) {
      if (err instanceof ErrorStock) throw new ErrorEnvio(err.message)
      throw err
    }
    const json = JSON.stringify(items.map((i) => ({ producto_id: i.productoId, cantidad: i.cantidad })))
    await tx`
      insert into envio_items (envio_id, producto_id, enviada)
      select ${e.id}, producto_id, cantidad from jsonb_to_recordset(${json}::text::jsonb) as x(producto_id int, cantidad int)`
    if (d.pedidoId) {
      const [p] = await tx<{ deposito_id: number; estado: string }[]>`select deposito_id, estado from pedidos where id = ${d.pedidoId} for update`
      if (!p) throw new ErrorEnvio('El pedido no existe.')
      if (p.estado === 'enviado' || p.estado === 'cancelado') throw new ErrorEnvio('Ese pedido ya está cerrado.')
      if (p.deposito_id !== d.destinoId) throw new ErrorEnvio('El destino no es la sucursal del pedido.')
      await tx`
        update pedido_items pi set enviada = pi.enviada + x.cantidad
        from jsonb_to_recordset(${json}::text::jsonb) as x(producto_id int, cantidad int)
        where pi.pedido_id = ${d.pedidoId} and pi.producto_id = x.producto_id`
      const [{ falta }] = await tx<{ falta: number }[]>`
        select count(*)::int as falta from pedido_items where pedido_id = ${d.pedidoId} and enviada < cantidad`
      const completo = falta === 0 || d.cerrarPedido
      await tx`
        update pedidos set estado = ${completo ? 'enviado' : 'parcial'}, cerrado_en = ${completo ? tx`now()` : null}
        where id = ${d.pedidoId}`
    }
    return { envioId: e.id }
  })
}

/** La sucursal confirma lo que contó. Entra al stock lo contado; si no coincide, queda con diferencias. */
export async function recibirEnvio(sql: Sql, d: { usuario: Quien; envioId: number; recibidos: Item[] | { productoId: number; cantidad: number }[]; nota?: string | null }) {
  return sql.begin(async (tx) => {
    const [e] = await tx<{ id: number; destino_id: number; estado: string; sucursal_id: number | null }[]>`
      select e.id, e.destino_id, e.estado, d.sucursal_id from envios e join depositos d on d.id = e.destino_id
      where e.id = ${d.envioId} for update of e`
    if (!e) throw new ErrorEnvio('El envío no existe.')
    if (e.estado !== 'en_camino') throw new ErrorEnvio('Ese envío ya se recibió o se canceló.')
    if (d.usuario.rol !== 'admin' && e.sucursal_id !== d.usuario.sucursal_id) throw new ErrorEnvio('Ese envío va a otra sucursal.')
    const items = await tx<{ producto_id: number; enviada: number }[]>`select producto_id, enviada from envio_items where envio_id = ${e.id}`
    const contados = new Map<number, number>()
    for (const r of d.recibidos) {
      if (!Number.isInteger(r.cantidad) || r.cantidad < 0) throw new ErrorEnvio('Hay una cantidad contada no válida.')
      contados.set(r.productoId, (contados.get(r.productoId) ?? 0) + r.cantidad)
    }
    for (const id of contados.keys())
      if (!items.some((i) => i.producto_id === id)) throw new ErrorEnvio('Contaste un producto que no venía en el envío: avisale al depósito.')
    const transito = await depositoTransito(tx)
    const entran = items.map((i) => ({ productoId: i.producto_id, cantidad: contados.get(i.producto_id) ?? 0 })).filter((i) => i.cantidad > 0)
    if (entran.length)
      await registrarOperacionTx(tx, {
        tipo: 'transferencia',
        origenId: transito,
        destinoId: e.destino_id,
        motivo: `Recepción del envío N.º ${e.id}`,
        usuarioId: d.usuario.id,
        items: entran,
      })
    const json = JSON.stringify(items.map((i) => ({ producto_id: i.producto_id, recibida: contados.get(i.producto_id) ?? 0 })))
    await tx`
      update envio_items ei set recibida = x.recibida
      from jsonb_to_recordset(${json}::text::jsonb) as x(producto_id int, recibida int)
      where ei.envio_id = ${e.id} and ei.producto_id = x.producto_id`
    const diferencias = items.filter((i) => (contados.get(i.producto_id) ?? 0) !== i.enviada).length
    await tx`
      update envios set estado = ${diferencias ? 'con_diferencias' : 'recibido'}, recibido_por = ${d.usuario.id}, recibido_en = now(),
        nota_recepcion = ${d.nota?.trim().slice(0, 300) || null}
      where id = ${e.id}`
    return { diferencias }
  })
}

/**
 * La administración resuelve las diferencias de un envío:
 * - 'perdida': lo que faltó se da de baja (se perdió o rompió en el camino); lo que sobró se descuenta del origen.
 * - 'devolver': lo que faltó vuelve al stock del origen (no se llegó a mandar).
 */
export async function resolverDiferencias(sql: Sql, d: { usuario: Quien; envioId: number; accion: 'perdida' | 'devolver'; nota?: string | null }) {
  if (!puedeEn(d.usuario, 'diferencias')) throw new ErrorEnvio('Las diferencias las resuelve la administración.')
  return sql.begin(async (tx) => {
    const [e] = await tx<{ id: number; origen_id: number; estado: string; resuelto_en: Date | null }[]>`
      select id, origen_id, estado, resuelto_en from envios where id = ${d.envioId} for update`
    if (!e) throw new ErrorEnvio('El envío no existe.')
    if (e.estado !== 'con_diferencias' || e.resuelto_en) throw new ErrorEnvio('Ese envío no tiene diferencias pendientes.')
    const items = await tx<{ producto_id: number; dif: number }[]>`
      select producto_id, enviada - coalesce(recibida, 0) as dif from envio_items where envio_id = ${e.id} and enviada <> coalesce(recibida, 0)`
    const transito = await depositoTransito(tx)
    const faltan = items.filter((i) => i.dif > 0).map((i) => ({ productoId: i.producto_id, cantidad: i.dif }))
    const sobran = items.filter((i) => i.dif < 0).map((i) => ({ productoId: i.producto_id, cantidad: -i.dif }))
    const nota = `Envío N.º ${e.id}${d.nota?.trim() ? `: ${d.nota.trim()}` : ''}`
    if (faltan.length) {
      if (d.accion === 'devolver')
        await registrarOperacionTx(tx, { tipo: 'transferencia', origenId: transito, destinoId: e.origen_id, motivo: 'Faltante devuelto al origen', nota, usuarioId: d.usuario.id, items: faltan })
      else
        await registrarOperacionTx(tx, {
          tipo: 'ajuste',
          destinoId: transito,
          motivo: 'Pérdida o robo',
          nota,
          usuarioId: d.usuario.id,
          items: faltan.map((i) => ({ productoId: i.productoId, cantidad: -i.cantidad })),
        })
    }
    // Sobrantes: llegó más de lo que se registró al enviar; salió del origen sin anotarse.
    if (sobran.length) {
      await registrarOperacionTx(tx, { tipo: 'ajuste', destinoId: transito, motivo: 'Otro', nota: `${nota} (sobrante)`, usuarioId: d.usuario.id, items: sobran })
      await registrarOperacionTx(tx, {
        tipo: 'ajuste',
        destinoId: e.origen_id,
        motivo: 'Otro',
        nota: `${nota} (salió de más)`,
        usuarioId: d.usuario.id,
        items: sobran.map((i) => ({ productoId: i.productoId, cantidad: -i.cantidad })),
      })
    }
    const texto = d.accion === 'devolver' ? 'Faltante devuelto al origen' : 'Faltante dado de baja'
    await tx`
      update envios set resuelto_en = now(), resuelto_por = ${d.usuario.id},
        resolucion = ${texto + (d.nota?.trim() ? `: ${d.nota.trim()}` : '')}
      where id = ${e.id}`
  })
}

/** Cancela un envío que todavía no se recibió: todo vuelve al origen. */
export async function cancelarEnvio(sql: Sql, d: { usuario: Quien; envioId: number }) {
  return sql.begin(async (tx) => {
    const [e] = await tx<{ id: number; origen_id: number; estado: string; pedido_id: number | null; sucursal_origen: number | null }[]>`
      select e.id, e.origen_id, e.estado, e.pedido_id, d.sucursal_id as sucursal_origen
      from envios e join depositos d on d.id = e.origen_id where e.id = ${d.envioId} for update of e`
    if (!e) throw new ErrorEnvio('El envío no existe.')
    if (e.estado !== 'en_camino') throw new ErrorEnvio('Solo se cancela un envío que todavía no llegó.')
    if (d.usuario.rol !== 'admin' && e.sucursal_origen !== d.usuario.sucursal_id) throw new ErrorEnvio('Lo cancela quien lo envió.')
    const items = await tx<{ producto_id: number; enviada: number }[]>`select producto_id, enviada from envio_items where envio_id = ${e.id}`
    await registrarOperacionTx(tx, {
      tipo: 'transferencia',
      origenId: await depositoTransito(tx),
      destinoId: e.origen_id,
      motivo: `Envío N.º ${e.id} cancelado`,
      usuarioId: d.usuario.id,
      items: items.map((i) => ({ productoId: i.producto_id, cantidad: i.enviada })),
    })
    await tx`update envios set estado = 'cancelado' where id = ${e.id}`
    if (e.pedido_id) {
      const json = JSON.stringify(items)
      await tx`
        update pedido_items pi set enviada = greatest(0, pi.enviada - x.enviada)
        from jsonb_to_recordset(${json}::text::jsonb) as x(producto_id int, enviada int)
        where pi.pedido_id = ${e.pedido_id} and pi.producto_id = x.producto_id`
      await tx`
        update pedidos set cerrado_en = null,
          estado = case when exists (select 1 from pedido_items where pedido_id = ${e.pedido_id} and enviada > 0) then 'parcial' else 'pendiente' end
        where id = ${e.pedido_id} and estado <> 'cancelado'`
    }
  })
}
