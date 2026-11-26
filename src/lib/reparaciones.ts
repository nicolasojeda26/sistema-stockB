import { randomBytes } from 'node:crypto'
import type { Sql, TransactionSql } from 'postgres'

type Tx = Sql | TransactionSql
/** Quién hace el cambio. `permisos`: los de la persona (sin ellos, los del rol de fábrica). `tecnico_id`: si es un técnico de la lista. */
type Quien = { id: number; rol: 'admin' | 'vendedora' | 'deposito'; sucursal_id: number | null; permisos?: readonly string[]; tecnico_id?: number | null }

export * from './reparaciones-texto'
import { puedeEn } from './permisos'
import { ESTADOS_REPARACION, MOTIVOS_CIERRE, numeroReparacion, type EstadoReparacion, type FaseEtapa, type MotivoCierre } from './reparaciones-texto'

export class ErrorReparacion extends Error {}
/** Enlace de seguimiento: 24 caracteres al azar, imposible de adivinar. */
export const nuevoToken = () => randomBytes(18).toString('base64url')

/** Primer estado activo de una fase (por orden). */
async function etapaDeFase(tx: Tx, fase: FaseEtapa): Promise<number | null> {
  const [e] = await tx<{ id: number }[]>`select id from reparacion_etapas where fase = ${fase} and activa order by orden, id limit 1`
  return e?.id ?? null
}

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
  clienteDni?: string | null
  tipoReparacion?: string | null
  /** Número de la reparación anterior si vuelve por garantía. */
  garantiaDe?: number | null
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
  if (!puedeEn(d.usuario, 'reparaciones')) throw new ErrorReparacion('Los equipos los recibe la sucursal.')
  if (d.usuario.rol !== 'admin' && d.usuario.sucursal_id !== d.sucursalId) throw new ErrorReparacion('Solo podés recibir equipos en tu sucursal.')
  return sql.begin(async (tx) => {
    const [s] = await tx<{ tipo: string; activa: boolean }[]>`select tipo, activa from sucursales where id = ${d.sucursalId}`
    if (!s?.activa) throw new ErrorReparacion('Elegí la sucursal.')
    let notaIngreso: string | null = null
    if (d.garantiaDe) {
      const [ant] = await tx<{ id: number; estado: string }[]>`select id, estado from reparaciones where id = ${d.garantiaDe}`
      if (!ant) throw new ErrorReparacion(`No existe la reparación ${numeroReparacion(d.garantiaDe)}.`)
      if (ant.estado !== 'entregado') throw new ErrorReparacion(`La reparación ${numeroReparacion(d.garantiaDe)} todavía no se entregó.`)
      notaIngreso = `Reingreso por garantía de ${numeroReparacion(d.garantiaDe)}.`
    }
    const etapa = await etapaDeFase(tx, 'ingresado')
    const [r] = await tx<{ id: number }[]>`
      insert into reparaciones (sucursal_id, cliente_nombre, cliente_telefono, cliente_dni, equipo, imei, falla, estado_equipo, tipo_reparacion,
        presupuesto, prometido, recibido_por, garantia_de, etapa_id, token)
      values (${d.sucursalId}, ${nombre}, ${limpiar(d.clienteTelefono, 40)}, ${limpiar(d.clienteDni, 20)}, ${equipo}, ${limpiar(d.imei, 40)}, ${falla},
        ${String(d.estadoEquipo ?? '').trim().slice(0, 1000) || null}, ${limpiar(d.tipoReparacion, 120)},
        ${d.presupuesto ?? null}, ${d.prometido || null}, ${d.usuario.id}, ${d.garantiaDe ?? null}, ${etapa}, ${nuevoToken()})
      returning id`
    await tx`insert into reparacion_eventos (reparacion_id, estado, nota, usuario_id, etapa_id) values (${r.id}, 'ingresado', ${notaIngreso}, ${d.usuario.id}, ${etapa})`
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
  /** Informar un estado del taller (los editables). */
  | { accion: 'etapa'; etapaId: number; tecnicoId?: number | null; nota?: string | null }
  | { accion: 'listo'; precio: number; diagnostico?: string | null; tecnicoId?: number | null; garantiaDias?: number | null; tipoReparacion?: string | null }
  | { accion: 'sin_reparacion'; motivo: MotivoCierre; precio?: number | null; diagnostico?: string | null; tecnicoId?: number | null }
  | { accion: 'entregar_sin_cobro'; nota?: string | null }
  | { accion: 'cancelar'; nota?: string | null }
  | { accion: 'nota'; nota: string }

/** Avanza la reparación. El cobro no pasa por acá: se hace en la caja y la marca como entregada. */
export async function cambiarEstadoReparacion(sql: Sql, d: { usuario: Quien; id: number; cambio: CambioEstado }) {
  return sql.begin(async (tx) => {
    const r = await leerParaCambiar(tx, d.id, d.usuario)
    const c = d.cambio
    const evento = (estado: string, nota: string | null, etapaId: number | null = null, tecnicoId: number | null = null) =>
      tx`insert into reparacion_eventos (reparacion_id, estado, nota, usuario_id, etapa_id, tecnico_id)
        values (${r.id}, ${estado}, ${nota}, ${d.usuario.id}, ${etapaId}, ${tecnicoId})`
    const tecnico = async (id: number | null | undefined) => {
      if (!id) {
        // Si lo informa un técnico con usuario, queda él (si sigue activo en la lista).
        if (!d.usuario.tecnico_id) return null
        const [yo] = await tx<{ id: number }[]>`select id from tecnicos where id = ${d.usuario.tecnico_id} and activo`
        return yo?.id ?? null
      }
      const [t] = await tx<{ id: number }[]>`select id from tecnicos where id = ${id} and activo`
      if (!t) throw new ErrorReparacion('Ese técnico no está en la lista.')
      return t.id
    }
    if (['empezar', 'etapa', 'listo', 'sin_reparacion'].includes(c.accion) && !puedeEn(d.usuario, 'reparaciones_estado'))
      throw new ErrorReparacion('El estado lo informa el área técnica.')
    if (['entregar_sin_cobro', 'cancelar'].includes(c.accion) && !puedeEn(d.usuario, 'reparaciones'))
      throw new ErrorReparacion('Entregar o cancelar lo hace la sucursal.')
    if (r.estado === 'entregado' || r.estado === 'cancelado') {
      if (c.accion !== 'nota') throw new ErrorReparacion('Esta reparación ya está cerrada.')
    }
    switch (c.accion) {
      case 'empezar': {
        if (r.estado !== 'ingresado') throw new ErrorReparacion('Ya está en reparación o terminada.')
        const etapa = await etapaDeFase(tx, 'en_reparacion')
        await tx`update reparaciones set estado = 'en_reparacion', etapa_id = ${etapa}, actualizado = now() where id = ${r.id}`
        await evento('en_reparacion', limpiar(c.nota, 500), etapa)
        break
      }
      case 'etapa': {
        if (!['ingresado', 'en_reparacion', 'listo', 'sin_reparacion'].includes(r.estado)) throw new ErrorReparacion('Esta reparación ya está cerrada.')
        const [e] = await tx<{ id: number; fase: FaseEtapa }[]>`select id, fase from reparacion_etapas where id = ${c.etapaId} and activa`
        if (!e) throw new ErrorReparacion('Ese estado no existe o está desactivado.')
        if (e.fase === 'listo') throw new ErrorReparacion('Para marcarla lista usá "Está lista" (hace falta el importe).')
        const tec = await tecnico(c.tecnicoId)
        // Volver atrás desde "lista" o "sin reparación" la reabre (por ejemplo, otra reparación conjunta).
        await tx`
          update reparaciones set estado = ${e.fase}, etapa_id = ${e.id}, tecnico_id = coalesce(${tec}, tecnico_id),
            motivo_cierre = null, actualizado = now()
          where id = ${r.id}`
        await evento(e.fase, limpiar(c.nota, 500), e.id, tec)
        break
      }
      case 'listo': {
        if (!(c.precio > 0)) throw new ErrorReparacion('Poné cuánto se cobra.')
        if (!['ingresado', 'en_reparacion', 'listo', 'sin_reparacion'].includes(r.estado)) throw new ErrorReparacion('No se puede marcar como lista.')
        if (c.garantiaDias != null && !(Number.isInteger(c.garantiaDias) && c.garantiaDias >= 0 && c.garantiaDias <= 3650))
          throw new ErrorReparacion('Los días de garantía no son válidos.')
        const diag = String(c.diagnostico ?? '').trim().slice(0, 1000) || null
        const tec = await tecnico(c.tecnicoId)
        const etapa = await etapaDeFase(tx, 'listo')
        await tx`
          update reparaciones set estado = 'listo', precio = ${c.precio}, diagnostico = coalesce(${diag}, diagnostico),
            tecnico_id = coalesce(${tec}, tecnico_id), etapa_id = ${etapa}, motivo_cierre = null,
            garantia_dias = coalesce(${c.garantiaDias ?? null}, garantia_dias),
            tipo_reparacion = coalesce(${limpiar(c.tipoReparacion, 120)}, tipo_reparacion),
            listo_en = coalesce(listo_en, now()), actualizado = now()
          where id = ${r.id}`
        await evento('listo', diag, etapa, tec)
        break
      }
      case 'sin_reparacion': {
        if (!(c.motivo in MOTIVOS_CIERRE)) throw new ErrorReparacion('Elegí por qué no se reparó.')
        const diag = String(c.diagnostico ?? '').trim().slice(0, 1000) || null
        if (c.precio != null && !(c.precio >= 0)) throw new ErrorReparacion('El importe no es válido.')
        const tec = await tecnico(c.tecnicoId)
        await tx`
          update reparaciones set estado = 'sin_reparacion', precio = ${c.precio && c.precio > 0 ? c.precio : null}, motivo_cierre = ${c.motivo},
            tecnico_id = coalesce(${tec}, tecnico_id), etapa_id = null,
            diagnostico = coalesce(${diag}, diagnostico), listo_en = coalesce(listo_en, now()), actualizado = now()
          where id = ${r.id}`
        await evento('sin_reparacion', [MOTIVOS_CIERRE[c.motivo], diag].filter(Boolean).join('. '), null, tec)
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
        // Las notas son internas: no se muestran en el seguimiento del cliente.
        await evento('nota', nota)
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


// ── Reporte del área técnica ────────────────────────────────────────────

export type ResumenTaller = {
  ingresaron: number
  reingresos: number
  reparados: number
  sin_solucion: number
  no_acepto: number
  sin_repuesto: number
  devolucion: number
  en_curso: number
  cancelados: number
  /** Días promedio desde que entra hasta que está lista (las reparadas). */
  dias_promedio: number | null
  /** Lo cobrado por reparaciones de ese período (ventas no anuladas). */
  cobrado: number
}

/** Estadísticas de los equipos que ENTRARON en el período (desde y hasta, fechas de Argentina). */
export async function reporteTaller(sql: Tx, f: { desde: string; hasta: string; sucursalId: number | null }) {
  const rango = sql`r.creado >= (${f.desde}::date)::timestamp at time zone 'America/Argentina/Buenos_Aires'
    and r.creado < (${f.hasta}::date + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires'
    ${f.sucursalId ? sql`and r.sucursal_id = ${f.sucursalId}` : sql``}`
  const [resumen] = await sql<ResumenTaller[]>`
    select
      count(*)::int as ingresaron,
      count(*) filter (where r.garantia_de is not null)::int as reingresos,
      count(*) filter (where r.listo_en is not null and r.motivo_cierre is null and r.estado in ('listo', 'entregado'))::int as reparados,
      count(*) filter (where r.motivo_cierre = 'sin_solucion')::int as sin_solucion,
      count(*) filter (where r.motivo_cierre = 'no_acepto')::int as no_acepto,
      count(*) filter (where r.motivo_cierre = 'sin_repuesto')::int as sin_repuesto,
      count(*) filter (where r.motivo_cierre = 'devolucion')::int as devolucion,
      count(*) filter (where r.estado in ('ingresado', 'en_reparacion'))::int as en_curso,
      count(*) filter (where r.estado = 'cancelado')::int as cancelados,
      round(avg(extract(epoch from r.listo_en - r.creado) / 86400) filter (where r.listo_en is not null and r.motivo_cierre is null)::numeric, 1)::float as dias_promedio,
      coalesce(sum((
        select i.subtotal from venta_items i join ventas v on v.id = i.venta_id and v.estado <> 'anulada'
        where i.venta_id = r.venta_id and i.producto_id is null and i.codigo = 'R-' || lpad(r.id::text, greatest(5, length(r.id::text)), '0') limit 1)), 0)::float as cobrado
    from reparaciones r where ${rango}`
  const [porTecnico, porSucursal, porTipo] = await Promise.all([
    sql<{ tecnico: string; reparados: number; sin_solucion: number; reingresos: number }[]>`
      select coalesce(t.nombre, 'Sin técnico') as tecnico,
        count(*) filter (where r.motivo_cierre is null and r.listo_en is not null)::int as reparados,
        count(*) filter (where r.motivo_cierre = 'sin_solucion')::int as sin_solucion,
        (select count(*)::int from reparaciones g where g.garantia_de = any(array_agg(r.id))) as reingresos
      from reparaciones r left join tecnicos t on t.id = r.tecnico_id
      where ${rango} and (r.listo_en is not null or r.motivo_cierre is not null)
      group by t.nombre order by reparados desc, tecnico`,
    sql<{ sucursal: string; ingresaron: number; reparados: number; en_curso: number }[]>`
      select s.nombre as sucursal, count(*)::int as ingresaron,
        count(*) filter (where r.listo_en is not null and r.motivo_cierre is null and r.estado in ('listo', 'entregado'))::int as reparados,
        count(*) filter (where r.estado in ('ingresado', 'en_reparacion'))::int as en_curso
      from reparaciones r join sucursales s on s.id = r.sucursal_id
      where ${rango} group by s.nombre order by ingresaron desc`,
    sql<{ tipo: string; cantidad: number }[]>`
      select coalesce(nullif(r.tipo_reparacion, ''), 'Sin especificar') as tipo, count(*)::int as cantidad
      from reparaciones r where ${rango} group by 1 order by cantidad desc limit 10`,
  ])
  return { resumen, porTecnico, porSucursal, porTipo }
}

/** Precio de lista para ese modelo y tipo de reparación, si está cargado. */
export async function precioDeLista(sql: Tx, modelo: string, tipo: string): Promise<number | null> {
  const [p] = await sql<{ precio: number }[]>`
    select precio from reparacion_precios where activo and lower(modelo) = lower(${modelo.trim()}) and lower(tipo) = lower(${tipo.trim()})`
  return p ? Number(p.precio) : null
}

/** Garantía vigente hasta (si se entregó reparada). */
export function garantiaHasta(r: { entregado_en: Date | null; garantia_dias: number | null; motivo_cierre: string | null }): Date | null {
  if (!r.entregado_en || r.garantia_dias == null || r.motivo_cierre) return null
  return new Date(r.entregado_en.getTime() + r.garantia_dias * 86_400_000)
}

// ── Lectura completa (ficha, comprobantes y seguimiento) ────────────────

export type ReparacionCompleta = {
  id: number
  sucursal_id: number
  sucursal: string
  sucursal_direccion: string | null
  cliente_nombre: string
  cliente_telefono: string | null
  cliente_dni: string | null
  equipo: string
  imei: string | null
  falla: string
  estado_equipo: string | null
  tipo_reparacion: string | null
  presupuesto: number | null
  precio: number | null
  diagnostico: string | null
  prometido: string | null
  estado: EstadoReparacion
  etapa_id: number | null
  etapa: string | null
  tecnico_id: number | null
  tecnico: string | null
  motivo_cierre: MotivoCierre | null
  garantia_dias: number | null
  garantia_de: number | null
  token: string
  creado: Date
  listo_en: Date | null
  entregado_en: Date | null
  recibio: string | null
  entrego: string | null
  venta_id: number | null
  /** Lo cobrado en la caja (con el descuento, si hubo). */
  cobrado: number | null
}

export async function leerReparacion(sql: Tx, f: { id?: number; token?: string }): Promise<ReparacionCompleta | null> {
  if (!f.id && !f.token) return null
  const [r] = await sql<ReparacionCompleta[]>`
    select r.id, r.sucursal_id, s.nombre as sucursal, s.direccion as sucursal_direccion, r.cliente_nombre, r.cliente_telefono, r.cliente_dni,
      r.equipo, r.imei, r.falla, r.estado_equipo, r.tipo_reparacion, r.presupuesto::float as presupuesto, r.precio::float as precio, r.diagnostico,
      to_char(r.prometido, 'DD/MM/YYYY') as prometido, r.estado, r.etapa_id, e.nombre as etapa, r.tecnico_id, t.nombre as tecnico,
      r.motivo_cierre, r.garantia_dias, r.garantia_de, r.token, r.creado, r.listo_en, r.entregado_en,
      ur.nombre as recibio, ue.nombre as entrego, r.venta_id,
      (select i.subtotal::float from venta_items i join ventas v on v.id = i.venta_id and v.estado <> 'anulada'
        where i.venta_id = r.venta_id and i.producto_id is null and i.codigo = 'R-' || lpad(r.id::text, greatest(5, length(r.id::text)), '0') limit 1) as cobrado
    from reparaciones r
    join sucursales s on s.id = r.sucursal_id
    left join reparacion_etapas e on e.id = r.etapa_id
    left join tecnicos t on t.id = r.tecnico_id
    left join usuarios ur on ur.id = r.recibido_por
    left join usuarios ue on ue.id = r.entregado_por
    where ${f.id ? sql`r.id = ${f.id}` : sql`r.token = ${f.token!}`}`
  return r ?? null
}

/** Cómo se le muestra el estado al cliente y en la ficha. */
export function estadoVisible(r: Pick<ReparacionCompleta, 'estado' | 'etapa' | 'motivo_cierre'>): string {
  if (r.estado === 'entregado') return r.motivo_cierre ? `Entregado sin reparar (${MOTIVOS_CIERRE[r.motivo_cierre].toLowerCase()})` : 'Entregado'
  if (r.estado === 'sin_reparacion') return r.motivo_cierre ? `${MOTIVOS_CIERRE[r.motivo_cierre]}: listo para retirar` : 'Sin reparación: listo para retirar'
  if (r.estado === 'cancelado') return 'Cancelado'
  return r.etapa ?? ESTADOS_REPARACION[r.estado].texto
}
