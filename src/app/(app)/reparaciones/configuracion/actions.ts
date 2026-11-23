'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requerirPermiso } from '@/lib/dal'
import { entero, marcado, mensajeError, texto } from '@/lib/errores'
import { parseNumero } from '@/lib/numeros'
import type { Resultado } from '@/components/form-accion'

const refrescar = () => {
  revalidatePath('/reparaciones', 'layout')
}
const limpio = (s: string, max: number) => s.replace(/\s+/g, ' ').trim().slice(0, max)

// ── Estados del taller ──────────────────────────────────────────────────

export async function guardarEtapa(_: Resultado, f: FormData): Promise<Resultado> {
  await requerirPermiso('reparaciones_config')
  const id = entero(f, 'id')
  const nombre = limpio(texto(f, 'nombre'), 80)
  const fase = texto(f, 'fase')
  const activa = id ? marcado(f, 'activa') : true
  if (!nombre) return { error: 'Poné el nombre del estado.' }
  try {
    if (id) {
      const [e] = await db()<{ sistema: boolean; fase: string }[]>`select sistema, fase from reparacion_etapas where id = ${id}`
      if (!e) return { error: 'Ese estado no existe.' }
      // Los del sistema solo cambian de nombre (siguen marcando el ingreso y el "listo para retirar").
      if (e.sistema) await db()`update reparacion_etapas set nombre = ${nombre} where id = ${id}`
      else {
        if (!['ingresado', 'en_reparacion'].includes(fase)) return { error: 'Elegí en qué parte del proceso va.' }
        await db()`update reparacion_etapas set nombre = ${nombre}, fase = ${fase}, activa = ${activa} where id = ${id}`
      }
    } else {
      if (!['ingresado', 'en_reparacion'].includes(fase)) return { error: 'Elegí en qué parte del proceso va.' }
      // Va antes del "listo para retirar".
      await db()`
        insert into reparacion_etapas (nombre, fase, orden)
        values (${nombre}, ${fase}, (select coalesce(max(orden), 0) + 1 from reparacion_etapas where fase <> 'listo'))`
      await db()`update reparacion_etapas set orden = (select max(orden) + 10 from reparacion_etapas) where fase = 'listo' and sistema`
    }
  } catch (e) {
    return { error: mensajeError(e, `Ya hay un estado que se llama "${nombre}".`) }
  }
  refrescar()
  return { ok: id ? 'Estado guardado.' : `Estado "${nombre}" agregado.` }
}

/** Sube o baja un estado en la lista (cambia el orden con el de al lado). */
export async function moverEtapa(id: number, direccion: -1 | 1): Promise<void> {
  await requerirPermiso('reparaciones_config')
  await db().begin(async (tx) => {
    const lista = await tx<{ id: number; orden: number }[]>`select id, orden from reparacion_etapas order by orden, id for update`
    const i = lista.findIndex((e) => e.id === id)
    const j = i + direccion
    if (i < 0 || j < 0 || j >= lista.length) return
    // Reordena en pasos de 10 para que no haya empates.
    const nuevo = [...lista]
    ;[nuevo[i], nuevo[j]] = [nuevo[j], nuevo[i]]
    for (const [k, e] of nuevo.entries()) await tx`update reparacion_etapas set orden = ${(k + 1) * 10} where id = ${e.id}`
  })
  refrescar()
}

// ── Técnicos ────────────────────────────────────────────────────────────

export async function guardarTecnico(_: Resultado, f: FormData): Promise<Resultado> {
  await requerirPermiso('reparaciones_config')
  const id = entero(f, 'id')
  const nombre = limpio(texto(f, 'nombre'), 80)
  if (!nombre) return { error: 'Poné el nombre del técnico.' }
  try {
    if (id) await db()`update tecnicos set nombre = ${nombre}, activo = ${marcado(f, 'activo')} where id = ${id}`
    else await db()`insert into tecnicos (nombre) values (${nombre})`
  } catch (e) {
    return { error: mensajeError(e, `Ya está "${nombre}" en la lista.`) }
  }
  refrescar()
  return { ok: id ? 'Técnico guardado.' : `"${nombre}" agregado.` }
}

// ── Lista de precios de reparación ──────────────────────────────────────

