import type { Metadata } from 'next'
import Link from 'next/link'
import { db } from '@/lib/db'
import { requerirUsuario } from '@/lib/dal'
import { formatoFecha } from '@/lib/formato'
import { Aviso, BotonLink, Encabezado, Etiqueta, Tarjeta, Vacio } from '@/components/ui'
import { CancelarPedido } from './cancelar'

export const metadata: Metadata = { title: 'Pedidos al depósito' }

const ESTADOS = {
  pendiente: { texto: 'Sin enviar', tono: 'alerta' },
  parcial: { texto: 'Enviado en parte', tono: 'marca' },
  enviado: { texto: 'Enviado', tono: 'ok' },
  cancelado: { texto: 'Cancelado', tono: 'apagado' },
} as const

export default async function PedidosPage(props: PageProps<'/pedidos'>) {
  const u = await requerirUsuario()
  const sp = await props.searchParams
  const nuevo = Number(sp.nuevo) || null
  const verTodos = sp.ver === 'todos'
  const sql = db()
  const pedidos = await sql<{
    id: number
    creado: Date
    estado: keyof typeof ESTADOS
    nota: string | null
    sucursal: string
    usuario: string | null
    items: { producto: string; codigo: string; cantidad: number; enviada: number; en_deposito: number }[]
  }[]>`
    select p.id, p.creado, p.estado, p.nota, s.nombre as sucursal, us.nombre as usuario,
      (select coalesce(json_agg(json_build_object('producto', pr.nombre, 'codigo', pr.codigo, 'cantidad', pi.cantidad, 'enviada', pi.enviada,
          'en_deposito', coalesce((select sum(st.cantidad) from stock st join depositos d on d.id = st.deposito_id join sucursales sd on sd.id = d.sucursal_id
            where st.producto_id = pi.producto_id and sd.tipo = 'deposito'), 0)) order by pr.nombre), '[]')
        from pedido_items pi join productos pr on pr.id = pi.producto_id where pi.pedido_id = p.id) as items
    from pedidos p join sucursales s on s.id = p.sucursal_id left join usuarios us on us.id = p.usuario_id
    where ${u.rol === 'vendedora' ? sql`p.sucursal_id = ${u.sucursal_id}` : sql`true`}
      and ${verTodos ? sql`true` : sql`(p.estado in ('pendiente', 'parcial') or p.creado > now() - interval '7 days')`}
    order by (p.estado in ('pendiente', 'parcial')) desc, p.creado ${u.rol === 'vendedora' ? sql`desc` : sql`asc`}
    limit 200`
  const atiende = u.rol === 'admin' || u.rol === 'deposito'
  const pendientes = pedidos.filter((p) => p.estado === 'pendiente' || p.estado === 'parcial').length

  return (
    <>
      <Encabezado
        titulo="Pedidos al depósito"
        detalle={
          atiende
            ? pendientes
              ? `${pendientes} pedido${pendientes === 1 ? '' : 's'} para preparar. Los más viejos primero.`
              : 'No hay pedidos para preparar.'
            : 'Lo que le pediste al depósito. Cuando te lo mandan, lo recibís en Envíos.'
        }
        acciones={u.rol !== 'deposito' ? <BotonLink href="/pedidos/nuevo">Nuevo pedido</BotonLink> : undefined}
      />
      {nuevo && (
        <div className="mb-4">
          <Aviso tipo="ok">Pedido N.º {nuevo} enviado al depósito.</Aviso>
        </div>
      )}
      {pedidos.length === 0 ? (
        <Tarjeta>
          <Vacio accion={u.rol !== 'deposito' ? <BotonLink href="/pedidos/nuevo">Hacer un pedido</BotonLink> : undefined}>No hay pedidos.</Vacio>
        </Tarjeta>
      ) : (
        <div className="space-y-4">
          {pedidos.map((p) => {
            const abierto = p.estado === 'pendiente' || p.estado === 'parcial'
            const unidades = p.items.reduce((a, i) => a + i.cantidad, 0)
            return (
              <Tarjeta key={p.id} className={`overflow-hidden ${abierto ? '' : 'opacity-75'}`}>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-linea px-5 py-3.5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">
                        Pedido N.º {p.id} · {p.sucursal}
                      </span>
                      <Etiqueta tono={ESTADOS[p.estado].tono}>{ESTADOS[p.estado].texto}</Etiqueta>
                    </div>
                    <p className="mt-0.5 text-xs text-apagado">
                      {formatoFecha(p.creado)} · {p.usuario ?? '—'} · {p.items.length} producto{p.items.length === 1 ? '' : 's'}, {unidades} u.
                    </p>
                    {p.nota && <p className="mt-1 text-sm">“{p.nota}”</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {abierto && atiende && <BotonLink href={`/envios/nuevo?pedido=${p.id}`}>Armar envío</BotonLink>}
                    {abierto && <CancelarPedido id={p.id} />}
                  </div>
                </div>
                <ul className="divide-y divide-linea text-sm">
                  {p.items.map((i) => (
                    <li key={i.codigo} className="flex items-center justify-between gap-3 px-5 py-2">
                      <span className="min-w-0">
                        <span className="block truncate">{i.producto}</span>
                        <span className="font-mono text-xs text-apagado">{i.codigo}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-3 text-xs">
                        {atiende && abierto && (
                          <span className={Number(i.en_deposito) < i.cantidad - i.enviada ? 'font-semibold text-alerta' : 'text-apagado'}>
                            hay {Number(i.en_deposito)}
                          </span>
                        )}
                        {i.enviada > 0 && <span className="text-ok">enviadas {i.enviada}</span>}
                        <span className="num text-sm font-semibold">× {i.cantidad}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </Tarjeta>
            )
          })}
          {!verTodos && (
            <p className="text-center text-sm">
              <Link href="/pedidos?ver=todos" className="font-medium text-marca hover:underline">
                Ver también los pedidos viejos
              </Link>
            </p>
          )}
        </div>
      )}
    </>
  )
}
