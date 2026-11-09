import type { Metadata } from 'next'
import Link from 'next/link'
import { db } from '@/lib/db'
import { requerirUsuario } from '@/lib/dal'
import { formatoDia, formatoFecha, formatoPesos, hoyAR } from '@/lib/formato'
import { BotonLink, Encabezado, Etiqueta, Select, Tarjeta, Vacio, tablaCls as t } from '@/components/ui'

export const metadata: Metadata = { title: 'Presupuestos' }

const ESTADOS = {
  abierto: { texto: 'Abierto', tono: 'marca' },
  aceptado: { texto: 'Aceptado', tono: 'ok' },
  rechazado: { texto: 'Rechazado', tono: 'alerta' },
  cancelado: { texto: 'Cancelado', tono: 'apagado' },
} as const

export default async function PresupuestosPage(props: PageProps<'/presupuestos'>) {
  const u = await requerirUsuario()
  const sp = await props.searchParams
  const estado = typeof sp.estado === 'string' && sp.estado in ESTADOS ? sp.estado : 'todos'
  const sucursalId = u.rol === 'admin' ? Number(sp.sucursal) || null : u.sucursal_id
  const sql = db()
  const [filas, sucursales] = await Promise.all([
    sql<{ id: number; creado: Date; valido_hasta: Date | null; estado: keyof typeof ESTADOS; total: number; sucursal: string; cliente: string | null; usuario: string }[]>`
      select p.id, p.creado, p.valido_hasta, p.estado, p.total, s.nombre as sucursal,
        c.nombre as cliente, u.nombre as usuario
      from presupuestos p join sucursales s on s.id = p.sucursal_id
      left join clientes c on c.id = p.cliente_id join usuarios u on u.id = p.usuario_id
      where ${u.rol === 'admin' ? sql`${sucursalId ? sql`p.sucursal_id = ${sucursalId}` : sql`true`}` : sql`p.sucursal_id = ${u.sucursal_id}`}
        ${estado !== 'todos' ? sql`and p.estado = ${estado}` : sql``}
      order by p.creado desc, p.id desc limit 300`,
    u.rol === 'admin' ? sql<{ id: number; nombre: string }[]>`select id, nombre from sucursales where activa order by nombre` : [],
  ])
  const total = filas.filter((p) => p.estado !== 'cancelado' && p.estado !== 'rechazado').reduce((a, p) => a + Number(p.total), 0)
  const hoy = hoyAR()

  return (
    <>
      <Encabezado
        titulo="Presupuestos"
        detalle={`${filas.length} presupuesto${filas.length === 1 ? '' : 's'} recientes · ${formatoPesos(total)} en curso`}
        acciones={<BotonLink href="/presupuestos/nuevo">Nuevo presupuesto</BotonLink>}
      />
      <form className="mb-4 grid gap-2 sm:grid-cols-[1fr_220px_auto]">
        <Select name="estado" defaultValue={estado} aria-label="Estado del presupuesto">
          <option value="todos">Todos los estados</option>
          {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v.texto}</option>)}
        </Select>
        {u.rol === 'admin' ? (
          <Select name="sucursal" defaultValue={sucursalId ?? ''} aria-label="Sucursal">
            <option value="">Todas las sucursales</option>
            {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </Select>
        ) : <span className="hidden sm:block" />}
        <button className="h-10 rounded-lg bg-tinta px-5 text-sm font-semibold text-white hover:bg-tinta/90">Filtrar</button>
      </form>
      <Tarjeta className="overflow-hidden">
        {filas.length === 0 ? (
          <Vacio accion={<BotonLink href="/presupuestos/nuevo">Crear presupuesto</BotonLink>}>
            No hay presupuestos {estado !== 'todos' ? 'con este estado' : 'todavía'}.
          </Vacio>
        ) : (
          <div className="overflow-x-auto">
            <table className={t.tabla}>
              <thead><tr><th className={t.th}>Presupuesto</th><th className={`${t.th} hidden sm:table-cell`}>Cliente</th><th className={`${t.th} hidden md:table-cell`}>Sucursal · vendedora</th><th className={`${t.th} hidden sm:table-cell`}>Estado</th><th className={`${t.th} text-right`}>Total</th></tr></thead>
              <tbody>
                {filas.map((p) => {
                  const vencimiento = p.valido_hasta ? new Date(p.valido_hasta).toISOString().slice(0, 10) : null
                  const vencido = p.estado === 'abierto' && vencimiento && vencimiento < hoy
                  const e = ESTADOS[p.estado]
                  return (
                    <tr key={p.id} className="hover:bg-fondo/60">
                      <td className={t.td}>
                        <Link href={`/presupuestos/${p.id}`} className="font-medium text-marca hover:underline">P-{String(p.id).padStart(6, '0')}</Link>
                        <span className="block text-xs text-apagado">{formatoFecha(p.creado)}</span>
                      </td>
                      <td className={`${t.td} hidden sm:table-cell`}>{p.cliente ?? <span className="text-apagado">Sin cliente</span>}</td>
                      <td className={`${t.td} hidden md:table-cell`}><span>{p.sucursal}</span><span className="block text-xs text-apagado">{p.usuario}</span></td>
                      <td className={`${t.td} hidden sm:table-cell`}><Etiqueta tono={vencido ? 'alerta' : e.tono}>{vencido ? 'Vencido' : e.texto}</Etiqueta></td>
                      <td className={`${t.td} num text-right font-semibold whitespace-nowrap`}>{formatoPesos(Number(p.total))}</td>
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
