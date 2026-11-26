import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { migrar } from '../scripts/migrate'
import { cambiarEstadoReparacion, ingresarReparacion, leerReparacion } from '../src/lib/reparaciones'
import { soloTaller } from '../src/lib/permisos'

describe('perfil del área técnica', () => {
  it('solo taller: informa estados y nada más', () => {
    expect(soloTaller({ permisos: ['reparaciones_estado'] })).toBe(true)
    expect(soloTaller({ permisos: ['reparaciones_estado', 'reparaciones_config'] })).toBe(true)
    expect(soloTaller({ permisos: ['reparaciones_estado', 'vender'] })).toBe(false)
    expect(soloTaller({ permisos: ['reparaciones_config'] })).toBe(false)
    expect(soloTaller({ permisos: [] })).toBe(false)
  })
})

const url = process.env.TEST_DATABASE_URL

describe.skipIf(!url)('técnicos con usuario', () => {
  const sql = postgres(url!, { prepare: false, max: 3, onnotice: () => {}, types: { numeric: { to: 1700, from: [1700], serialize: String, parse: Number } } })
  let suc: number, otra: number, matias: number, rep: number, enRevision: number
  type Q = { id: number; rol: 'admin' | 'vendedora' | 'deposito'; sucursal_id: number | null; permisos?: string[]; tecnico_id?: number | null }
  let vend: Q, tecnico: Q, soloRecibe: Q

  beforeAll(async () => {
    await sql.unsafe('drop schema public cascade; create schema public;')
    await migrar(url!, () => {})
    ;[{ id: suc }] = await sql`insert into sucursales (nombre) values ('San Lorenzo 960') returning id`
    ;[{ id: otra }] = await sql`insert into sucursales (nombre) values ('Irigoyen 1933') returning id`
    ;[{ id: matias }] = await sql`insert into tecnicos (nombre) values ('Matías') returning id`
    const [rolTaller] = await sql`select id, base, permisos from roles where nombre = 'Área técnica'`
    expect(rolTaller).toMatchObject({ base: 'admin', permisos: ['reparaciones_estado'] })
    const [v] = await sql`insert into usuarios (usuario, nombre, password_hash, rol, sucursal_id) values ('clarisa', 'Clarisa', 'x', 'vendedora', ${suc}) returning id`
    const [t] = await sql`insert into usuarios (usuario, nombre, password_hash, rol, rol_id, tecnico_id) values ('matias', 'Matías', 'x', 'admin', ${rolTaller.id}, ${matias}) returning id`
    vend = { id: v.id, rol: 'vendedora', sucursal_id: suc }
    tecnico = { id: t.id, rol: 'admin', sucursal_id: null, permisos: ['reparaciones_estado'], tecnico_id: matias }
    soloRecibe = { id: v.id, rol: 'vendedora', sucursal_id: suc, permisos: ['vender', 'reparaciones'] }
    rep = await ingresarReparacion(sql, { usuario: vend, sucursalId: suc, clienteNombre: 'Ana', equipo: 'Samsung A54', falla: 'No carga' })
    ;[{ id: enRevision }] = await sql`select id from reparacion_etapas where nombre = 'En revisión'`
  })
  afterAll(() => sql.end())

  it('el vendedor/a de fábrica conserva informar estados (la migración se lo suma)', async () => {
    const [r] = await sql`select permisos from roles where nombre = 'Vendedor/a'`
    if (r.permisos.includes('reparaciones')) expect(r.permisos).toContain('reparaciones_estado')
  })

  it('el técnico informa el estado de un equipo de cualquier sucursal y queda como técnico', async () => {
    await cambiarEstadoReparacion(sql, { usuario: tecnico, id: rep, cambio: { accion: 'etapa', etapaId: enRevision } })
    const r = (await leerReparacion(sql, { id: rep }))!
    expect(r).toMatchObject({ estado: 'en_reparacion', etapa: 'En revisión', tecnico: 'Matías', sucursal_id: suc })
    await cambiarEstadoReparacion(sql, { usuario: tecnico, id: rep, cambio: { accion: 'listo', precio: 30000, garantiaDias: 30 } })
    expect((await leerReparacion(sql, { id: rep }))!).toMatchObject({ estado: 'listo', tecnico: 'Matías', precio: 30000 })
  })

  it('el técnico no recibe, no entrega ni cancela', async () => {
    await expect(ingresarReparacion(sql, { usuario: tecnico, sucursalId: otra, clienteNombre: 'X', equipo: 'Y', falla: 'Z' })).rejects.toThrow('la sucursal')
    await expect(cambiarEstadoReparacion(sql, { usuario: tecnico, id: rep, cambio: { accion: 'cancelar' } })).rejects.toThrow('la sucursal')
    // Las notas internas sí.
    await cambiarEstadoReparacion(sql, { usuario: tecnico, id: rep, cambio: { accion: 'nota', nota: 'Se cambió el pin de carga' } })
  })

  it('sin el permiso de estados, la sucursal no cambia el estado', async () => {
    await expect(cambiarEstadoReparacion(sql, { usuario: soloRecibe, id: rep, cambio: { accion: 'etapa', etapaId: enRevision } })).rejects.toThrow('área técnica')
    await cambiarEstadoReparacion(sql, { usuario: soloRecibe, id: rep, cambio: { accion: 'nota', nota: 'Avisado por WhatsApp' } })
  })

  it('un técnico tiene un solo usuario', async () => {
    const [rolTaller] = await sql`select id from roles where nombre = 'Área técnica'`
    await expect(sql`insert into usuarios (usuario, nombre, password_hash, rol, rol_id, tecnico_id) values ('matias2', 'Otro', 'x', 'admin', ${rolTaller.id}, ${matias})`).rejects.toThrow()
  })
})
