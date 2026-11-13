import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { db } from '@/lib/db'
import { puede, requerirPermiso } from '@/lib/dal'
import { leerAjustes } from '@/lib/ajustes'
import { formatoPesos } from '@/lib/formato'
import { ESTADOS_REPARACION, linkWhatsApp, numeroReparacion, type EstadoReparacion } from '@/lib/reparaciones'
import { Aviso, BotonLink, Etiqueta, Tarjeta, TituloTarjeta } from '@/components/ui'
import { BotonImprimir } from '@/components/boton-imprimir'
import { AccionesReparacion, ImprimirAlEntrar } from './acciones'

export const metadata: Metadata = { title: 'Reparación' }

const fechaHora = (d: Date) =>
  new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d)

export default async function ReparacionPage(props: PageProps<'/reparaciones/[id]'>) {
  const u = await requerirPermiso('reparaciones')
  const id = Number((await props.params).id)
  const sp = await props.searchParams
  if (!Number.isInteger(id) || id <= 0) notFound()
  const sql = db()
  const [r] = await sql<{
    id: number; sucursal_id: number; sucursal: string; sucursal_direccion: string | null; cliente_nombre: string; cliente_telefono: string | null
    equipo: string; imei: string | null; falla: string; estado_equipo: string | null; presupuesto: number | null; precio: number | null
    diagnostico: string | null; prometido: string | null; estado: EstadoReparacion; creado: Date; recibio: string | null; venta_id: number | null
  }[]>`
    select r.*, to_char(r.prometido, 'DD/MM/YYYY') as prometido, s.nombre as sucursal, s.direccion as sucursal_direccion, u.nombre as recibio
    from reparaciones r join sucursales s on s.id = r.sucursal_id left join usuarios u on u.id = r.recibido_por
    where r.id = ${id}`
  if (!r || (u.rol !== 'admin' && r.sucursal_id !== u.sucursal_id)) notFound()
  const [eventos, ajustes] = await Promise.all([
    sql<{ id: number; estado: string; nota: string | null; creado: Date; usuario: string | null }[]>`
      select e.id, e.estado, e.nota, e.creado, us.nombre as usuario
      from reparacion_eventos e left join usuarios us on us.id = e.usuario_id where e.reparacion_id = ${id} order by e.creado, e.id`,
    leerAjustes(),
  ])
  const e = ESTADOS_REPARACION[r.estado]
  const numero = numeroReparacion(r.id)
  const aviso =
    r.estado === 'listo'
      ? `Hola ${r.cliente_nombre.split(' ')[0]}! Tu ${r.equipo} ya está listo para retirar en ${ajustes.nombre_negocio} ${r.sucursal}. Total: ${formatoPesos(Number(r.precio))}. Reparación ${numero}.`
      : r.estado === 'sin_reparacion'
        ? `Hola ${r.cliente_nombre.split(' ')[0]}, revisamos tu ${r.equipo} y no se pudo reparar. Podés retirarlo en ${ajustes.nombre_negocio} ${r.sucursal}. Reparación ${numero}.`
        : `Hola ${r.cliente_nombre.split(' ')[0]}, te escribimos de ${ajustes.nombre_negocio} por tu ${r.equipo} (reparación ${numero}).`
  const whatsapp = linkWhatsApp(r.cliente_telefono, aviso)

  return (
    <>
      {sp.nueva === '1' && <ImprimirAlEntrar />}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <BotonLink href="/reparaciones" variante="secundario">
          ← Reparaciones
        </BotonLink>
        <div className="flex flex-wrap items-center gap-2">
          {whatsapp && (
            <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center rounded-lg border border-linea bg-papel px-4 text-sm font-semibold hover:bg-fondo">
              Avisar por WhatsApp
            </a>
          )}
          <BotonImprimir texto="Imprimir comprobante" />
        </div>
      </div>
      {sp.nueva === '1' && (
        <div className="mb-4 print:hidden">
          <Aviso tipo="ok">Equipo recibido con el número {numero}. Dale al cliente el comprobante impreso.</Aviso>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Comprobante: lo que se imprime para el cliente. */}
        <Tarjeta className="overflow-hidden print:rounded-none print:border-0 print:shadow-none">
          <div className="border-b border-linea p-6">
            <p className="text-xs font-bold tracking-[.14em] text-apagado">COMPROBANTE DE RECEPCIÓN · SERVICIO TÉCNICO</p>
            <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="font-mono text-3xl font-bold tracking-tight">{numero}</h1>
                <p className="mt-1 text-sm text-tinta-suave">
                  {fechaHora(r.creado)} · {ajustes.nombre_negocio} {r.sucursal}
                  {r.sucursal_direccion && r.sucursal_direccion !== r.sucursal ? ` (${r.sucursal_direccion})` : ''}
                </p>
              </div>
              <span className="print:hidden">
                <Etiqueta tono={e.tono}>{e.texto}</Etiqueta>
              </span>
            </div>
          </div>
          <dl className="grid gap-x-6 gap-y-4 p-6 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-apagado">Cliente</dt>
              <dd className="font-medium">{r.cliente_nombre}</dd>
              {r.cliente_telefono && <dd className="text-sm text-tinta-suave">{r.cliente_telefono}</dd>}
            </div>
            <div>
              <dt className="text-xs font-medium text-apagado">Equipo</dt>
              <dd className="font-medium">{r.equipo}</dd>
              {r.imei && <dd className="font-mono text-sm text-tinta-suave">IMEI / serie {r.imei}</dd>}
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-apagado">Falla informada</dt>
              <dd className="whitespace-pre-wrap">{r.falla}</dd>
            </div>
            {r.estado_equipo && (
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-apagado">Cómo se recibe</dt>
                <dd className="whitespace-pre-wrap">{r.estado_equipo}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs font-medium text-apagado">Presupuesto estimado</dt>
              <dd className="num">{r.presupuesto != null ? formatoPesos(Number(r.presupuesto)) : 'A confirmar'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-apagado">Fecha estimada</dt>
              <dd>{r.prometido ?? 'A confirmar'}</dd>
            </div>
            {r.precio != null && (
              <div className="print:hidden">
                <dt className="text-xs font-medium text-apagado">A cobrar</dt>
                <dd className="num text-xl font-bold">{formatoPesos(Number(r.precio))}</dd>
              </div>
            )}
            {r.diagnostico && (
              <div className="sm:col-span-2 print:hidden">
                <dt className="text-xs font-medium text-apagado">Diagnóstico / trabajo hecho</dt>
                <dd className="whitespace-pre-wrap">{r.diagnostico}</dd>
              </div>
            )}
          </dl>
          {ajustes.condiciones_reparacion && (
            <p className="border-t border-linea px-6 py-4 text-xs leading-relaxed text-tinta-suave">{ajustes.condiciones_reparacion}</p>
          )}
          <div className="hidden grid-cols-2 gap-10 px-6 pt-10 pb-6 text-xs text-tinta-suave print:grid">
            <p className="border-t border-tinta pt-1">Firma del cliente</p>
            <p className="border-t border-tinta pt-1">Recibió: {r.recibio ?? ''}</p>
          </div>
        </Tarjeta>

        <div className="space-y-5 print:hidden">
          <AccionesReparacion
            id={r.id}
            estado={r.estado}
            precio={r.precio != null ? Number(r.precio) : null}
            presupuesto={r.presupuesto != null ? Number(r.presupuesto) : null}
            puedeCobrar={puede(u, 'vender')}
          />
          {r.venta_id && (
            <Aviso tipo="ok">
              Cobrada en la{' '}
              <Link href={`/ventas/${r.venta_id}`} className="font-semibold underline">
                venta N.º {r.venta_id}
              </Link>
              .
            </Aviso>
          )}
          <Tarjeta>
            <TituloTarjeta>Historial</TituloTarjeta>
            <ol className="divide-y divide-linea">
              {eventos.map((ev) => (
                <li key={ev.id} className="px-5 py-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{ESTADOS_REPARACION[ev.estado as EstadoReparacion]?.texto ?? ev.estado}</span>
                    <span className="text-xs text-apagado">{fechaHora(ev.creado)}</span>
                  </div>
                  {ev.nota && <p className="mt-0.5 whitespace-pre-wrap text-tinta-suave">{ev.nota}</p>}
                  {ev.usuario && <p className="mt-0.5 text-xs text-apagado">{ev.usuario}</p>}
                </li>
              ))}
            </ol>
          </Tarjeta>
        </div>
      </div>
    </>
  )
}
