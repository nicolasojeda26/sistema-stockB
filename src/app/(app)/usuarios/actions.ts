'use server'

import { revalidatePath } from 'next/cache'
import type { Sql, TransactionSql } from 'postgres'
import { db } from '@/lib/db'
import { requerirPermiso } from '@/lib/dal'
import { entero, marcado, mensajeError, texto } from '@/lib/errores'
import { PASSWORD_MIN, hashPassword } from '@/lib/password'
import { DIAS_CODIGO, generarCodigoAcceso } from '@/lib/acceso'
import { normalizarPermisos, permisosDePersona, permisosDeRol, PERMISOS, type Base } from '@/lib/permisos'
import type { Resultado } from '@/components/form-accion'

const RE_USUARIO = /^[a-z0-9._-]{3,30}$/

class ErrorPersonal extends Error {}

type Rol = { id: number; nombre: string; base: Base; sistema: boolean; permisos: string[] }
type Consulta = Sql | TransactionSql

async function leerRol(sql: Consulta, id: number | null): Promise<Rol | null> {
  if (!id) return null
  const [r] = await sql<Rol[]>`select id, nombre, base, sistema, permisos from roles where id = ${id}`
  return r ?? null
}

/** Porcentaje de 0 a 100. Vacío → `vacio` (para el tope propio: usar el del rol). Inválido → undefined. */
function leerPorcentaje(f: FormData, campo: string, vacio: number | null): number | null | undefined {
  const t = String(f.get(campo) ?? '').trim()
  if (!t) return vacio
  const v = Number(t.replace(',', '.'))
  return Number.isFinite(v) && v >= 0 && v <= 100 ? Math.round(v * 100) / 100 : undefined
}
const leerDescuento = (f: FormData) => leerPorcentaje(f, 'descuento_max', null)

/** Permisos tildados para la persona, comparados con los de su rol: lo que se agrega y lo que se quita. */
function leerPermisosPersona(f: FormData, rol: Rol): { extra: string[]; quitados: string[] } | null {
  if (!f.has('permisos_persona')) return null
  if (rol.sistema && rol.base === 'admin') return { extra: [], quitados: [] }
  const delRol = new Set<string>(permisosDeRol(rol))
  const tildados = new Set<string>(normalizarPermisos(f.getAll('permiso_persona').map(String), rol.base))
  return {
    extra: [...tildados].filter((p) => !delRol.has(p)),
    quitados: [...delRol].filter((p) => !tildados.has(p)),
  }
}

/** Quien vende trabaja en un local u online; el depósito, en el depósito; "todas" no necesita lugar. */
async function validarLugar(base: Base, sucursalId: number | null): Promise<string | null> {
  if (base === 'admin') return null
  if (!sucursalId) return base === 'deposito' ? 'Elegí el depósito.' : 'Elegí en qué sucursal trabaja.'
  const [s] = await db()<{ tipo: string; activa: boolean }[]>`select tipo, activa from sucursales where id = ${sucursalId}`
  if (!s || !s.activa) return 'La sucursal no existe o está desactivada.'
  if (base === 'deposito' && s.tipo !== 'deposito') return 'Ese rol trabaja en el depósito: elegí el depósito, o cambiale el rol.'
  if (base === 'vendedora' && s.tipo === 'deposito') return 'Ese rol trabaja en un local u online: elegí un local, o cambiale el rol.'
  return null
}

/** Nunca puede quedar el sistema sin nadie que maneje el personal. */
async function verificarQueQuedaAdministracion(tx: TransactionSql) {
  const filas = await tx<{ base: Base; sistema: boolean; permisos: string[]; extra: string[]; quitados: string[] }[]>`
    select r.base, r.sistema, r.permisos, u.permisos_extra as extra, u.permisos_quitados as quitados
    from usuarios u join roles r on r.id = u.rol_id where u.activo`
  if (!filas.some((r) => permisosDePersona(r, r.extra, r.quitados).includes('personal')))
    throw new ErrorPersonal('Tiene que quedar al menos una persona activa que pueda manejar el personal.')
}

/**
 * Técnico de la lista que es esta persona (campo «tecnico»): vacío = ninguno, «nuevo» = se suma con su nombre.
 * Un técnico tiene un solo usuario. Sin el campo en el formulario, `undefined` (no se toca).
 */
