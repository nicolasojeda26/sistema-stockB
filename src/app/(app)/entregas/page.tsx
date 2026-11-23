import type { Metadata } from 'next'
import Link from 'next/link'
import { db } from '@/lib/db'
import { requerirAlguno } from '@/lib/dal'
import { entregasPendientes, type EntregaPendiente } from '@/lib/ventas'
import { Encabezado, Etiqueta, Tarjeta, TituloTarjeta, Vacio } from '@/components/ui'
import { BotonEntrega } from './boton'

export const metadata: Metadata = { title: 'Entregas entre sucursales' }

const fecha = (d: Date) =>
  new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d)

export default async function EntregasPage() {
  // Las ven quienes venden y el depósito (que también puede ser el origen).
  const u = await requerirAlguno('vender', 'envios')
  const todas = u.rol === 'admin'
  const lista = await entregasPendientes(db(), todas ? null : u.sucursal_id)
  // Qué le toca hacer a esta sucursal con cada una.
  const accion = (e: EntregaPendiente): string | null => {
    if (e.entrega_estado === 'pendiente' && (todas || e.origen_id === u.sucursal_id)) return e.entrega === 'retira' ? 'Ya lo retiró' : 'Ya lo mandamos'
    if (e.entrega_estado === 'enviado' && (todas || e.vende_id === u.sucursal_id)) return 'Llegó y se entregó'
    return null
  }
  const paraHacer = lista.filter((e) => accion(e))
  const enEspera = lista.filter((e) => !accion(e))

  const Fila = ({ e }: { e: EntregaPendiente }) => {
    const a = accion(e)
    return (
      <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="min-w-0">
          <p className="font-medium">
            {e.cantidad} × {e.nombre}
          </p>
          <p className="text-sm text-tinta-suave">
            <span className="font-mono">{e.codigo}</span> ·{' '}
            {e.entrega === 'envio' ? (
              <>
                {e.origen} lo manda a <strong>{e.vende}</strong>
              </>
            ) : (
              <>
                el cliente lo retira en <strong>{e.origen}</strong>
              </>
            )}
            {e.cliente ? ` · ${e.cliente}` : ''}
          </p>
          <p className="text-xs text-apagado">
            <Link href={`/ventas/${e.venta_id}`} className="hover:underline">
              Venta N.º {e.venta_id}
            </Link>{' '}
            de {e.vende} · {fecha(e.creado)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Etiqueta tono={e.entrega_estado === 'enviado' ? 'alerta' : 'neutro'}>{e.entrega_estado === 'enviado' ? 'En camino' : 'Pendiente'}</Etiqueta>
          {a && <BotonEntrega id={e.id} texto={a} />}
        </div>
      </li>
    )
  }

  return (
    <>
      <Encabezado
        titulo="Entregas entre sucursales"
        detalle="Productos vendidos en una sucursal que salen de otra: los que hay que mandar, los que van a retirar y los que están en camino."
      />
      {lista.length === 0 ? (
        <Tarjeta>
          <Vacio>No hay entregas pendientes.</Vacio>
        </Tarjeta>
      ) : (
        <div className="space-y-5">
          {paraHacer.length > 0 && (
            <Tarjeta>
              <TituloTarjeta>Para hacer ({paraHacer.length})</TituloTarjeta>
              <ul className="divide-y divide-linea">
                {paraHacer.map((e) => (
                  <Fila key={e.id} e={e} />
                ))}
              </ul>
            </Tarjeta>
          )}
          {enEspera.length > 0 && (
            <Tarjeta>
              <TituloTarjeta>Esperando a otra sucursal ({enEspera.length})</TituloTarjeta>
              <ul className="divide-y divide-linea">
                {enEspera.map((e) => (
                  <Fila key={e.id} e={e} />
                ))}
              </ul>
            </Tarjeta>
          )}
        </div>
      )}
    </>
  )
}
