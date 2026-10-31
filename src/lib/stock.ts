import type { Sql, TransactionSql } from 'postgres'
import { codigoInterno } from './codigos'

export type TipoOperacion = 'ingreso' | 'transferencia' | 'ajuste'

export type ItemOperacion = {
  productoId: number
  /** Ingreso y transferencia: unidades (> 0). Ajuste: diferencia (+/-). */
  cantidad?: number
  /** Solo ajuste por recuento: cantidad real contada en el depósito. */
  contado?: number
}

export type DatosOperacion = {
  tipo: TipoOperacion
  origenId?: number | null
  destinoId: number
  motivo?: string | null
  nota?: string | null
  usuarioId: number
  items: ItemOperacion[]
}

export class ErrorStock extends Error {}

type Mov = { producto_id: number; deposito_id: number; cantidad: number }

/** Registra la operación y mueve el stock, todo o nada. */
export async function registrarOperacion(sql: Sql, d: DatosOperacion): Promise<{ operacionId: number; movimientos: number }> {
  if (!d.items.length) throw new ErrorStock('La lista está vacía.')
  if (d.tipo === 'transferencia' && (!d.origenId || d.origenId === d.destinoId))
    throw new ErrorStock('Elegí un depósito de origen distinto del de destino.')

  // Unificar productos repetidos en la lista.
  const porProducto = new Map<number, ItemOperacion>()
  for (const it of d.items) {
    const previo = porProducto.get(it.productoId)
    if (it.contado !== undefined) porProducto.set(it.productoId, { productoId: it.productoId, contado: it.contado })
    else porProducto.set(it.productoId, { productoId: it.productoId, cantidad: (previo?.cantidad ?? 0) + (it.cantidad ?? 0) })
  }
  const items = [...porProducto.values()]
  for (const it of items) {
    if (it.contado !== undefined) {
      if (d.tipo !== 'ajuste') throw new ErrorStock('El recuento solo vale para ajustes.')
      if (!Number.isInteger(it.contado) || it.contado < 0) throw new ErrorStock('La cantidad contada no es válida.')
    } else if (!Number.isInteger(it.cantidad) || it.cantidad === 0 || (d.tipo !== 'ajuste' && it.cantidad! < 0)) {
      throw new ErrorStock('Hay una cantidad no válida en la lista.')
    }
  }

  return sql.begin(async (tx) => {
    const ids = items.map((i) => i.productoId)
    const depositos = [d.destinoId, ...(d.origenId ? [d.origenId] : [])]
    const okDeps = await tx`select id from depositos where id = any(${depositos}::int[]) and activo`
    if (okDeps.length !== depositos.length) throw new ErrorStock('Uno de los depósitos no existe o está inactivo.')
    const okProds = await tx`select id from productos where id = any(${ids}::int[])`
    if (okProds.length !== ids.length) throw new ErrorStock('Uno de los productos ya no existe.')

    const movs: Mov[] = []
    if (d.tipo === 'ajuste') {
      const actual = await stockBloqueado(tx, ids, d.destinoId)
      for (const it of items) {
        const delta = it.contado !== undefined ? it.contado - (actual.get(it.productoId) ?? 0) : it.cantidad!
        if (delta !== 0) movs.push({ producto_id: it.productoId, deposito_id: d.destinoId, cantidad: delta })
      }
    } else {
      for (const it of items) {
        movs.push({ producto_id: it.productoId, deposito_id: d.destinoId, cantidad: it.cantidad! })
        if (d.tipo === 'transferencia') movs.push({ producto_id: it.productoId, deposito_id: d.origenId!, cantidad: -it.cantidad! })
      }
    }

    const [op] = await tx<{ id: number }[]>`
      insert into operaciones_stock (tipo, deposito_origen_id, deposito_destino_id, motivo, nota, usuario_id)
      values (${d.tipo}, ${d.origenId ?? null}, ${d.destinoId}, ${d.motivo ?? null}, ${d.nota ?? null}, ${d.usuarioId})
      returning id`
    if (movs.length) await aplicarMovimientos(tx, movs, d.tipo, d.motivo ?? null, d.usuarioId, op.id)
    return { operacionId: Number(op.id), movimientos: movs.length }
  })
}

async function stockBloqueado(tx: TransactionSql, ids: number[], depositoId: number) {
  await tx`
    insert into stock (producto_id, deposito_id, cantidad)
    select unnest(${ids}::int[]), ${depositoId}, 0
    on conflict do nothing`
  const filas = await tx<{ producto_id: number; cantidad: number }[]>`
    select producto_id, cantidad from stock
    where deposito_id = ${depositoId} and producto_id = any(${ids}::int[])
    order by producto_id for update`
  return new Map(filas.map((f) => [f.producto_id, f.cantidad]))
}

async function aplicarMovimientos(tx: TransactionSql, movs: Mov[], tipo: string, motivo: string | null, usuarioId: number, operacionId: number) {
  const json = JSON.stringify(movs)
  const datos = tx`select * from jsonb_to_recordset(${json}::text::jsonb) as x(producto_id int, deposito_id int, cantidad int)`
  // Orden fijo para no trabarse con otra operación simultánea.
  await tx`
    insert into stock (producto_id, deposito_id, cantidad)
    select producto_id, deposito_id, cantidad from (${datos}) d order by deposito_id, producto_id
    on conflict (producto_id, deposito_id) do update set cantidad = stock.cantidad + excluded.cantidad`
  await tx`
    insert into movimientos_stock (producto_id, deposito_id, cantidad, tipo, motivo, usuario_id, operacion_id)
    select producto_id, deposito_id, cantidad, ${tipo}, ${motivo}, ${usuarioId}, ${operacionId} from (${datos}) d`
}

/** Próximo código interno libre (EAN-13 que empieza con 20). */
export async function nuevoCodigoInterno(sql: Sql): Promise<string> {
  for (let intento = 0; intento < 20; intento++) {
    const [{ n }] = await sql<{ n: string }[]>`select nextval('codigo_interno_seq')::text as n`
    const codigo = codigoInterno(Number(n))
    const [existe] = await sql`select 1 from productos where lower(codigo) = ${codigo}`
    if (!existe) return codigo
  }
  throw new ErrorStock('No se pudo generar un código libre.')
}