async function tecnicoElegido(tx: Consulta, f: FormData, nombre: string, usuarioId: number | null): Promise<number | null | undefined> {
  if (!f.has('tecnico')) return undefined
  const v = String(f.get('tecnico') ?? '')
  if (!v) return null
  let id: number
  if (v === 'nuevo') {
    const [t] = await tx<{ id: number }[]>`
      insert into tecnicos (nombre) values (${nombre.slice(0, 80)})
      on conflict ((lower(nombre))) do update set activo = true returning id`
    id = t.id
  } else {
    id = Number(v)
    const [t] = await tx<{ id: number }[]>`select id from tecnicos where id = ${Number.isInteger(id) ? id : 0}`
    if (!t) throw new ErrorPersonal('Ese técnico no está en la lista.')
  }
  const [otro] = await tx<{ nombre: string }[]>`select nombre from usuarios where tecnico_id = ${id} and id <> ${usuarioId ?? 0}`
  if (otro) throw new ErrorPersonal(`Ese técnico ya es el usuario de ${otro.nombre}.`)
  return id
}

const anotar = (sql: Consulta, usuarioId: number, cambio: string, detalle: string, hechoPor: number) =>
  sql`insert into personal_historial (usuario_id, cambio, detalle, hecho_por) values (${usuarioId}, ${cambio}, ${detalle}, ${hechoPor})`

async function nombreSucursal(sql: Consulta, id: number | null) {
  if (!id) return 'todas las sucursales'
  const [s] = await sql<{ nombre: string }[]>`select nombre from sucursales where id = ${id}`
  return s?.nombre ?? '—'
}

const refrescar = () => revalidatePath('/usuarios')

const mensajeCodigo = (usuario: string, codigo: string) =>
  `Usuario "${usuario}" listo. Código de acceso: ${codigo} (vence en ${DIAS_CODIGO} días). Pasáselo: entra en "Entrá con tu código de acceso" y crea su propia contraseña.`

export async function crearUsuario(_: Resultado, f: FormData): Promise<Resultado> {
  const yo = await requerirPermiso('personal')
  const usuario = texto(f, 'usuario').toLowerCase()
  const nombre = texto(f, 'nombre')
  const rol = await leerRol(db(), entero(f, 'rol_id'))
  const sucursalPedida = entero(f, 'sucursal_id')
  const password = String(f.get('password') ?? '')
  const descuentoMax = leerDescuento(f)

  if (descuentoMax === undefined) return { error: 'El descuento máximo va de 0 a 100 %.' }
  if (!RE_USUARIO.test(usuario)) return { error: 'El usuario va en minúsculas, sin espacios, de 3 a 30 letras o números (ej.: sofia).' }
  if (!nombre) return { error: 'Poné el nombre.' }
  if (!rol) return { error: 'Elegí el rol.' }
  const lugar = await validarLugar(rol.base, sucursalPedida)
  if (lugar) return { error: lugar }
  if (password && password.length < PASSWORD_MIN) return { error: `La contraseña tiene que tener al menos ${PASSWORD_MIN} caracteres.` }
  const sucursalId = rol.base === 'admin' ? null : sucursalPedida

  let id: number
  try {
    id = await db().begin(async (tx) => {
      const [u] = await tx<{ id: number }[]>`
        insert into usuarios (usuario, nombre, password_hash, rol, rol_id, sucursal_id, descuento_max)
        values (${usuario}, ${nombre}, ${password ? await hashPassword(password) : null}, ${rol.base}, ${rol.id}, ${sucursalId}, ${descuentoMax})
        returning id`
      await anotar(tx, u.id, 'alta', `Alta como ${rol.nombre} en ${await nombreSucursal(tx, sucursalId)}.`, yo.id)
      const tecnico = await tecnicoElegido(tx, f, nombre, u.id)
      if (tecnico) await tx`update usuarios set tecnico_id = ${tecnico} where id = ${u.id}`
      return u.id
    })
  } catch (e) {
    return { error: e instanceof ErrorPersonal ? e.message : mensajeError(e, `Ya existe el usuario "${usuario}".`) }
  }
  refrescar()
  if (password) return { ok: `Usuario "${usuario}" creado. Ya puede entrar con su contraseña.` }
  return { ok: mensajeCodigo(usuario, await generarCodigoAcceso(db(), id, false)) }
}

