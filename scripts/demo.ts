// Carga datos de ejemplo para probar el sistema (no usar en la base real).
// Uso: npm run db:demo
import postgres from 'postgres'
import { hashPassword } from '../src/lib/password'
import { codigoInterno } from '../src/lib/codigos'
import { nombreVariante, ordenTalle } from '../src/lib/articulos'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('Falta DATABASE_URL')
  process.exit(1)
}
const sql = postgres(url, { prepare: false, max: 1 })

const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from productos`
if (n > 0 && !process.argv.includes('--forzar')) {
  console.error('La base ya tiene productos. Si igual querés cargar la demo: npm run db:demo -- --forzar')
  process.exit(1)
}

const clave = await hashPassword('demo1234')
await sql.begin(async (tx) => {
  const suc = await tx<{ id: number; nombre: string }[]>`
    insert into sucursales (nombre, direccion) values ('Centro', 'Junín 1450'), ('Shopping', 'Av. 3 de Abril 950')
    on conflict (nombre) do update set direccion = excluded.direccion returning id, nombre`
  for (const s of suc) {
    await tx`insert into depositos (nombre, sucursal_id, es_principal) values ('Local', ${s.id}, true) on conflict do nothing`
  }
  await tx`insert into depositos (nombre, sucursal_id) values ('Trastienda', ${suc[0].id}) on conflict do nothing`
  await tx`insert into depositos (nombre, sucursal_id) values ('Depósito central', null) on conflict do nothing`

  await tx`
    insert into usuarios (usuario, nombre, password_hash, rol, sucursal_id) values
      ('belen', 'Belen', ${clave}, 'admin', null),
      ('sofia', 'Sofía Gómez', ${clave}, 'vendedora', ${suc[0].id}),
      ('camila', 'Camila Ríos', ${clave}, 'vendedora', ${suc[1].id})
    on conflict (usuario) do nothing`

  const cats = ['Remeras', 'Pantalones', 'Vestidos', 'Abrigos', 'Accesorios']
  for (const c of cats) await tx`insert into categorias (nombre) values (${c}) on conflict do nothing`
  const idCat = Object.fromEntries((await tx<{ id: number; nombre: string }[]>`select id, nombre from categorias`).map((c) => [c.nombre, c.id]))

  const productos: [string, string, string, number, number, number][] = [
    ['7790001000011', 'Remera lisa algodón negra M', 'Remeras', 6500, 14900, 3],
    ['7790001000028', 'Remera lisa algodón blanca S', 'Remeras', 6500, 14900, 3],
    ['7790001000035', 'Remera oversize estampada L', 'Remeras', 8200, 18500, 2],
    ['7790001000042', 'Jean mom celeste 38', 'Pantalones', 17800, 39900, 2],
    ['7790001000059', 'Jean recto negro 40', 'Pantalones', 18500, 41500, 2],
    ['7790001000066', 'Pantalón sastrero beige M', 'Pantalones', 14200, 32900, 2],
    ['7790001000073', 'Vestido midi floreado S', 'Vestidos', 19900, 45900, 1],
    ['7790001000080', 'Vestido lino verde M', 'Vestidos', 21500, 48900, 1],
    ['7790001000097', 'Campera puffer negra M', 'Abrigos', 38000, 89900, 1],
    ['7790001000103', 'Saco de paño camel L', 'Abrigos', 41000, 95000, 1],
    ['7790001000110', 'Cinturón cuero marrón', 'Accesorios', 5200, 12900, 4],
    ['7790001000127', 'Bandolera ecocuero negra', 'Accesorios', 11800, 27500, 2],
  ]
  const deps = await tx<{ id: number; sucursal_id: number | null; es_principal: boolean }[]>`select id, sucursal_id, es_principal from depositos`
  const principales = deps.filter((d) => d.es_principal)
  let i = 0
  for (const [codigo, nombre, cat, costo, precio, minimo] of productos) {
    const [p] = await tx<{ id: number }[]>`
      insert into productos (codigo, nombre, categoria_id, costo, precio, stock_minimo)
      values (${codigo}, ${nombre}, ${idCat[cat]}, ${costo}, ${precio}, ${minimo})
      on conflict (lower(codigo)) do update set nombre = excluded.nombre returning id`
    for (const d of principales) {
      const cant = ((i * 7 + d.id * 3) % 9) + (i % 4 === 0 ? 0 : 1)
      await tx`insert into stock (producto_id, deposito_id, cantidad) values (${p.id}, ${d.id}, ${cant}) on conflict do nothing`
      if (cant) await tx`insert into movimientos_stock (producto_id, deposito_id, cantidad, tipo, motivo) values (${p.id}, ${d.id}, ${cant}, 'carga_inicial', 'Datos de ejemplo')`
    }
    i++
  }

  // Artículos con talles y colores.
  const articulos: [string, string, string, string[], string[], number, number][] = [
    ['Buzo canguro frisa', 'Abrigos', 'Algodón Norte', ['Negro', 'Gris', 'Rosa'], ['S', 'M', 'L', 'XL'], 15800, 36900],
    ['Calza deportiva', 'Pantalones', 'Movete', ['Negro', 'Azul'], ['XS', 'S', 'M', 'L'], 7400, 18900],
  ]
  let n = 9000
  for (const [nombre, cat, marca, colores, talles, costo, precio] of articulos) {
    const [a] = await tx<{ id: number }[]>`insert into articulos (nombre, categoria_id, marca) values (${nombre}, ${idCat[cat]}, ${marca}) returning id`
    for (const color of colores)
      for (const talle of talles) {
        const [p] = await tx<{ id: number }[]>`
          insert into productos (codigo, nombre, categoria_id, costo, precio, stock_minimo, articulo_id, talle, color, orden_talle)
          values (${codigoInterno(n++)}, ${nombreVariante(nombre, color, talle)}, ${idCat[cat]}, ${costo}, ${precio}, 1, ${a.id}, ${talle}, ${color}, ${ordenTalle(talle, talles)})
          returning id`
        for (const d of principales) {
          const cant = (n * 5 + d.id) % 5
          if (!cant) continue
          await tx`insert into stock (producto_id, deposito_id, cantidad) values (${p.id}, ${d.id}, ${cant})`
          await tx`insert into movimientos_stock (producto_id, deposito_id, cantidad, tipo, motivo) values (${p.id}, ${d.id}, ${cant}, 'carga_inicial', 'Datos de ejemplo')`
        }
      }
  }
  await tx`select setval('codigo_interno_seq', 10000)`
})
await sql.end()
console.log('Demo cargada. Usuarios: belen (admin), sofia y camila (vendedoras). Contraseña: demo1234')