export async function guardarPrecio(_: Resultado, f: FormData): Promise<Resultado> {
  await requerirPermiso('reparaciones_config')
  const id = entero(f, 'id')
  const modelo = limpio(texto(f, 'modelo'), 120)
  const tipo = limpio(texto(f, 'tipo'), 120)
  const precio = parseNumero(texto(f, 'precio'))
  if (!modelo || !tipo) return { error: 'Poné el modelo y el tipo de reparación.' }
  if (precio === null || precio < 0) return { error: 'El precio no es válido.' }
  try {
    if (id)
      await db()`
        update reparacion_precios set modelo = ${modelo}, tipo = ${tipo}, precio = ${Math.round(precio * 100) / 100}, activo = ${marcado(f, 'activo')}, actualizado = now()
        where id = ${id}`
    else await db()`insert into reparacion_precios (modelo, tipo, precio) values (${modelo}, ${tipo}, ${Math.round(precio * 100) / 100})`
  } catch (e) {
    return { error: mensajeError(e, `Ya hay un precio para ${modelo} · ${tipo}: editá ese.`) }
  }
  refrescar()
  return { ok: id ? 'Precio guardado.' : `Agregado: ${modelo} · ${tipo}.` }
}

export async function borrarPrecio(id: number): Promise<void> {
  await requerirPermiso('reparaciones_config')
  await db()`delete from reparacion_precios where id = ${id}`
  refrescar()
}

/**
 * Carga varios precios pegados de una planilla: un renglón por precio, "modelo; tipo; precio"
 * (también con tabulaciones, como sale de Excel). Si ya existe ese modelo y tipo, actualiza el precio.
 */
export async function cargarPrecios(_: Resultado, f: FormData): Promise<Resultado> {
  await requerirPermiso('reparaciones_config')
  const renglones = String(f.get('lista') ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (!renglones.length) return { error: 'Pegá al menos un renglón.' }
  if (renglones.length > 2000) return { error: 'Son demasiados renglones: cargalos de a 2.000.' }
  const filas: { modelo: string; tipo: string; precio: number }[] = []
  const malos: number[] = []
  renglones.forEach((l, i) => {
    const partes = l.split(/\t|;/).map((p) => p.trim())
    const precio = parseNumero(partes[2] ?? '')
    if (partes.length < 3 || !partes[0] || !partes[1] || precio === null || precio < 0) malos.push(i + 1)
    else filas.push({ modelo: limpio(partes[0], 120), tipo: limpio(partes[1], 120), precio: Math.round(precio * 100) / 100 })
  })
  // El primer renglón puede ser el encabezado de la planilla.
  if (malos[0] === 1 && /modelo|equipo/i.test(renglones[0])) malos.shift()
  if (malos.length) return { error: `Revisá ${malos.length === 1 ? 'el renglón' : 'los renglones'} ${malos.slice(0, 10).join(', ')}: van modelo; tipo; precio.` }
  let nuevos = 0
  let actualizados = 0
  await db().begin(async (tx) => {
    for (const r of filas) {
      const [x] = await tx<{ nuevo: boolean }[]>`
        insert into reparacion_precios (modelo, tipo, precio) values (${r.modelo}, ${r.tipo}, ${r.precio})
        on conflict ((lower(modelo)), (lower(tipo))) do update set precio = excluded.precio, activo = true, actualizado = now()
        returning (xmax = 0) as nuevo`
      if (x.nuevo) nuevos++
      else actualizados++
    }
  })
  refrescar()
  return { ok: `Listo: ${nuevos} precio${nuevos === 1 ? '' : 's'} nuevo${nuevos === 1 ? '' : 's'} y ${actualizados} actualizado${actualizados === 1 ? '' : 's'}.` }
}

// ── Comprobantes ────────────────────────────────────────────────────────

export async function guardarComprobantes(_: Resultado, f: FormData): Promise<Resultado> {
  await requerirPermiso('reparaciones_config')
  const dias = entero(f, 'garantia_dias')
  if (dias === null || !(dias >= 0 && dias <= 3650)) return { error: 'Los días de garantía van de 0 a 3650.' }
  const filas = [
    { clave: 'garantia_dias', valor: String(dias) },
    ...(['clausulas_ingreso', 'clausulas_garantia', 'clausulas_entrega'] as const).map((clave) => ({
      clave,
      valor: String(f.get(clave) ?? '').replace(/\r\n/g, '\n').trim().slice(0, 6000),
    })),
  ]
  await db()`insert into ajustes ${db()(filas)} on conflict (clave) do update set valor = excluded.valor`
  refrescar()
  return { ok: 'Comprobantes guardados.' }
}