export async function editarUsuario(_: Resultado, f: FormData): Promise<Resultado> {
  const yo = await requerirPermiso('personal')
  const id = entero(f, 'id')
  const nombre = texto(f, 'nombre')
  const rol = await leerRol(db(), entero(f, 'rol_id'))
  const sucursalPedida = entero(f, 'sucursal_id')
  const activo = marcado(f, 'activo')
  const descuentoMax = leerDescuento(f)
  if (!id || !nombre || !rol) return { error: 'Faltan datos.' }
  if (descuentoMax === undefined) return { error: 'El descuento máximo va de 0 a 100 %.' }
  const propios = leerPermisosPersona(f, rol)
  const lugar = await validarLugar(rol.base, sucursalPedida)
  if (lugar) return { error: lugar }
  const sucursalId = rol.base === 'admin' ? null : sucursalPedida
  if (id === yo.id && !activo) return { error: 'No podés darte de baja a vos misma.' }
  if (id === yo.id && !permisosDePersona(rol, propios?.extra ?? yo.permisos, propios?.quitados ?? []).includes('personal'))
    return { error: 'No podés sacarte el permiso de manejar el personal.' }

  try {
    await db().begin(async (tx) => {
      const [antes] = await tx<{
        nombre: string
        rol_id: number
        rol_nombre: string
        sucursal_id: number | null
        activo: boolean
        descuento_max: number | null
        permisos_extra: string[]
        permisos_quitados: string[]
        tecnico_id: number | null
        tecnico: string | null
      }[]>`
        select u.nombre, u.rol_id, r.nombre as rol_nombre, u.sucursal_id, u.activo, u.descuento_max::float as descuento_max, u.permisos_extra, u.permisos_quitados,
          u.tecnico_id, t.nombre as tecnico
        from usuarios u join roles r on r.id = u.rol_id left join tecnicos t on t.id = u.tecnico_id where u.id = ${id} for update of u`
      if (!antes) throw new ErrorPersonal('Esa persona no existe.')
      const tecnico = await tecnicoElegido(tx, f, nombre, id)
      if (tecnico !== undefined && tecnico !== antes.tecnico_id) {
        await tx`update usuarios set tecnico_id = ${tecnico} where id = ${id}`
        const [t] = tecnico ? await tx<{ nombre: string }[]>`select nombre from tecnicos where id = ${tecnico}` : []
        await anotar(tx, id, 'datos', t ? `Es el técnico «${t.nombre}» del área técnica.` : `Ya no figura como técnico${antes.tecnico ? ` («${antes.tecnico}»)` : ''}.`, yo.id)
      }
      await tx`
        update usuarios set
          nombre = ${nombre}, rol_id = ${rol.id}, sucursal_id = ${sucursalId}, activo = ${activo}, descuento_max = ${descuentoMax},
          permisos_extra = ${propios?.extra ?? antes.permisos_extra}, permisos_quitados = ${propios?.quitados ?? antes.permisos_quitados},
          version_sesion = case when activo <> ${activo} or sucursal_id is distinct from ${sucursalId} then version_sesion + 1 else version_sesion end
        where id = ${id}`
      if (antes.rol_id !== rol.id) await anotar(tx, id, 'rol', `Rol: ${antes.rol_nombre} → ${rol.nombre}.`, yo.id)
      if (antes.sucursal_id !== sucursalId)
        await anotar(tx, id, 'sucursal', `Pasó de ${await nombreSucursal(tx, antes.sucursal_id)} a ${await nombreSucursal(tx, sucursalId)}.`, yo.id)
      if (antes.activo !== activo)
        await anotar(tx, id, activo ? 'reactivacion' : 'baja', activo ? 'Volvió a tener acceso.' : 'Dado de baja: ya no puede entrar.', yo.id)
      const datos = [
        antes.nombre !== nombre && `Nombre: ${antes.nombre} → ${nombre}`,
        antes.descuento_max !== descuentoMax &&
          `Descuento máximo: ${antes.descuento_max ?? 'el del rol'}${antes.descuento_max != null ? ' %' : ''} → ${descuentoMax ?? 'el del rol'}${descuentoMax != null ? ' %' : ''}`,
      ].filter(Boolean)
      if (propios) {
        const sumados = propios.extra.filter((p) => !antes.permisos_extra.includes(p))
        const sacados = propios.quitados.filter((p) => !antes.permisos_quitados.includes(p))
        const volvieron = [...antes.permisos_extra.filter((p) => !propios.extra.includes(p)), ...antes.permisos_quitados.filter((p) => !propios.quitados.includes(p))]
        const nombreP = (c: string) => PERMISOS.find((x) => x.clave === c)?.texto ?? c
        if (sumados.length) datos.push(`Permisos agregados: ${sumados.map(nombreP).join(', ')}`)
        if (sacados.length) datos.push(`Permisos quitados: ${sacados.map(nombreP).join(', ')}`)
        if (volvieron.length) datos.push(`Vuelven a ser como el rol: ${volvieron.map(nombreP).join(', ')}`)
      }
      if (datos.length) await anotar(tx, id, 'datos', `${datos.join('. ')}.`, yo.id)
      await verificarQueQuedaAdministracion(tx)
    })
  } catch (e) {
    return { error: e instanceof ErrorPersonal ? e.message : mensajeError(e) }
  }
  refrescar()
  return { ok: 'Cambios guardados.' }
}

