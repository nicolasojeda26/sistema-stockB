import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { migrar } from '../scripts/migrate'
import { cambiarEstadoReparacion, estadoVisible, ingresarReparacion, leerReparacion, linkWhatsApp, precioDeLista, reporteTaller } from '../src/lib/reparaciones'
import { abrirCaja, anularVenta, avanzarEntrega, entregasPendientes, registrarVenta } from '../src/lib/ventas'
import { permisosDePersona } from '../src/lib/permisos'

describe('permisos por persona', () => {
  const supervisor = { base: 'admin' as const, sistema: false, permisos: ['productos', 'ingreso', 'anular_ventas'] }
  it('suma los extra y saca los quitados', () => {
    expect(permisosDePersona(supervisor, ['envios', 'reparaciones'], ['anular_ventas'])).toEqual(['reparaciones', 'productos', 'ingreso', 'envios'])
  })
  it('a un rol de local no se le dan permisos de todas las sucursales', () => {
    const vendedor = { base: 'vendedora' as const, sistema: true, permisos: ['vender'] }
    expect(permisosDePersona(vendedor, ['reportes', 'clientes'], [])).toEqual(['vender', 'clientes'])
  })
  it('a Administración no se le quita nada', () => {
    const admin = { base: 'admin' as const, sistema: true, permisos: [] }
    expect(permisosDePersona(admin, [], ['personal'])).toContain('personal')
  })
})

describe('WhatsApp con texto en el teléfono', () => {
  it('ignora el interno', () => {
    expect(linkWhatsApp('3794 123456 int 2', 'x')).toBe('https://wa.me/5493794123456?text=x')
  })
})

const url = process.env.TEST_DATABASE_URL

