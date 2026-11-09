import type { Metadata } from 'next'
import Link from 'next/link'
import { db } from '@/lib/db'
import { requerirUsuario } from '@/lib/dal'
import { formatoFecha } from '@/lib/formato'
import { BotonLink, Encabezado, Etiqueta, Tarjeta, Vacio, tablaCls as t } from '@/components/ui'
import { ESTADOS_ENVIO, type EstadoEnvio } from './estados'

export const metadata: Metadata = { title: 'Envíos' }

type Fila = {
  id: number
  creado: Date
  estado: EstadoEnvio
  origen: string
  destino: string
  destino_suc: number | null
  origen_suc: number | null
  pedido_id: number | null
  unidades: number
  productos: number
  resuelto: boolean
}

export default async function EnviosPage(props: PageProps<'/envios'>) {
  const u = await requerirUsuario()
  const sp = await props.searchParams
  const filtro = typeof sp.ver === 'string' ? sp.ver : 'activos'
  const sql = db()
  const filas = await sql<Fila[]>`
    select e.id, e.creado, e.estado, e.pedido_id, e.resuelto_en is not null as resuelto,
      coalesce(so.nombre, 'Central') as origen, coalesce(sd.nombre, 'Central') as destino, sd.id as destino_suc, so.id as origen_suc,
      (select sum(enviada)::int from envio_items i where i.envio_id = e.id) as unidades,
      (select count(*)::int from envio_items i where i.envio_id = e.id) as productos
    from envios e
    join depositos o on o.id = e.origen_id left join sucursales so on so.id = o.sucursal_id
    join depositos d on d.id = e.destino_id left join sucursales sd on sd.id = d.sucursal_id
    where ${u.rol === 'admin' ? sql`true` : sql`(o.sucursal_id = ${u.sucursal_id} or d.sucursal_id = ${u.sucursal_id})`}
      and ${
        filtro === 'todos'
          ? sql`true`
          : sql`(e.estado = 'en_camino' or (e.estado = 'con_diferencias' and e.resuelto_en is null) or e.creado > now() - interval '3 days')`
      }
    order by (e.estado = 'en_camino' and ${u.rol === 'admin' ? sql`true` : sql`d.sucursal_id = ${u.sucursal_id}`}) desc,
      (e.estado = 'con_diferencias' and e.resuelto_en is null) desc, e.creado desc
    limit 300`
  const porRecibir = filas.filter((f) => f.estado === 'en_camino' && (u.rol === 'admin' || f.destino_suc === u.sucursal_id))

  return (
    <>
      <Encabezado
        titulo="Envíos"
        detalle={
          porRecibir.length
            ? `${porRecibir.length} envío${porRecibir.length === 1 ? '' : 's'} en camino ${u.rol === 'admin' ? 'sin recibir' : 'a tu sucursal: contá lo que llegó y confirmalo'}.`
            : 'Mercadería entre el depósito y las sucursales. La sucursal confirma lo que le llega.'
        }
        acciones={<BotonLink href="/envios/nuevo">Armar envío</BotonLink>}
      />
      <Tarjeta className="overflow-hidden">
        {filas.length === 0 ? (
          <Vacio>No hay envíos {filtro === 'todos' ? '' : 'recientes'}.</Vacio>
        ) : (
          <div className="overflow-x-auto">
            <table className={t.tabla}>
              <thead>
                <tr>
                  <th className={t.th}>Envío</th>
                  <th className={t.th}>Recorrido</th>
                  <th className={`${t.th} text-right`}>Unidades</th>
                  <th className={t.th}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => {
                  const mio = f.estado === 'en_camino' && (u.rol === 'admin' || f.destino_suc === u.sucursal_id)
                  return (
                    <tr key={f.id} className={mio ? 'bg-alerta-claro/40' : ''}>
                      <td className={t.td}>
                        <Link href={`/envios/${f.id}`} className="font-medium hover:text-marca hover:underline">
                          N.º {f.id}
                        </Link>
                        <span className="block text-xs text-apagado">
                          {formatoFecha(f.creado)}
                          {f.pedido_id ? ` · pedido ${f.pedido_id}` : ''}
                        </span>
                      </td>
                      <td className={t.td}>
                        {f.origen} → <b className="font-medium">{f.destino}</b>
                      </td>
                      <td className={`${t.td} num text-right`}>
                        {f.unidades}
                        <span className="block text-xs text-apagado">{f.productos} prod.</span>
                      </td>
                      <td className={t.td}>
                        <span className="flex flex-wrap items-center gap-2">
                          <Etiqueta tono={ESTADOS_ENVIO[f.estado].tono}>{ESTADOS_ENVIO[f.estado].texto}</Etiqueta>
                          {f.estado === 'con_diferencias' && (f.resuelto ? <span className="text-xs text-apagado">resuelto</span> : <span className="text-xs text-error">sin resolver</span>)}
                          {mio && u.rol !== 'admin' && (
                            <Link href={`/envios/${f.id}`} className="text-sm font-semibold text-marca hover:underline">
                              Recibir
                            </Link>
                          )}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>
      {filtro !== 'todos' && (
        <p className="mt-4 text-center text-sm">
          <Link href="/envios?ver=todos" className="font-medium text-marca hover:underline">
            Ver todos los envíos
          </Link>
        </p>
      )}
    </>
  )
}