/** Pase rápido de una persona a otra sucursal, sin tocar su rol. */
export async function moverUsuario(id: number, sucursalId: number): Promise<{ ok?: string; error?: string }> {
  const yo = await requerirPermiso('personal')
  if (!Number.isInteger(id) || !Number.isInteger(sucursalId)) return { error: 'Elegí a dónde pasa.' }
  const [u] = await db()<{ nombre: string; base: Base; rol_nombre: string; sucursal_id: number | null }[]>`
    select u.nombre, r.base, r.nombre as rol_nombre, u.sucursal_id from usuarios u join roles r on r.id = u.rol_id where u.id = ${id}`
  if (!u) return { error: 'Esa persona no existe.' }
  if (u.base === 'admin') return { error: `${u.nombre} trabaja en todas las sucursales (${u.rol_nombre}). Para ubicarla en una, cambiale el rol.` }
  if (u.sucursal_id === sucursalId) return { error: `${u.nombre} ya está ahí.` }
  const lugar = await validarLugar(u.base, sucursalId)
  if (lugar) return { error: lugar }
  const destino = await nombreSucursal(db(), sucursalId)
  await db().begin(async (tx) => {
    await tx`update usuarios set sucursal_id = ${sucursalId}, version_sesion = version_sesion + 1 where id = ${id}`
    await anotar(tx, id, 'sucursal', `Pasó de ${await nombreSucursal(tx, u.sucursal_id)} a ${destino}.`, yo.id)
  })
  refrescar()
  return { ok: `${u.nombre} pasó a ${destino}.` }
}

export async function cambiarPassword(_: Resultado, f: FormData): Promise<Resultado> {
  const yo = await requerirPermiso('personal')
  const id = entero(f, 'id')
  const password = String(f.get('password') ?? '')
  if (!id) return { error: 'Falta el usuario.' }
  if (password.length < PASSWORD_MIN) return { error: `La contraseña tiene que tener al menos ${PASSWORD_MIN} caracteres.` }
  // Cambiar la contraseña cierra las sesiones abiertas de ese usuario.
  await db()`update usuarios set password_hash = ${await hashPassword(password)}, version_sesion = version_sesion + 1 where id = ${id}`
  // Si estaba bloqueada por intentos fallidos, con la contraseña nueva ya puede entrar.
  await db()`delete from intentos_login where usuario = (select usuario from usuarios where id = ${id})`
  await anotar(db(), id, 'acceso', id === yo.id ? 'Cambió su contraseña.' : 'Le pusieron una contraseña nueva.', yo.id)
  return { ok: 'Contraseña cambiada. Las sesiones abiertas se cerraron.' }
}

/** Código para que la persona cree (o vuelva a crear) su contraseña. Borra la anterior y cierra sus sesiones. */
export async function codigoAcceso(id: number): Promise<{ codigo?: string; error?: string }> {
  const yo = await requerirPermiso('personal')
  if (!Number.isInteger(id)) return { error: 'Falta el usuario.' }
  if (id === yo.id) return { error: 'Para cambiar tu propia contraseña usá "Cambiar contraseña".' }
  const [u] = await db()<{ activo: boolean }[]>`select activo from usuarios where id = ${id}`
  if (!u?.activo) return { error: 'Ese usuario no tiene acceso: activalo primero.' }
  const codigo = await generarCodigoAcceso(db(), id, true)
  await db()`delete from intentos_login where usuario = (select usuario from usuarios where id = ${id})`
  await anotar(db(), id, 'acceso', 'Se generó un código de acceso nuevo.', yo.id)
  refrescar()
  return { codigo }
}

