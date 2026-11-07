import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { requerirUsuario } from '@/lib/dal'
import { formatoEntero, formatoPesos } from '@/lib/formato'
import { Aviso, BotonLink, Encabezado, Etiqueta, Tarjeta, TituloTarjeta, tablaCls as t } from '@/components/ui'
import { EditarArticulo } from './editar'

export const metadata: Metadata = { title: 'Artículo' }

type Variante = {
  id: number
  codigo: string
  talle: string | null
  color: string | null
  precio: number
  costo: number
  stock_minimo: number
  activo: boolean
  orden_talle: number
}

export default async function ArticuloPage(props: PageProps<'/articulos/[id]'>) {
  const u = await requerirUsuario()
  const id = Number((await props.params).id)
  const sp = await props.searchParams
  if (!Number.isInteger(id)) notFound()
  const sql = db()
  const [articulo] = await sql<{ id: number; nombre: string; categoria_id: number | null; categoria: string | null; marca: string | null; activo: boolean }[]>`
    select a.id, a.nombre, a.categoria_id, c.nombre as categoria, a.marca, a.activo
    from articulos a left join categorias c on c.id = a.categoria_id where a.id = ${id}`
  if (!articulo) notFound()

  const sucursales = await sql<{ id: number; nombre: string }[]>`select id, nombre from sucursales where activa order by nombre`
  // Por defecto: la vendedora ve su sucursal; la administradora, todo.
  const pedida = typeof sp.sucursal === 'string' ? sp.sucursal : u.rol === 'admin' ? 'todas' : String(u.sucursal_id)
  const sucursalId = pedida === 'todas' ? null : Number(pedida) || null

  const [variantes, stocks, categorias] = await Promise.all([
    sql<Variante[]>`
      select id, codigo, talle, color, precio, costo, stock_minimo, activo, orden_talle
      from productos where articulo_id = ${id} order by lower(coalesce(color, '')), orden_talle, talle`,
    sql<{ producto_id: number; cantidad: number }[]>`
      select s.producto_id, sum(s.cantidad)::int as cantidad
      from stock s join productos p on p.id = s.producto_id join depositos d on d.id = s.deposito_id
      where p.articulo_id = ${id} ${sucursalId ? sql`and d.sucursal_id = ${sucursalId}` : sql``}
      group by s.producto_id`,
    u.rol === 'admin' ? sql<{ id: number; nombre: string }[]>`select id, nombre from categorias where activa or id = ${articulo.categoria_id} order by lower(nombre)` : [],
  ])
  const stockDe = new Map(stocks.map((s) => [s.producto_id, s.cantidad]))
  const talles = [...new Map(variantes.map((v) => [String(v.talle ?? ''), v])).values()].sort((a, b) => a.orden_talle - b.orden_talle).map((v) => v.talle)
  const colores = [...new Set(variantes.map((v) => v.color))]
  const celda = (c: string | null, ta: string | null) => variantes.find((v) => v.color === c && v.talle === ta)
  const total = variantes.reduce((a, v) => a + (stockDe.get(v.id) ?? 0), 0)
  const precios = [...new Set(variantes.map((v) => Number(v.precio)))].sort((a, b) => a - b)
  const enlace = (s: string) => `/articulos/${id}?sucursal=${s}`

  return (
    <>
      <Encabezado
        titulo={articulo.nombre}
        detalle={[articulo.categoria, articulo.marca, `${variantes.length} variantes`].filter(Boolean).join(', ')}
        acciones={
          <>
            <BotonLink href={`/etiquetas?articulo=${id}`} variante="secundario">
              Imprimir etiquetas
            </BotonLink>
            <BotonLink href={`/mercaderia/ingreso?articulo=${id}`}>Ingresar mercadería</BotonLink>
          </>
        }
      />
      {sp.creado === '1' && (
        <div className="mb-5">
          <Aviso tipo="ok">Artículo creado. Ahora ingresá la mercadería por talle y color, o imprimí las etiquetas.</Aviso>
        </div>
      )}
      {!articulo.activo && (
        <div className="mb-5">
          <Aviso tipo="alerta">Este artículo está dado de baja: no aparece para vender.</Aviso>
        </div>
      )}

      <Tarjeta>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-linea px-5 py-3">
          <div>
            <h2 className="text-[15px] font-semibold">Stock por talle y color</h2>
            <p className="text-xs text-tinta-suave">
              {formatoEntero(total)} unidades {sucursalId ? `en ${sucursales.find((s) => s.id === sucursalId)?.nombre ?? ''}` : 'en todas las sucursales'}
              {precios.length ? `, ${precios.length === 1 ? formatoPesos(precios[0]) : `de ${formatoPesos(precios[0])} a ${formatoPesos(precios.at(-1)!)}`}` : ''}
            </p>
          </div>
          <nav className="flex flex-wrap gap-1 text-sm" aria-label="Sucursal">
            {[{ id: 'todas', nombre: 'Todas' }, ...sucursales.map((s) => ({ id: String(s.id), nombre: s.nombre }))].map((s) => (
              <Link
                key={s.id}
                href={enlace(s.id)}
                aria-current={(s.id === 'todas' ? !sucursalId : Number(s.id) === sucursalId) ? 'true' : undefined}
                className="rounded-lg px-3 py-1.5 font-medium text-tinta-suave hover:bg-fondo aria-[current]:bg-marca-clara aria-[current]:text-marca"
              >
                {s.nombre}
              </Link>
            ))}
          </nav>
        </div>
        <div className="overflow-x-auto p-4">
          <table className="border-separate border-spacing-1 text-sm">
            <thead>
              <tr>
                <th className="px-2 text-left text-xs font-semibold text-tinta-suave">{colores.some(Boolean) ? 'Color' : ''}</th>
                {talles.map((ta) => (
                  <th key={ta ?? '-'} className="min-w-14 px-2 text-center text-xs font-semibold text-tinta-suave">
                    {ta ?? 'Único'}
                  </th>
                ))}
                <th className="px-2 text-right text-xs font-semibold text-tinta-suave">Total</th>
              </tr>
            </thead>
            <tbody>
              {colores.map((c) => {
                const fila = talles.map((ta) => celda(c, ta))
                return (
                  <tr key={c ?? '-'}>
                    <th className="px-2 py-1 text-left font-semibold whitespace-nowrap">{c ?? '—'}</th>
                    {fila.map((v, i) => {
                      if (!v) return <td key={i} className="rounded-lg bg-fondo/60" />
                      const n = stockDe.get(v.id) ?? 0
                      const tono = !v.activo ? 'bg-fondo text-apagado line-through' : n <= 0 ? 'bg-error-claro text-error' : n <= v.stock_minimo ? 'bg-alerta-claro text-alerta' : 'bg-ok-claro text-ok'
                      return (
                        <td key={i} className="p-0">
                          <Link
                            href={`/productos/${v.id}`}
                            title={`${[c, v.talle].filter(Boolean).join(' ')}: código ${v.codigo}`}
                            className={`num flex h-11 min-w-14 items-center justify-center rounded-lg font-bold hover:ring-2 hover:ring-marca/40 ${tono}`}
                          >
                            {formatoEntero(n)}
                          </Link>
                        </td>
                      )
                    })}
                    <td className="num px-2 text-right font-semibold">{formatoEntero(fila.reduce((a, v) => a + (v ? (stockDe.get(v.id) ?? 0) : 0), 0))}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-tinta-suave">
            <span className="mr-3 inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-ok-claro" /> Hay</span>
            <span className="mr-3 inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-alerta-claro" /> En el mínimo</span>
            <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-error-claro" /> Sin stock</span>
            . Tocá un casillero para ver esa variante.
          </p>
        </div>
      </Tarjeta>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <Tarjeta className="min-w-0 self-start overflow-hidden">
          <TituloTarjeta>Variantes</TituloTarjeta>
          <div className="overflow-x-auto">
            <table className={t.tabla}>
              <thead>
                <tr>
                  <th className={t.th}>Variante</th>
                  <th className={t.th}>Código</th>
                  <th className={`${t.th} text-right`}>Precio</th>
                  <th className={`${t.th} text-right`}>Stock</th>
                </tr>
              </thead>
              <tbody>
                {variantes.map((v) => (
                  <tr key={v.id} className="border-b border-linea last:border-0">
                    <td className={t.td}>
                      <Link href={`/productos/${v.id}`} className="font-medium hover:text-marca hover:underline">
                        {[v.color, v.talle].filter(Boolean).join(' · ') || 'Única'}
                      </Link>
                      {!v.activo && (
                        <span className="ml-2">
                          <Etiqueta tono="apagado">De baja</Etiqueta>
                        </span>
                      )}
                    </td>
                    <td className={`${t.td} font-mono text-xs text-tinta-suave`}>{v.codigo}</td>
                    <td className={`${t.td} num text-right`}>{formatoPesos(Number(v.precio))}</td>
                    <td className={`${t.td} num text-right`}>{formatoEntero(stockDe.get(v.id) ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tarjeta>
        {u.rol === 'admin' && (
          <div className="min-w-0">
            <EditarArticulo
              articulo={{ ...articulo, marca: articulo.marca ?? '' }}
              categorias={categorias}
              talles={talles.filter((x): x is string => !!x)}
              colores={colores.filter((x): x is string => !!x)}
            />
          </div>
        )}
      </div>
    </>
  )
}
