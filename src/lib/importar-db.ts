import type { Sql } from 'postgres'
import type { FilaImport } from './importar'

export type ResumenLote = { creados: number; actualizados: number; omitidos: number; stock: number; categorias: number }

/**
 * Guarda un lote de filas en pocas consultas (rápido aun con la base lejos).
 * - Productos nuevos: se crean.
 * - Existentes (mismo código): se actualizan si `actualizarExistentes`; si no, se dejan como están.
 * - Stock: si hay depósito, deja el stock de ese depósito en la cantidad de la planilla
 *   y registra la diferencia como "carga inicial".
 */
export async function importarFilas(
  sql: Sql,
  opts: { filas: FilaImport[]; depositoId: number | null; actualizarExistentes: boolean; usuarioId: number },
): Promise<ResumenLote> {
  const { filas, depositoId, actualizarExistentes, usuarioId } = opts
  if (filas.length === 0) return { creados: 0, actualizados: 0, omitidos: 0, stock: 0, categorias: 0 }
  const json = JSON.stringify(filas)

  return sql.begin(async (tx) => {
    const datos = tx`
      select * from jsonb_to_recordset(${json}::text::jsonb)
        as x(fila int, codigo text, nombre text, categoria text, costo numeric, precio numeric, stock int)`

    const nuevasCategorias = await tx`
      insert into categorias (nombre)
      select distinct on (lower(categoria)) categoria from (${datos}) d where categoria is not null
      on conflict (lower(nombre)) do nothing returning id`

    const actualizados = actualizarExistentes
      ? await tx<{ id: number }[]>`
          update productos p set
            nombre = d.nombre,
            categoria_id = coalesce(c.id, p.categoria_id),
            costo = coalesce(d.costo, p.costo),
            precio = coalesce(d.precio, p.precio),
            activo = true,
            actualizado = now()
          from (${datos}) d left join categorias c on lower(c.nombre) = lower(d.categoria)
          where lower(p.codigo) = lower(d.codigo)
          returning p.id`
      : []

    const creados = await tx<{ id: number }[]>`
      insert into productos (codigo, nombre, categoria_id, costo, precio)
      select d.codigo, d.nombre, c.id, coalesce(d.costo, 0), coalesce(d.precio, 0)
      from (${datos}) d left join categorias c on lower(c.nombre) = lower(d.categoria)
      where not exists (select 1 from productos p where lower(p.codigo) = lower(d.codigo))
      returning id`

    let stock = 0
    if (depositoId) {
      const permitidos = [...creados.map((r) => r.id), ...actualizados.map((r) => r.id)]
      const movs = await tx`
        with objetivo as (
          select p.id as producto_id, d.stock
          from (${datos}) d join productos p on lower(p.codigo) = lower(d.codigo)
          where d.stock is not null and p.id = any(${permitidos}::int[])
        ),
        previo as (
          select o.producto_id, o.stock, coalesce(s.cantidad, 0) as antes
          from objetivo o left join stock s on s.producto_id = o.producto_id and s.deposito_id = ${depositoId}
        ),
        guardado as (
          insert into stock (producto_id, deposito_id, cantidad)
          select producto_id, ${depositoId}, stock from previo
          on conflict (producto_id, deposito_id) do update set cantidad = excluded.cantidad
        )
        insert into movimientos_stock (producto_id, deposito_id, cantidad, tipo, motivo, usuario_id)
        select producto_id, ${depositoId}, stock - antes, 'carga_inicial', 'Importación desde Dux', ${usuarioId}
        from previo where stock <> antes
        returning id`
      stock = movs.length
    }

    return {
      creados: creados.length,
      actualizados: actualizados.length,
      omitidos: filas.length - creados.length - actualizados.length,
      stock,
      categorias: nuevasCategorias.length,
    }
  })
}