// ── Roles ────────────────────────────────────────────────────────────────

function leerBase(f: FormData): Base | null {
  const b = texto(f, 'base')
  return b === 'admin' || b === 'vendedora' || b === 'deposito' ? b : null
}

export async function guardarRol(_: Resultado, f: FormData): Promise<Resultado> {
  const yo = await requerirPermiso('personal')
  const id = entero(f, 'id')
  const nombre = texto(f, 'nombre').replace(/\s+/g, ' ')
  const descripcion = texto(f, 'descripcion').slice(0, 200) || null
  const baseNueva = leerBase(f)
  if (nombre.length < 2 || nombre.length > 40) return { error: 'El nombre del rol va de 2 a 40 letras.' }
  if (!baseNueva) return { error: 'Elegí dónde trabaja quien tenga este rol.' }

  try {
    const r = await db().begin(async (tx) => {
      const actual = id ? await leerRol(tx, id) : null
      if (id && !actual) throw new ErrorPersonal('Ese rol no existe.')
      if (actual?.sistema && actual.base === 'admin') throw new ErrorPersonal('El rol Administración tiene todos los permisos y no se modifica.')
      const [{ n }] = id ? await tx<{ n: number }[]>`select count(*)::int as n from usuarios where rol_id = ${id}` : [{ n: 0 }]
      // Con gente asignada, la base no cambia: dejaría a esas personas en un lugar que no corresponde.
      if (actual && n > 0 && baseNueva !== actual.base)
        throw new ErrorPersonal(`Este rol lo tienen ${n} persona${n === 1 ? '' : 's'}: para cambiar dónde trabaja, pasalas antes a otro rol.`)
      const permisos = normalizarPermisos(f.getAll('permisos').map(String), baseNueva)
      const dMax = leerPorcentaje(f, 'descuento_max', 10)
      const dRep = leerPorcentaje(f, 'descuento_max_reparacion', 10)
      if (dMax == null || dRep == null) throw new ErrorPersonal('Los descuentos máximos van de 0 a 100 %.')
      if (actual) {
        await tx`
          update roles set nombre = ${nombre}, descripcion = ${descripcion}, base = ${baseNueva}, permisos = ${permisos},
            descuento_max = ${dMax}, descuento_max_reparacion = ${dRep}
          where id = ${actual.id}`
        if (yo.rol_id === actual.id && !permisosDeRol({ base: baseNueva, sistema: actual.sistema, permisos }).includes('personal'))
          throw new ErrorPersonal('Es tu propio rol: si le sacás "Personal, roles y permisos" te quedarías sin acceso a esta pantalla.')
      } else {
        await tx`
          insert into roles (nombre, descripcion, base, permisos, descuento_max, descuento_max_reparacion)
          values (${nombre}, ${descripcion}, ${baseNueva}, ${permisos}, ${dMax}, ${dRep})`
      }
      await verificarQueQuedaAdministracion(tx)
      return { permisos: permisos.length, nuevo: !actual }
    })
    refrescar()
    return {
      ok: r.nuevo
        ? `Rol "${nombre}" creado con ${r.permisos} permiso${r.permisos === 1 ? '' : 's'}. Ya lo podés asignar.`
        : `Rol "${nombre}" guardado. Los cambios rigen desde ya para quienes lo tienen.`,
    }
  } catch (e) {
    return { error: e instanceof ErrorPersonal ? e.message : mensajeError(e, `Ya hay un rol que se llama "${nombre}".`) }
  }
}

export async function borrarRol(id: number): Promise<{ error?: string }> {
  await requerirPermiso('personal')
  const r = await leerRol(db(), id)
  if (!r) return { error: 'Ese rol no existe.' }
  if (r.sistema) return { error: 'Los roles que vienen con el sistema no se borran.' }
  const [{ n }] = await db()<{ n: number }[]>`select count(*)::int as n from usuarios where rol_id = ${id}`
  if (n > 0) return { error: `Lo tienen ${n} persona${n === 1 ? '' : 's'} (contando las dadas de baja): pasalas antes a otro rol.` }
  await db()`delete from roles where id = ${id}`
  refrescar()
  return {}
}
