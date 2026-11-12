import * as XLSX from 'xlsx'
import { db } from '@/lib/db'
import { puede, usuarioActual } from '@/lib/dal'
import { coincide } from '@/lib/busqueda'
import { hoyAR } from '@/lib/reportes'

/** Productos con su stock por depósito, en Excel (sirve también para hacer un recuento). */
export async function GET(req: Request) {
  const u = await usuarioActual()
  if (!u || !puede(u, 'productos')) return new Response('No autorizado', { status: 403 })
  const sp = new URL(req.url).searchParams
  const q = (sp.get('q') ?? '').trim().slice(0, 100)
  const categoria = Number(sp.get('categoria')) || null
  const estado = sp.get('estado') ?? 'activos'
  const sql = db()

  const [depositos, productos, stock] = await Promise.all([
    sql<{ id: number; nombre: string }[]>`
      select d.id, coalesce(s.nombre, 'Central') || ' · ' || d.nombre as nombre
      from depositos d left join sucursales s on s.id = d.sucursal_id
      where d.activo order by s.nombre nulls last, d.es_principal desc, d.nombre`,
    sql<{ id: number; codigo: string; nombre: string; categoria: string | null; costo: number; precio: number; stock_minimo: number; activo: boolean }[]>`
      select p.id, p.codigo, p.nombre, c.nombre as categoria, p.costo, p.precio, p.stock_minimo, p.activo
      from productos p left join categorias c on c.id = p.categoria_id
      where true
        ${q ? sql`and ${coincide(sql, q)}` : sql``}
        ${categoria ? sql`and p.categoria_id = ${categoria}` : sql``}
        ${estado === 'inactivos' ? sql`and not p.activo` : estado === 'todos' ? sql`` : sql`and p.activo`}
      order by lower(p.nombre)`,
    sql<{ producto_id: number; deposito_id: number; cantidad: number }[]>`select producto_id, deposito_id, cantidad from stock`,
  ])
  const porProducto = new Map<number, Map<number, number>>()
  for (const s of stock) {
    if (!porProducto.has(s.producto_id)) porProducto.set(s.producto_id, new Map())
    porProducto.get(s.producto_id)!.set(s.deposito_id, s.cantidad)
  }
  let filas = productos.map((p) => {
    const st = porProducto.get(p.id)
    const fila: Record<string, unknown> = {
      Código: p.codigo,
      Producto: p.nombre,
      Categoría: p.categoria ?? '',
      Costo: Number(p.costo),
      Precio: Number(p.precio),
      'Stock mínimo': p.stock_minimo,
    }
    let total = 0
    for (const d of depositos) {
      const c = st?.get(d.id) ?? 0
      fila[d.nombre] = c
      total += c
    }
    fila['Stock total'] = total
    if (!p.activo) fila['Estado'] = 'De baja'
    return fila
  })
  if (estado === 'stock-bajo') filas = filas.filter((f) => (f['Stock total'] as number) <= (f['Stock mínimo'] as number))

  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(filas.length ? filas : [{ '': 'Sin productos' }]), 'Productos')
  const archivo = XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  return new Response(new Uint8Array(archivo), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="productos-${hoyAR()}.xlsx"`,
    },
  })
}
