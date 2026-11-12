import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { migrar } from '../scripts/migrate'
import { normalizarPermisos, permisosDeRol, puedeEn, TODOS } from '../src/lib/permisos'
import { registrarCompra } from '../src/lib/compras'

describe('permisos (catálogo)', () => {
  it('el rol de administración del sistema tiene todo', () => {
    expect(permisosDeRol({ base: 'admin', sistema: true, permisos: [] })).toEqual(TODOS)
  })
  it('un rol de local no puede tener permisos de todas las sucursales', () => {
    expect(normalizarPermisos(['vender', 'compras', 'reportes', 'personal', 'inventado', 'vender'], 'vendedora')).toEqual(['vender'])
    expect(normalizarPermisos(['compras', 'vender'], 'admin')).toEqual(['vender', 'compras'])
  })
  it('sin lista de permisos, la lógica usa los de fábrica de la base', () => {
    expect(puedeEn({ rol: 'admin' }, 'compras')).toBe(true)
    expect(puedeEn({ rol: 'vendedora' }, 'compras')).toBe(false)
    expect(puedeEn({ rol: 'vendedora' }, 'vender')).toBe(true)
    expect(puedeEn({ rol: 'deposito' }, 'envios')).toBe(true)
    // Con lista explícita manda la lista: un rol de "todas las sucursales" sin compras no compra.
    expect(puedeEn({ rol: 'admin', permisos: ['reportes'] }, 'compras')).toBe(false)
  })
})

const url = process.env.TEST_DATABASE_URL

describe.skipIf(!url)('roles en la base', () => {
  const sql = postgres(url!, { prepare: false, max: 2, onnotice: () => {}, types: { numeric: { to: 1700, from: [1700], serialize: String, parse: Number } } })
  beforeAll(async () => {
    await sql.unsafe('drop schema public cascade; create schema public;')
    await migrar(url!, () => {})
  })
  afterAll(() => sql.end())

  it('trae los tres roles del sistema y asigna el rol según la base', async () => {
    const roles = await sql<{ nombre: string; base: string }[]>`select nombre, base from roles where sistema order by id`
    expect(roles.map((r) => r.base)).toEqual(['admin', 'vendedora', 'deposito'])
    const [s] = await sql`insert into sucursales (nombre) values ('Centro') returning id`
    const [u] = await sql<{ rol_id: number }[]>`insert into usuarios (usuario, nombre, password_hash, rol, sucursal_id) values ('ana', 'Ana', 'x', 'vendedora', ${s.id}) returning rol_id`
    const [r] = await sql<{ nombre: string }[]>`select nombre from roles where id = ${u.rol_id}`
    expect(r.nombre).toBe('Vendedor/a')
  })

  it('al asignar un rol, usuarios.rol sigue su base', async () => {
    const [contador] = await sql<{ id: number }[]>`insert into roles (nombre, base, permisos) values ('Contador', 'admin', '{reportes}') returning id`
    const [u] = await sql<{ rol: string; rol_id: number }[]>`update usuarios set rol_id = ${contador.id}, sucursal_id = null where usuario = 'ana' returning rol, rol_id`
    expect(u.rol).toBe('admin')
    // Un rol de "todas las sucursales" sin el permiso de compras no puede cargar compras.
    await expect(
      registrarCompra(sql, {
        usuario: { id: 1, rol: 'admin', permisos: ['reportes'] },
        proveedorId: null,
        depositoId: 1,
        fecha: '2026-11-12',
        numero: null,
        items: [{ productoId: 1, cantidad: 1, costo: 100 }],
        pago: { monto: 0, medio: 'efectivo', desdeCaja: false },
        nota: null,
      } as unknown as Parameters<typeof registrarCompra>[1]),
    ).rejects.toThrow('permiso')
  })
})
