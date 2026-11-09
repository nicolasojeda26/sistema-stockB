import type { Metadata } from 'next'
import Link from 'next/link'
import { db } from '@/lib/db'
import { requerirUsuario } from '@/lib/dal'
import { formatoPesos } from '@/lib/formato'
import { BotonLink, Encabezado, Etiqueta, Input, Select, Tarjeta, Vacio, tablaCls as t } from '@/components/ui'

export const metadata: Metadata = { title: 'Clientes' }

export default async function ClientesPage(props: PageProps<'/clientes'>) {
  await requerirUsuario()
  const sp = await props.searchParams
  const q = (typeof sp.q === 'string' ? sp.q : '').trim().slice(0, 60)
  const filtro = typeof sp.filtro === 'string' ? sp.filtro : 'todas'
  const sql = db()
  const palabras = q
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
  const digitos = q.replace(/\D/g, '')

  const filas = await sql<{ id: number; nombre: string; telefono: string | null; doc_nro: string | null; saldo: number; ultima: Date | null; activo: boolean }[]>`
    select * from (
      select c.id, c.nombre, c.telefono, c.doc_nro, c.activo,
        coalesce((select sum(monto) from cuenta_movimientos m where m.cliente_id = c.id), 0) as saldo,
        (select max(creado) from ventas v where v.cliente_id = c.id and v.estado = 'completada') as ultima
      from clientes c
      where true
        ${
          q
            ? sql`and ((true ${palabras.reduce((acc, w) => sql`${acc} and normalizar(c.nombre) like ${'%' + w + '%'}`, sql``)})
                ${digitos.length >= 4 ? sql`or regexp_replace(coalesce(c.telefono, ''), '\\D', '', 'g') like ${'%' + digitos + '%'} or c.doc_nro like ${digitos + '%'}` : sql``})`
            : sql``
        }
    ) x
    where ${filtro === 'deben' ? sql`saldo > 0` : filtro === 'a-favor' ? sql`saldo < 0` : sql`true`}
    order by ${filtro === 'deben' ? sql`saldo desc,` : filtro === 'a-favor' ? sql`saldo,` : sql``} lower(nombre)
    limit 200`
  const [{ deuda, favor }] = await sql<{ deuda: number; favor: number }[]>`
    select coalesce(sum(s) filter (where s > 0), 0) as deuda, coalesce(-sum(s) filter (where s < 0), 0) as favor
    from (select sum(monto) as s from cuenta_movimientos group by cliente_id) x`

  return (
    <>
      <Encabezado
        titulo="Clientes"
        detalle={`Te deben ${formatoPesos(Number(deuda))} en cuentas corrientes; hay ${formatoPesos(Number(favor))} de saldo a favor de clientes.`}
        acciones={<BotonLink href="/clientes/nueva">Nuevo cliente</BotonLink>}
      />
      <form className="mb-4 grid gap-2 sm:grid-cols-[1fr_200px_auto]">
        <Input name="q" defaultValue={q} placeholder="Nombre, teléfono o DNI" aria-label="Buscar cliente" autoFocus />
        <Select name="filtro" defaultValue={filtro} aria-label="Filtro">
          <option value="todas">Todos</option>
          <option value="deben">Deben plata</option>
          <option value="a-favor">Tienen saldo a favor</option>
        </Select>
        <button className="h-10 rounded-lg bg-tinta px-5 text-sm font-semibold text-white hover:bg-tinta/90">Buscar</button>
      </form>
      <Tarjeta className="overflow-hidden">
        {filas.length === 0 ? (
          <Vacio accion={<BotonLink href="/clientes/nueva">Cargar un cliente</BotonLink>}>
            {q || filtro !== 'todas' ? 'No hay clientes que coincidan.' : 'Todavía no hay clientes cargados. También se cargan desde la caja, al vender.'}
          </Vacio>
        ) : (
          <div className="overflow-x-auto">
            <table className={t.tabla}>
              <thead>
                <tr>
                  <th className={t.th}>Cliente</th>
                  <th className={`${t.th} hidden sm:table-cell`}>Teléfono</th>
                  <th className={`${t.th} hidden md:table-cell`}>Última compra</th>
                  <th className={`${t.th} text-right`}>Saldo</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((c) => {
                  const saldo = Number(c.saldo)
                  return (
                    <tr key={c.id} className="hover:bg-fondo/60">
                      <td className={t.td}>
                        <Link href={`/clientes/${c.id}`} className="font-medium hover:text-marca hover:underline">
                          {c.nombre}
                        </Link>
                        {!c.activo && (
                          <span className="ml-2">
                            <Etiqueta tono="apagado">De baja</Etiqueta>
                          </span>
                        )}
                        {c.doc_nro && <span className="block text-xs text-apagado">DNI/CUIT {c.doc_nro}</span>}
                      </td>
                      <td className={`${t.td} hidden text-tinta-suave sm:table-cell`}>{c.telefono ?? '—'}</td>
                      <td className={`${t.td} hidden text-tinta-suave md:table-cell`}>
                        {c.ultima ? c.ultima.toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }) : '—'}
                      </td>
                      <td className={`${t.td} text-right`}>
                        {saldo > 0 ? (
                          <Etiqueta tono="error">Debe {formatoPesos(saldo)}</Etiqueta>
                        ) : saldo < 0 ? (
                          <Etiqueta tono="ok">A favor {formatoPesos(-saldo)}</Etiqueta>
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
