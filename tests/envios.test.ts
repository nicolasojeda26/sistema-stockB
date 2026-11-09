import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { migrar } from '../scripts/migrate'
import { cancelarEnvio, cancelarPedido, crearEnvio, crearPedido, depositoTransito, recibirEnvio, resolverDiferencias } from '../src/lib/envios'

const url = process.env.TEST_DATABASE_URL

describe.skipIf(!url)('pedidos y envíos', () => {
  const sql = postgres(url!, { prepare: false, max: 3, onnotice: () => {}, types: { numeric: { to: 1700, from: [1700], serialize: String, parse: Number } } })
  let depCentral: number, depLocal: number, depOtro: number, transito: number, funda: number, cargador: number
  type U = { id: number; rol: 'admin' | 'vendedora' | 'deposito'; sucursal_id: number | null }
  let admin: U, lisandro: U, clarisa: U, otra: U

  beforeAll(async () => {
    await sql.unsafe('drop schema public cascade; create schema public;')
    await migrar(url!, () => {})
  })
  afterAll(() => sql.end())
  beforeEach(async () => {
    await sql`truncate envio_items, envios, pedido_items, pedidos, operaciones_stock, movimientos_stock, stock, cambios_precio, productos, usuarios restart identity cascade`
    await sql`delete from depositos where not es_transito`
    await sql`delete from sucursales`
    transito = await depositoTransito(sql)
    const [c] = await sql`insert into sucursales (nombre, tipo) values ('Depósito central', 'deposito') returning id`
    const [l] = await sql`insert into sucursales (nombre) values ('San Lorenzo 960') returning id`
    const [o] = await sql`insert into sucursales (nombre) values ('Catamarca 815') returning id`
    ;[{ id: depCentral }] = await sql`insert into depositos (nombre, sucursal_id, es_principal) values ('Depósito', ${c.id}, true) returning id`
    ;[{ id: depLocal }] = await sql`insert into depositos (nombre, sucursal_id, es_principal) values ('Local', ${l.id}, true) returning id`
    ;[{ id: depOtro }] = await sql`insert into depositos (nombre, sucursal_id, es_principal) values ('Local', ${o.id}, true) returning id`
    const usuario = async (u: string, rol: U['rol'], suc: number | null): Promise<U> => {
      const [r] = await sql`insert into usuarios (usuario, nombre, password_hash, rol, sucursal_id) values (${u}, ${u}, 'x', ${rol}, ${suc}) returning id`
      return { id: r.id, rol, sucursal_id: suc }
    }
    admin = await usuario('belen', 'admin', null)
    lisandro = await usuario('lisandro', 'deposito', c.id)
    clarisa = await usuario('clarisa', 'vendedora', l.id)
    otra = await usuario('marianela', 'vendedora', o.id)
    ;[{ id: funda }] = await sql`insert into productos (codigo, nombre, precio) values ('F1', 'Funda', 5000) returning id`
    ;[{ id: cargador }] = await sql`insert into productos (codigo, nombre, precio) values ('C1', 'Cargador', 9000) returning id`
    await sql`insert into stock (producto_id, deposito_id, cantidad) values (${funda}, ${depCentral}, 50), (${cargador}, ${depCentral}, 20)`
  })

  const stock = async (p: number, d: number) => (await sql`select coalesce(sum(cantidad), 0)::int n from stock where producto_id = ${p} and deposito_id = ${d}`)[0].n
  const estado = async (tabla: 'pedidos' | 'envios', id: number) => (await sql`select estado from ${sql(tabla)} where id = ${id}`)[0].estado

  it('pedido → envío → recepción completa', async () => {
    const { pedidoId } = await crearPedido(sql, { usuario: clarisa, items: [{ productoId: funda, cantidad: 5 }, { productoId: cargador, cantidad: 5 }], nota: 'para el finde' })
    await expect(crearPedido(sql, { usuario: lisandro, items: [{ productoId: funda, cantidad: 1 }] })).rejects.toThrow('sucursales')
    // Primer envío: solo las fundas (cargadores después).
    const { envioId } = await crearEnvio(sql, { usuario: lisandro, origenId: depCentral, destinoId: depLocal, items: [{ productoId: funda, cantidad: 5 }], pedidoId })
    expect(await estado('pedidos', pedidoId)).toBe('parcial')
    expect(await stock(funda, depCentral)).toBe(45)
    expect(await stock(funda, transito)).toBe(5)
    expect(await stock(funda, depLocal)).toBe(0) // todavía no llegó
    await expect(recibirEnvio(sql, { usuario: otra, envioId, recibidos: [{ productoId: funda, cantidad: 5 }] })).rejects.toThrow('otra sucursal')
    const r = await recibirEnvio(sql, { usuario: clarisa, envioId, recibidos: [{ productoId: funda, cantidad: 5 }] })
    expect(r.diferencias).toBe(0)
    expect(await estado('envios', envioId)).toBe('recibido')
    expect(await stock(funda, depLocal)).toBe(5)
    expect(await stock(funda, transito)).toBe(0)
    await expect(recibirEnvio(sql, { usuario: clarisa, envioId, recibidos: [] })).rejects.toThrow('ya se recibió')
    // Segundo envío completa el pedido.
    await crearEnvio(sql, { usuario: lisandro, origenId: depCentral, destinoId: depLocal, items: [{ productoId: cargador, cantidad: 5 }], pedidoId })
    expect(await estado('pedidos', pedidoId)).toBe('enviado')
  })

  it('si llega distinto, queda con diferencias y la administración resuelve', async () => {
    const { envioId } = await crearEnvio(sql, {
      usuario: lisandro,
      origenId: depCentral,
      destinoId: depLocal,
      items: [{ productoId: funda, cantidad: 5 }, { productoId: cargador, cantidad: 2 }],
    })
    const r = await recibirEnvio(sql, { usuario: clarisa, envioId, recibidos: [{ productoId: funda, cantidad: 4 }, { productoId: cargador, cantidad: 3 }] })
    expect(r.diferencias).toBe(2)
    expect(await estado('envios', envioId)).toBe('con_diferencias')
    expect(await stock(funda, depLocal)).toBe(4)
    expect(await stock(cargador, depLocal)).toBe(3)
    expect(await stock(funda, transito)).toBe(1) // la que falta sigue "en camino"
    expect(await stock(cargador, transito)).toBe(-1) // llegó uno de más
    await expect(resolverDiferencias(sql, { usuario: lisandro, envioId, accion: 'devolver' })).rejects.toThrow('administración')
    await resolverDiferencias(sql, { usuario: admin, envioId, accion: 'devolver', nota: 'quedó en el depósito' })
    expect(await stock(funda, transito)).toBe(0)
    expect(await stock(funda, depCentral)).toBe(46) // 50 − 5 + 1 devuelta
    expect(await stock(cargador, transito)).toBe(0)
    expect(await stock(cargador, depCentral)).toBe(17) // 20 − 2 − 1 que salió de más
    await expect(resolverDiferencias(sql, { usuario: admin, envioId, accion: 'perdida' })).rejects.toThrow('no tiene diferencias')
  })

  it('pérdida en el camino y cancelación', async () => {
    const a = await crearEnvio(sql, { usuario: lisandro, origenId: depCentral, destinoId: depLocal, items: [{ productoId: funda, cantidad: 3 }] })
    await recibirEnvio(sql, { usuario: clarisa, envioId: a.envioId, recibidos: [{ productoId: funda, cantidad: 2 }] })
    await resolverDiferencias(sql, { usuario: admin, envioId: a.envioId, accion: 'perdida' })
    expect(await stock(funda, transito)).toBe(0)
    expect(await stock(funda, depCentral)).toBe(47)
    // Cancelar un envío en camino: vuelve todo y el pedido queda pendiente otra vez.
    const { pedidoId } = await crearPedido(sql, { usuario: clarisa, items: [{ productoId: cargador, cantidad: 4 }] })
    const b = await crearEnvio(sql, { usuario: lisandro, origenId: depCentral, destinoId: depLocal, items: [{ productoId: cargador, cantidad: 4 }], pedidoId })
    expect(await estado('pedidos', pedidoId)).toBe('enviado')
    await expect(cancelarEnvio(sql, { usuario: clarisa, envioId: b.envioId })).rejects.toThrow('quien lo envió')
    await cancelarEnvio(sql, { usuario: lisandro, envioId: b.envioId })
    expect(await stock(cargador, depCentral)).toBe(20)
    expect(await estado('pedidos', pedidoId)).toBe('pendiente')
    await cancelarPedido(sql, { usuario: clarisa, pedidoId })
    expect(await estado('pedidos', pedidoId)).toBe('cancelado')
    // Una vendedora no envía desde el depósito central.
    await expect(crearEnvio(sql, { usuario: clarisa, origenId: depCentral, destinoId: depLocal, items: [{ productoId: funda, cantidad: 1 }] })).rejects.toThrow('tu depósito')
    await expect(crearEnvio(sql, { usuario: lisandro, origenId: depCentral, destinoId: transito, items: [{ productoId: funda, cantidad: 1 }] })).rejects.toThrow('no existe')
  })
})
