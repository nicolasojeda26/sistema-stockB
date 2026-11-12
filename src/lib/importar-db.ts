import type { Sql } from 'postgres'
import type { FilaImport } from './importar'
import { ordenTalle } from './articulos'

export type ResumenLote = { creados: number; actualizados: number; omitidos: number; stock: number; categorias: number; articulos: number }

/**
 * Guarda un lote de filas en pocas consultas (rápido aun con la base lejos).
 * - Productos nuevos: se crean.
 * - Existentes (mismo código): se actualizan si `actualizarExistentes`; si no, se dejan como están.
 * - Stock: si hay depósito, deja el stock de ese depósito en la cantidad de la planilla
 *   y registra la diferencia como "carga inicial".
 */
export async function importarFilas(
  sql: Sql,
  opts: {
    filas: FilaImport[]
    depositoId: number | null
    /** Planilla con stock por depósito: el depósito de cada columna de `fila.stocks` (null = no se importa). */
    depositosStock?: (number | null)[]
    actualizarExistentes: boolean
    usuarioId: number
  },
): Promise<ResumenLote> {
  const { filas, depositoId, actualizarExistentes, usuarioId } = opts
  const depositosStock = opts.depositosStock ?? []
  if (filas.length === 0) return { creados: 0, actualizados: 0, omitidos: 0, stock: 0, categorias: 0, articulos: 0 }
  const json = JSON.stringify(filas.map((f) => ({ ...f, orden: ordenTalle(f.talle) })))

  return sql.begin(async (tx) => {
    await tx`select set_config('app.usuario_id', ${String(usuarioId)}, true), set_config('app.origen', 'Importación desde Dux', true)`
    const datos = tx`
      select * from jsonb_to_recordset(${json}::text::jsonb)
        as x(fila int, codigo text, nombre text, categoria text, costo numeric, precio numeric, stock int,
             talle text, color text, articulo text, orden int, stocks jsonb, codigo_origen text)`

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
    // Una lista de precios de Dux trae el código original: actualiza precio y costo de todas sus variantes.
    const deOrigen = actualizarExistentes
      ? await tx<{ id: number }[]>`
          update productos p set
            costo = coalesce(d.costo, p.costo),
            precio = coalesce(d.precio, p.precio),
            categoria_id = coalesce(c.id, p.categoria_id),
            actualizado = now()
          from (${datos}) d left join categorias c on lower(c.nombre) = lower(d.categoria)
          where d.codigo_origen is null and lower(p.codigo_origen) = lower(d.codigo)
            and not exists (select 1 from productos q where lower(q.codigo) = lower(d.codigo))
          returning p.id`
      : []

    const creados = await tx<{ id: number }[]>`
      insert into productos (codigo, nombre, categoria_id, costo, precio, codigo_origen)
      select d.codigo, d.nombre, c.id, coalesce(d.costo, 0), coalesce(d.precio, 0), d.codigo_origen
      from (${datos}) d left join categorias c on lower(c.nombre) = lower(d.categoria)
      where not exists (select 1 from productos p where lower(p.codigo) = lower(d.codigo) or lower(p.codigo_origen) = lower(d.codigo))
      returning id`

    // Talles y colores: se agrupan en artículos (uno por nombre; si ya existe, se reutiliza).
    const nuevosArticulos = await tx`
      insert into articulos (nombre, categoria_id)
      select distinct on (lower(d.articulo)) d.articulo, c.id
      from (${datos}) d left join categorias c on lower(c.nombre) = lower(d.categoria)
      where d.articulo is not null and not exists (select 1 from articulos a where lower(a.nombre) = lower(d.articulo))
      order by lower(d.articulo), d.fila
      returning id`
    const tocados = [...creados.map((r) => r.id), ...actualizados.map((r) => r.id)]
    await tx`
      update productos p set articulo_id = a.id, talle = d.talle, color = d.color, orden_talle = d.orden, nombre = d.nombre
      from (${datos}) d
      join lateral (select id from articulos a where lower(a.nombre) = lower(d.articulo) order by id limit 1) a on true
      where d.articulo is not null and lower(p.codigo) = lower(d.codigo) and p.id = any(${tocados}::int[])
        and not exists (
          select 1 from productos o where o.articulo_id = a.id and o.id <> p.id
            and lower(coalesce(o.color, '')) = lower(coalesce(d.color, '')) and lower(coalesce(o.talle, '')) = lower(coalesce(d.talle, '')))`

    // Stock: una columna con un depósito elegido, o varias columnas (stock por depósito de Dux).
    const permitidos = [...creados.map((r) => r.id), ...actualizados.map((r) => r.id)]
    const cargas: { dep: number; valor: ReturnType<typeof tx> }[] = []
    if (depositoId) cargas.push({ dep: depositoId, valor: tx`d.stock` })
    // Si varias columnas van al mismo depósito (ej. DEPOT 815 y CAMPUS, que son el mismo lugar), se suman.
    const columnasPorDeposito = new Map<number, number[]>()
    depositosStock.forEach((dep, j) => {
      if (dep) columnasPorDeposito.set(dep, [...(columnasPorDeposito.get(dep) ?? []), j])
    })
    for (const [dep, cols] of columnasPorDeposito) {
      const celda = (j: number) => tx`(d.stocks->>(${j}::int))::numeric::int`
      const alguna = cols.slice(1).reduce((acc, j) => tx`${acc} or ${celda(j)} is not null`, tx`${celda(cols[0])} is not null`)
      const suma = cols.slice(1).reduce((acc, j) => tx`${acc} + coalesce(${celda(j)}, 0)`, tx`coalesce(${celda(cols[0])}, 0)`)
      cargas.push({ dep, valor: tx`(case when ${alguna} then ${suma} end)` })
    }
    const conStock = new Set<number>()
    for (const { dep, valor } of cargas) {
      const movs = await tx<{ producto_id: number }[]>`
        with objetivo as (
          select p.id as producto_id, ${valor} as stock
          from (${datos}) d join productos p on lower(p.codigo) = lower(d.codigo)
          where ${valor} is not null and p.id = any(${permitidos}::int[])
        ),
        previo as (
          select o.producto_id, o.stock, coalesce(s.cantidad, 0) as antes
          from objetivo o left join stock s on s.producto_id = o.producto_id and s.deposito_id = ${dep}
        ),
        guardado as (
          insert into stock (producto_id, deposito_id, cantidad)
          select producto_id, ${dep}, stock from previo
          on conflict (producto_id, deposito_id) do update set cantidad = excluded.cantidad
        )
        insert into movimientos_stock (producto_id, deposito_id, cantidad, tipo, motivo, usuario_id)
        select producto_id, ${dep}, stock - antes, 'carga_inicial', 'Importación desde Dux', ${usuarioId}
        from previo where stock <> antes
        returning producto_id`
      for (const m of movs) conStock.add(m.producto_id)
    }
    const stock = conStock.size

    return {
      creados: creados.length,
      actualizados: actualizados.length + deOrigen.length,
      omitidos: Math.max(0, filas.length - creados.length - actualizados.length - deOrigen.length),
      stock,
      categorias: nuevasCategorias.length,
      articulos: nuevosArticulos.length,
    }
  })
}
