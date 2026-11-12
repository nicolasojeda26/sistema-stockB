import type { Metadata } from 'next'
import Link from 'next/link'
import { db } from '@/lib/db'
import { requerirPermiso } from '@/lib/dal'
import { formatoDia, formatoPesos } from '@/lib/formato'
import { TIPOS_COMPROBANTE, type TipoComprobante } from '@/lib/compras-tipos'
import { BotonLink, Encabezado, Etiqueta, Input, Select, Tarjeta, Vacio, tablaCls as t } from '@/components/ui'

export const metadata: Metadata = { title: 'Compras' }

export default async function ComprasPage(props: PageProps<'/compras'>) {
  await requerirPermiso('compras')
  const sp = await props.searchParams
  const desde = typeof sp.desde === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sp.desde) ? sp.desde : null
  const hasta = typeof sp.hasta === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sp.hasta) ? sp.hasta : null
  const proveedor = Number(sp.proveedor) || null
  const sql = db()
  const [filas, proveedores] = await Promise.all([
    sql<{ id: number; fecha: Date; proveedor: string; proveedor_id: number; tipo_comprobante: TipoComprobante; numero: string | null; total: number; estado: string; unidades: number; deposito: string }[]>`
      select c.id, c.fecha, p.nombre as proveedor, p.id as proveedor_id, c.tipo_comprobante, c.numero, c.total, c.estado,
        (select sum(cantidad)::int from compra_items i where i.compra_id = c.id) as unidades, d.nombre as deposito
      from compras c join proveedores p on p.id = c.proveedor_id join depositos d on d.id = c.deposito_id
      where true
        ${desde ? sql`and c.fecha >= ${desde}` : sql``}
        ${hasta ? sql`and c.fecha <= ${hasta}` : sql``}
        ${proveedor ? sql`and c.proveedor_id = ${proveedor}` : sql``}
      order by c.fecha desc, c.id desc limit 300`,
    sql<{ id: number; nombre: string }[]>`select id, nombre from proveedores order by lower(nombre)`,
  ])
  const total = filas.filter((f) => f.estado === 'registrada').reduce((a, f) => a + Number(f.total), 0)

  return (
    <>
      <Encabezado
        titulo="Compras"
        detalle={filas.length ? `${filas.length} compra${filas.length === 1 ? '' : 's'} por ${formatoPesos(total)}.` : 'Facturas de proveedores: suman stock y quedan en su cuenta.'}
        acciones={<BotonLink href="/compras/nueva">Cargar compra</BotonLink>}
      />
      <form className="mb-4 grid gap-2 sm:grid-cols-[1fr_160px_160px_auto]">
        <Select name="proveedor" defaultValue={proveedor ?? ''} aria-label="Proveedor">
          <option value="">Todos los proveedores</option>
          {proveedores.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </Select>
        <Input type="date" name="desde" defaultValue={desde ?? ''} aria-label="Desde" />
        <Input type="date" name="hasta" defaultValue={hasta ?? ''} aria-label="Hasta" />
        <button className="h-10 rounded-lg bg-tinta px-5 text-sm font-semibold text-white hover:bg-tinta/90">Filtrar</button>
      </form>
      <Tarjeta className="overflow-hidden">
        {filas.length === 0 ? (
          <Vacio accion={<BotonLink href="/compras/nueva">Cargar la primera</BotonLink>}>No hay compras {desde || hasta || proveedor ? 'con esos filtros' : 'cargadas todavía'}.</Vacio>
        ) : (
          <div className="overflow-x-auto">
            <table className={t.tabla}>
              <thead>
                <tr>
                  <th className={t.th}>Fecha</th>
                  <th className={t.th}>Proveedor</th>
                  <th className={`${t.th} hidden md:table-cell`}>Comprobante</th>
                  <th className={`${t.th} hidden sm:table-cell text-right`}>Unidades</th>
                  <th className={`${t.th} text-right`}>Total</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((c) => (
                  <tr key={c.id} className={`hover:bg-fondo/60 ${c.estado === 'anulada' ? 'text-apagado' : ''}`}>
                    <td className={`${t.td} whitespace-nowrap`}>
                      <Link href={`/compras/${c.id}`} className="font-medium hover:text-marca hover:underline">
                        {formatoDia(c.fecha)}
                      </Link>
                    </td>
                    <td className={t.td}>
                      {c.proveedor}
                      {c.estado === 'anulada' && (
                        <span className="ml-2">
                          <Etiqueta tono="apagado">Anulada</Etiqueta>
                        </span>
                      )}
                    </td>
                    <td className={`${t.td} hidden text-tinta-suave md:table-cell`}>
                      {TIPOS_COMPROBANTE[c.tipo_comprobante]} {c.numero ?? ''}
                    </td>
                    <td className={`${t.td} num hidden text-right sm:table-cell`}>{c.unidades}</td>
                    <td className={`${t.td} num text-right font-semibold`}>{formatoPesos(Number(c.total))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>
    </>
  )
}
