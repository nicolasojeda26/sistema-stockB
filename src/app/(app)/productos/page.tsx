import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { coincide } from '@/lib/busqueda'
import { requerirUsuario } from '@/lib/dal'
import { formatoEntero, formatoPesos } from '@/lib/formato'
import { BotonLink, Encabezado, Etiqueta, Input, Select, Tarjeta, Vacio, tablaCls as t } from '@/components/ui'

export const metadata: Metadata = { title: 'Productos' }

const POR_PAGINA = 50

type Fila = {
  id: number
  codigo: string
  nombre: string
  categoria: string | null
  precio: number
  stock: number
  stock_minimo: number
  activo: boolean
}

export default async function ProductosPage(props: PageProps<'/productos'>) {
  const u = await requerirUsuario()
  const sp = await props.searchParams
  const q = (typeof sp.q === 'string' ? sp.q : '').trim()
  const categoria = Number(sp.categoria) || null
  const estado = typeof sp.estado === 'string' ? sp.estado : 'activos'
  const pagina = Math.max(1, Number(sp.pagina) || 1)
  const sql = db()

  // Escaneo directo: si el texto es exactamente un código, abrir ese producto.
  if (q) {
    const [exacto] = await sql<{ id: number }[]>`select id from productos where lower(codigo) = lower(${q})`
    if (exacto) redirect(`/productos/${exacto.id}`)
  }

  // La vendedora ve el stock de su sucursal; la administradora, el total.
  const filtroStock =
    u.rol === 'admin' ? sql`` : sql`and s.deposito_id in (select id from depositos where sucursal_id = ${u.sucursal_id})`
  const where = sql`
    where true
    ${q ? sql`and ${coincide(sql, q)}` : sql``}
    ${categoria ? sql`and p.categoria_id = ${categoria}` : sql``}
    ${estado === 'inactivos' ? sql`and not p.activo` : estado === 'todos' ? sql`` : sql`and p.activo`}`
  const bajo = estado === 'stock-bajo'

  const [filas, [{ total }], categorias] = await Promise.all([
    sql<Fila[]>`
      select * from (
        select p.id, p.codigo, p.nombre, c.nombre as categoria, p.precio, p.stock_minimo, p.activo,
          coalesce((select sum(s.cantidad) from stock s where s.producto_id = p.id ${filtroStock}), 0)::int as stock
        from productos p left join categorias c on c.id = p.categoria_id
        ${where}
      ) x
      ${bajo ? sql`where stock <= stock_minimo` : sql``}
      order by lower(nombre)
      limit ${POR_PAGINA} offset ${(pagina - 1) * POR_PAGINA}`,
    sql<{ total: number }[]>`
      select count(*)::int as total from (
        select p.stock_minimo,
          coalesce((select sum(s.cantidad) from stock s where s.producto_id = p.id ${filtroStock}), 0) as stock
        from productos p ${where}
      ) x ${bajo ? sql`where stock <= stock_minimo` : sql``}`,
    sql<{ id: number; nombre: string }[]>`select id, nombre from categorias where activa order by lower(nombre)`,
  ])
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA))
  const enlace = (n: number) => {
    const p = new URLSearchParams()
    if (q) p.set('q', q)
    if (categoria) p.set('categoria', String(categoria))
    if (estado !== 'activos') p.set('estado', estado)
    if (n > 1) p.set('pagina', String(n))
    return `/productos${p.size ? `?${p}` : ''}`
  }

  return (
    <>
      <Encabezado
        titulo="Productos"
        detalle={`${formatoEntero(total)} producto${total === 1 ? '' : 's'}${u.rol === 'vendedora' ? ` · stock de ${u.sucursal_nombre}` : ' · stock total'}`}
        acciones={
          u.rol === 'admin' && (
            <>
              <a
                href={`/productos/exportar?${new URLSearchParams({ ...(q ? { q } : {}), ...(categoria ? { categoria: String(categoria) } : {}), estado })}`}
                className="inline-flex h-10 items-center rounded-lg border border-linea bg-papel px-4 text-sm font-medium hover:bg-fondo"
              >
                Excel
              </a>
              <BotonLink href="/productos/nuevo">Nuevo producto</BotonLink>
            </>
          )
        }
      />

      <form className="mb-4 grid gap-2 sm:grid-cols-[1fr_200px_170px_auto]">
        <Input name="q" defaultValue={q} placeholder="Escaneá el código o buscá por nombre" autoFocus aria-label="Buscar" />
        <Select name="categoria" defaultValue={categoria ?? ''} aria-label="Categoría">
          <option value="">Todas las categorías</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </Select>
        <Select name="estado" defaultValue={estado} aria-label="Estado">
          <option value="activos">Activos</option>
          <option value="stock-bajo">Stock bajo</option>
          <option value="inactivos">Dados de baja</option>
          <option value="todos">Todos</option>
        </Select>
        <button className="h-10 rounded-lg bg-tinta px-4 text-sm font-medium text-white hover:bg-tinta/90">Buscar</button>
      </form>

      <Tarjeta className="overflow-hidden">
        {filas.length === 0 ? (
          <Vacio>{q || categoria || estado !== 'activos' ? 'No hay productos que coincidan.' : 'Todavía no hay productos cargados.'}</Vacio>
        ) : (
          <div className="overflow-x-auto">
            <table className={t.tabla}>
              <thead>
                <tr>
                  <th className={`${t.th} hidden sm:table-cell`}>Código</th>
                  <th className={t.th}>Producto</th>
                  <th className={`${t.th} hidden md:table-cell`}>Categoría</th>
                  <th className={`${t.th} text-right`}>Precio</th>
                  <th className={`${t.th} text-right`}>Stock</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((p) => (
                  <tr key={p.id} className="hover:bg-fondo/60">
                    <td className={`${t.td} hidden font-mono text-xs text-tinta-suave sm:table-cell`}>{p.codigo}</td>
                    <td className={t.td}>
                      <Link href={`/productos/${p.id}`} className="font-medium hover:text-marca hover:underline">
                        {p.nombre}
                      </Link>
                      {!p.activo && (
                        <span className="ml-2">
                          <Etiqueta tono="apagado">De baja</Etiqueta>
                        </span>
                      )}
                      <span className="mt-0.5 block font-mono text-xs text-apagado sm:hidden">{p.codigo}</span>
                    </td>
                    <td className={`${t.td} hidden text-tinta-suave md:table-cell`}>{p.categoria ?? '—'}</td>
                    <td className={`${t.td} num text-right font-medium`}>{formatoPesos(p.precio)}</td>
                    <td className={`${t.td} num text-right`}>
                      {p.stock <= p.stock_minimo ? <Etiqueta tono="alerta">{formatoEntero(p.stock)}</Etiqueta> : formatoEntero(p.stock)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>

      {paginas > 1 && (
        <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Páginas">
          <span className="text-tinta-suave">
            Página {pagina} de {paginas}
          </span>
          <div className="flex gap-2">
            {pagina > 1 && (
              <BotonLink variante="secundario" href={enlace(pagina - 1)}>
                Anterior
              </BotonLink>
            )}
            {pagina < paginas && (
              <BotonLink variante="secundario" href={enlace(pagina + 1)}>
                Siguiente
              </BotonLink>
            )}
          </div>
        </nav>
      )}
    </>
  )
}