describe.skipIf(!url)('área técnica y venta desde otra sucursal', () => {
  const sql = postgres(url!, { prepare: false, max: 3, onnotice: () => {}, types: { numeric: { to: 1700, from: [1700], serialize: String, parse: Number } } })
  let suc: number, otra: number, depSuc: number, depOtra: number, funda: number, tecnico: number
  type U = { id: number; rol: 'admin' | 'vendedora' | 'deposito'; sucursal_id: number | null }
  let vend: U, deOtra: U

  beforeAll(async () => {
    await sql.unsafe('drop schema public cascade; create schema public;')
    await migrar(url!, () => {})
    ;[{ id: suc }] = await sql`insert into sucursales (nombre, direccion) values ('San Lorenzo 960', 'San Lorenzo 960') returning id`
    ;[{ id: otra }] = await sql`insert into sucursales (nombre) values ('Av. Maipú 231') returning id`
    ;[{ id: depSuc }] = await sql`insert into depositos (nombre, sucursal_id, es_principal) values ('Local', ${suc}, true) returning id`
    ;[{ id: depOtra }] = await sql`insert into depositos (nombre, sucursal_id, es_principal) values ('Local', ${otra}, true) returning id`
    const [v] = await sql`insert into usuarios (usuario, nombre, password_hash, rol, sucursal_id) values ('clarisa', 'Clarisa', 'x', 'vendedora', ${suc}) returning id`
    const [o] = await sql`insert into usuarios (usuario, nombre, password_hash, rol, sucursal_id) values ('rocio', 'Rocío', 'x', 'vendedora', ${otra}) returning id`
    vend = { id: v.id, rol: 'vendedora', sucursal_id: suc }
    deOtra = { id: o.id, rol: 'vendedora', sucursal_id: otra }
    ;[{ id: funda }] = await sql`insert into productos (codigo, nombre, precio) values ('F1', 'Funda', 10000) returning id`
    await sql`insert into stock (producto_id, deposito_id, cantidad) values (${funda}, ${depOtra}, 5)`
    ;[{ id: tecnico }] = await sql`insert into tecnicos (nombre) values ('Matías') returning id`
    await sql`insert into reparacion_precios (modelo, tipo, precio) values ('Samsung A15', 'Cambio de módulo', 48000)`
    await abrirCaja(sql, { usuarioId: vend.id, sucursalId: suc, montoInicial: 0 })
  })
  afterAll(() => sql.end())

  it('estados del taller, técnico, garantía y reingreso', async () => {
    expect(await precioDeLista(sql, ' samsung a15', 'CAMBIO DE MÓDULO')).toBe(48000)
    const id = await ingresarReparacion(sql, {
      usuario: vend,
      sucursalId: suc,
      clienteNombre: 'Ana Gómez',
      clienteDni: '30123456',
      equipo: 'Samsung A15',
      tipoReparacion: 'Cambio de módulo',
      falla: 'Pantalla rota',
      presupuesto: 48000,
    })
    let r = (await leerReparacion(sql, { id }))!
    expect(r.etapa).toBe('Ingreso a sucursal')
    expect(r.token).toMatch(/^[\w-]{24}$/)
    expect((await leerReparacion(sql, { token: r.token }))!.id).toBe(id)

    const [enRevision] = await sql`select id from reparacion_etapas where nombre = 'En revisión'`
    const [listoEtapa] = await sql`select id from reparacion_etapas where fase = 'listo'`
    await expect(cambiarEstadoReparacion(sql, { usuario: vend, id, cambio: { accion: 'etapa', etapaId: listoEtapa.id } })).rejects.toThrow('Está lista')
    await cambiarEstadoReparacion(sql, { usuario: vend, id, cambio: { accion: 'etapa', etapaId: enRevision.id, tecnicoId: tecnico, nota: 'Se abre' } })
    r = (await leerReparacion(sql, { id }))!
    expect(r).toMatchObject({ estado: 'en_reparacion', etapa: 'En revisión', tecnico: 'Matías' })
    expect(estadoVisible(r)).toBe('En revisión')

    await cambiarEstadoReparacion(sql, { usuario: vend, id, cambio: { accion: 'listo', precio: 48000, tecnicoId: tecnico, garantiaDias: 30 } })
    r = (await leerReparacion(sql, { id }))!
    expect(r).toMatchObject({ estado: 'listo', etapa: 'En sucursal listo para retirar', garantia_dias: 30 })

    // Se cobra con 15 % de descuento: el rol permite 10 % en reparaciones.
    const cobrar = (pct: number, total: number) =>
      registrarVenta(sql, { usuario: vend, items: [], reparaciones: [{ id, descuentoPct: pct }], descuentoGlobalPct: 0, pagos: [{ medio: 'efectivo', monto: total }], totalEsperado: total })
    await expect(cobrar(15, 40800)).rejects.toThrow('máximo permitido (10 %)')
    await sql`update roles set descuento_max_reparacion = 20 where base = 'vendedora' and sistema`
    const venta = await cobrar(15, 40800)
    r = (await leerReparacion(sql, { id }))!
    expect(r).toMatchObject({ estado: 'entregado', cobrado: 40800 })
    expect(venta.total).toBe(40800)

    // Vuelve por garantía.
    await expect(ingresarReparacion(sql, { usuario: vend, sucursalId: suc, clienteNombre: 'Ana', equipo: 'A15', falla: 'x', garantiaDe: 9999 })).rejects.toThrow('No existe')
    const re = await ingresarReparacion(sql, { usuario: vend, sucursalId: suc, clienteNombre: 'Ana Gómez', equipo: 'Samsung A15', falla: 'Táctil falla', garantiaDe: id })
    expect((await leerReparacion(sql, { id: re }))!.garantia_de).toBe(id)
    await cambiarEstadoReparacion(sql, { usuario: vend, id: re, cambio: { accion: 'sin_reparacion', motivo: 'no_acepto' } })
    expect(estadoVisible((await leerReparacion(sql, { id: re }))!)).toBe('No aceptó el presupuesto: listo para retirar')

    // Las notas no son pasos del seguimiento.
    await cambiarEstadoReparacion(sql, { usuario: vend, id: re, cambio: { accion: 'nota', nota: 'Llamó el cliente' } })
    const [{ estado }] = await sql`select estado from reparacion_eventos where reparacion_id = ${re} order by id desc limit 1`
    expect(estado).toBe('nota')

    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
    const rep = await reporteTaller(sql, { desde: hoy, hasta: hoy, sucursalId: null })
    expect(rep.resumen).toMatchObject({ ingresaron: 2, reingresos: 1, reparados: 1, no_acepto: 1, cobrado: 40800 })
    expect(rep.porTecnico).toEqual([
      { tecnico: 'Matías', reparados: 1, sin_solucion: 0, reingresos: 1 },
      { tecnico: 'Sin técnico', reparados: 0, sin_solucion: 0, reingresos: 0 },
    ])
  })

  it('vende una funda que está en otra sucursal: sale de su stock y la otra la manda', async () => {
    const v = await registrarVenta(sql, {
      usuario: vend,
      items: [{ productoId: funda, cantidad: 2, descuentoPct: 0, origen: { sucursalId: otra, entrega: 'envio' } }],
      descuentoGlobalPct: 0,
      pagos: [{ medio: 'efectivo', monto: 20000 }],
      totalEsperado: 20000,
    })
    const stock = async (dep: number) => (await sql`select coalesce(sum(cantidad), 0)::int as c from stock where producto_id = ${funda} and deposito_id = ${dep}`)[0].c
    expect(await stock(depOtra)).toBe(3)
    expect(await stock(depSuc)).toBe(0)

    const [pend] = await entregasPendientes(sql, otra)
    expect(pend).toMatchObject({ venta_id: v.ventaId, entrega: 'envio', entrega_estado: 'pendiente', origen: 'Av. Maipú 231', vende: 'San Lorenzo 960' })
    // La que vendió no puede marcar el envío; la de origen sí.
    await expect(avanzarEntrega(sql, { itemId: pend.id, usuario: vend, sucursalId: suc })).rejects.toThrow('sucursal de donde sale')
    await avanzarEntrega(sql, { itemId: pend.id, usuario: deOtra, sucursalId: otra })
    await expect(avanzarEntrega(sql, { itemId: pend.id, usuario: deOtra, sucursalId: otra })).rejects.toThrow('sucursal que vendió')
    await avanzarEntrega(sql, { itemId: pend.id, usuario: vend, sucursalId: suc })
    expect(await entregasPendientes(sql, suc)).toEqual([])

    // Anulada, el stock vuelve a la sucursal de origen.
    await anularVenta(sql, { ventaId: v.ventaId, usuarioId: vend.id, motivo: 'Prueba' })
    expect(await stock(depOtra)).toBe(5)
  })

  it('el tope de descuento propio pisa el del rol', async () => {
    const vender = (pct: number) =>
      registrarVenta(sql, {
        usuario: vend,
        items: [{ productoId: funda, cantidad: 1, descuentoPct: pct, origen: { sucursalId: otra, entrega: 'retira' } }],
        descuentoGlobalPct: 0,
        pagos: [{ medio: 'efectivo', monto: 10000 * (1 - pct / 100) }],
        totalEsperado: 10000 * (1 - pct / 100),
      })
    await expect(vender(25)).rejects.toThrow('(10 %)')
    await sql`update usuarios set descuento_max = 30 where id = ${vend.id}`
    const v = await vender(25)
    const [i] = await sql`select entrega, entrega_estado from venta_items where venta_id = ${v.ventaId}`
    expect(i).toMatchObject({ entrega: 'retira', entrega_estado: 'pendiente' })
  })
})
