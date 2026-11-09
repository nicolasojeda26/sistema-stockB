import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { requerirUsuario } from '@/lib/dal'
import { formatoFecha } from '@/lib/formato'
import { Aviso, Encabezado, Etiqueta, Tarjeta, TituloTarjeta, tablaCls as t } from '@/components/ui'
import { ESTADOS_ENVIO, type EstadoEnvio } from '../estados'
import { CancelarEnvio, Recepcion, Resolver } from './acciones'

export const metadata: Metadata = { title: 'Envío' }

export default async function EnvioPage(props: PageProps<'/envios/[id]'>) {
  const u = await requerirUsuario()
  const id = Number((await props.params).id)
  if (!Number.isInteger(id)) notFound()
  const sp = await props.searchParams
  const sql = db()
  const [e] = await sql<{
    id: number
    estado: EstadoEnvio
    creado: Date
    nota: string | null
    pedido_id: number | null
    origen: string
    destino: string
    origen_suc: number | null
    destino_suc: number | null
    enviado_por: string | null
    recibido_por: string | null
    recibido_en: Date | null
    nota_recepcion: string | null
    resuelto_en: Date | null
    resolucion: string | null
  }[]>`
    select e.id, e.estado, e.creado, e.nota, e.pedido_id, e.recibido_en, e.nota_recepcion, e.resuelto_en, e.resolucion,
      coalesce(so.nombre, 'Central') || ' · ' || o.nombre as origen, coalesce(sd.nombre, 'Central') || ' · ' || d.nombre as destino,
      o.sucursal_id as origen_suc, d.sucursal_id as destino_suc, ue.nombre as enviado_por, ur.nombre as recibido_por
    from envios e
    join depositos o on o.id = e.origen_id left join sucursales so on so.id = o.sucursal_id
    join depositos d on d.id = e.destino_id left join sucursales sd on sd.id = d.sucursal_id
    left join usuarios ue on ue.id = e.enviado_por left join usuarios ur on ur.id = e.recibido_por
    where e.id = ${id}`
  if (!e) notFound()
  if (u.rol !== 'admin' && e.origen_suc !== u.sucursal_id && e.destino_suc !== u.sucursal_id) notFound()
  const items = await sql<{ producto_id: number; codigo: string; nombre: string; enviada: number; recibida: number | null }[]>`
    select i.producto_id, p.codigo, p.nombre, i.enviada, i.recibida from envio_items i join productos p on p.id = i.producto_id
    where i.envio_id = ${id} order by p.nombre`
  const recibe = e.estado === 'en_camino' && (u.rol === 'admin' || e.destino_suc === u.sucursal_id)
  const puedeCancelar = e.estado === 'en_camino' && (u.rol === 'admin' || e.origen_suc === u.sucursal_id)
  const totalEnviado = items.reduce((a, i) => a + i.enviada, 0)

  return (
    <>
      <Encabezado
        titulo={`Envío N.º ${e.id}`}
        detalle={
          <>
            {e.origen} → <b>{e.destino}</b> · {formatoFecha(e.creado)} · lo mandó {e.enviado_por ?? '—'}
            {e.pedido_id && (
              <>
                {' · '}
                <Link href="/pedidos" className="text-marca hover:underline">
                  pedido N.º {e.pedido_id}
                </Link>
              </>
            )}
          </>
        }
        acciones={<Etiqueta tono={ESTADOS_ENVIO[e.estado].tono}>{ESTADOS_ENVIO[e.estado].texto}</Etiqueta>}
      />
      <div className="mb-5 space-y-3">
        {sp.recibido !== undefined &&
          (sp.recibido === '0' ? (
            <Aviso tipo="ok">Recepción registrada: llegó todo bien y ya está en el stock de tu sucursal.</Aviso>
          ) : (
            <Aviso tipo="alerta">
              Recepción registrada con diferencias: entró al stock lo que contaste y la administración ya está avisada.
            </Aviso>
          ))}
        {sp.enviado && <Aviso tipo="ok">Envío registrado: {totalEnviado} unidades quedaron en camino. La sucursal lo confirma cuando llega.</Aviso>}
        {e.nota && <Aviso tipo="info">Nota del envío: {e.nota}</Aviso>}
        {e.estado === 'con_diferencias' && !e.resuelto_en && (
          <Aviso tipo="error">
            Llegó distinto de lo que se mandó. {u.rol === 'admin' ? 'Revisá las diferencias y decidí qué pasó.' : 'La administración ya está avisada.'}
          </Aviso>
        )}
        {e.resuelto_en && <Aviso tipo="info">Diferencias resueltas el {formatoFecha(e.resuelto_en)}: {e.resolucion}</Aviso>}
        {e.recibido_en && (
          <p className="text-sm text-tinta-suave">
            Recibido por {e.recibido_por ?? '—'} el {formatoFecha(e.recibido_en)}
            {e.nota_recepcion ? ` · “${e.nota_recepcion}”` : ''}
          </p>
        )}
      </div>

      {recibe ? (
        <Recepcion envioId={e.id} items={items.map((i) => ({ id: i.producto_id, codigo: i.codigo, nombre: i.nombre, enviada: i.enviada }))} />
      ) : (
        <Tarjeta className="overflow-hidden">
          <TituloTarjeta>Productos</TituloTarjeta>
          <div className="overflow-x-auto">
            <table className={t.tabla}>
              <thead>
                <tr>
                  <th className={t.th}>Producto</th>
                  <th className={`${t.th} text-right`}>Enviado</th>
                  <th className={`${t.th} text-right`}>Llegó</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => {
                  const dif = i.recibida === null ? 0 : i.recibida - i.enviada
                  return (
                    <tr key={i.producto_id} className={dif ? 'bg-error-claro/50' : ''}>
                      <td className={t.td}>
                        <span className="block font-medium">{i.nombre}</span>
                        <span className="font-mono text-xs text-apagado">{i.codigo}</span>
                      </td>
                      <td className={`${t.td} num text-right`}>{i.enviada}</td>
                      <td className={`${t.td} num text-right`}>
                        {i.recibida ?? '—'}
                        {dif !== 0 && <span className="block text-xs font-semibold text-error">{dif > 0 ? `sobra ${dif}` : `falta ${-dif}`}</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Tarjeta>
      )}

      <div className="mt-5 flex flex-wrap gap-4">
        {u.rol === 'admin' && e.estado === 'con_diferencias' && !e.resuelto_en && <Resolver envioId={e.id} />}
        {puedeCancelar && <CancelarEnvio envioId={e.id} />}
      </div>
    </>
  )
}
