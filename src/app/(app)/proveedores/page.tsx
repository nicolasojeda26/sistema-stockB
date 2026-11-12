import type { Metadata } from 'next'
import Link from 'next/link'
import { db } from '@/lib/db'
import { requerirPermiso } from '@/lib/dal'
import { formatoDia, formatoPesos } from '@/lib/formato'
import { BotonLink, Encabezado, Etiqueta, Input, Select, Tarjeta, Vacio, tablaCls as t } from '@/components/ui'

export const metadata: Metadata = { title: 'Proveedores' }

export default async function ProveedoresPage(props: PageProps<'/proveedores'>) {
  await requerirPermiso('compras')
  const sp = await props.searchParams
  const q = (typeof sp.q === 'string' ? sp.q : '').trim().slice(0, 60)
  const filtro = typeof sp.filtro === 'string' ? sp.filtro : 'todos'
  const sql = db()
  const filas = await sql<{ id: number; nombre: string; cuit: string | null; telefono: string | null; activo: boolean; saldo: number; ultima: Date | null }[]>`
    select * from (
      select p.id, p.nombre, p.cuit, p.telefono, p.activo,
        coalesce((select sum(monto) from proveedor_movimientos m where m.proveedor_id = p.id), 0) as saldo,
        (select max(fecha) from compras c where c.proveedor_id = p.id and c.estado = 'registrada') as ultima
      from proveedores p
      where ${q ? sql`(normalizar(p.nombre) like ${'%' + q.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() + '%'} or p.cuit like ${q.replace(/\D/g, '') + '%'})` : sql`true`}
    ) x
    where ${filtro === 'deuda' ? sql`saldo > 0` : sql`true`}
    order by ${filtro === 'deuda' ? sql`saldo desc,` : sql``} activo desc, lower(nombre)
    limit 300`
  const [{ deuda }] = await sql<{ deuda: number }[]>`
    select coalesce(sum(s) filter (where s > 0), 0) as deuda from (select sum(monto) as s from proveedor_movimientos group by proveedor_id) x`

  return (
    <>
      <Encabezado
        titulo="Proveedores"
        detalle={Number(deuda) > 0 ? `Les debés ${formatoPesos(Number(deuda))} en total.` : 'No le debés nada a ningún proveedor.'}
        acciones={
          <>
            <BotonLink href="/compras/nueva" variante="secundario">
              Cargar compra
            </BotonLink>
            <BotonLink href="/proveedores/nuevo">Nuevo proveedor</BotonLink>
          </>
        }
      />
      <form className="mb-4 grid gap-2 sm:grid-cols-[1fr_200px_auto]">
        <Input name="q" defaultValue={q} placeholder="Nombre o CUIT" aria-label="Buscar proveedor" />
        <Select name="filtro" defaultValue={filtro} aria-label="Filtro">
          <option value="todos">Todos</option>
          <option value="deuda">Les debo plata</option>
        </Select>
        <button className="h-10 rounded-lg bg-tinta px-5 text-sm font-semibold text-white hover:bg-tinta/90">Buscar</button>
      </form>
      <Tarjeta className="overflow-hidden">
        {filas.length === 0 ? (
          <Vacio accion={<BotonLink href="/proveedores/nuevo">Cargar un proveedor</BotonLink>}>
            {q || filtro !== 'todos' ? 'No hay proveedores que coincidan.' : 'Todavía no hay proveedores. También se cargan al registrar una compra.'}
          </Vacio>
        ) : (
          <div className="overflow-x-auto">
            <table className={t.tabla}>
              <thead>
                <tr>
                  <th className={t.th}>Proveedor</th>
                  <th className={`${t.th} hidden sm:table-cell`}>Teléfono</th>
                  <th className={`${t.th} hidden md:table-cell`}>Última compra</th>
                  <th className={`${t.th} text-right`}>Cuenta</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((p) => {
                  const s = Number(p.saldo)
                  return (
                    <tr key={p.id} className="hover:bg-fondo/60">
                      <td className={t.td}>
                        <Link href={`/proveedores/${p.id}`} className="font-medium hover:text-marca hover:underline">
                          {p.nombre}
                        </Link>
                        {!p.activo && (
                          <span className="ml-2">
                            <Etiqueta tono="apagado">De baja</Etiqueta>
                          </span>
                        )}
                        {p.cuit && <span className="block text-xs text-apagado">CUIT {p.cuit}</span>}
                      </td>
                      <td className={`${t.td} hidden text-tinta-suave sm:table-cell`}>{p.telefono ?? '—'}</td>
                      <td className={`${t.td} hidden text-tinta-suave md:table-cell`}>{p.ultima ? formatoDia(p.ultima) : '—'}</td>
                      <td className={`${t.td} text-right`}>
                        {s > 0 ? (
                          <Etiqueta tono="error">Le debés {formatoPesos(s)}</Etiqueta>
                        ) : s < 0 ? (
                          <Etiqueta tono="ok">A tu favor {formatoPesos(-s)}</Etiqueta>
                        ) : (
                          <span className="text-apagado">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>
    </>
  )
}
