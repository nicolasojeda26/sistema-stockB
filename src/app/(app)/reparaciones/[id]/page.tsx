import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { db } from '@/lib/db'
import { puede, requerirPermiso } from '@/lib/dal'
import { leerAjustes } from '@/lib/ajustes'
import { formatoPesos } from '@/lib/formato'
import {
  ESTADOS_REPARACION,
  estadoVisible,
  garantiaHasta,
  leerReparacion,
  linkWhatsApp,
  MOTIVOS_CIERRE,
  numeroReparacion,
  precioDeLista,
  type EstadoReparacion,
} from '@/lib/reparaciones'
import { origenSitio } from '@/lib/sitio'
import { Aviso, BotonLink, Etiqueta, Tarjeta, TituloTarjeta } from '@/components/ui'
import { AccionesReparacion, CopiarEnlace } from './acciones'

export const metadata: Metadata = { title: 'Reparación' }

const fechaHora = (d: Date) =>
  new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d)
const fecha = (d: Date) => new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)

export default async function ReparacionPage(props: PageProps<'/reparaciones/[id]'>) {
  const u = await requerirPermiso('reparaciones')
  const id = Number((await props.params).id)
  const sp = await props.searchParams
  if (!Number.isInteger(id) || id <= 0) notFound()
  const sql = db()
  const r = await leerReparacion(sql, { id })
  if (!r || (u.rol !== 'admin' && r.sucursal_id !== u.sucursal_id)) notFound()
  const [eventos, ajustes, etapas, tecnicos, reingresos, origen, deLista] = await Promise.all([
    sql<{ id: number; estado: string; nota: string | null; creado: Date; usuario: string | null; etapa: string | null; tecnico: string | null }[]>`
      select e.id, e.estado, e.nota, e.creado, us.nombre as usuario, et.nombre as etapa, t.nombre as tecnico
      from reparacion_eventos e left join usuarios us on us.id = e.usuario_id
      left join reparacion_etapas et on et.id = e.etapa_id left join tecnicos t on t.id = e.tecnico_id
      where e.reparacion_id = ${id} order by e.creado, e.id`,
    leerAjustes(),
    sql<{ id: number; nombre: string; fase: string }[]>`select id, nombre, fase from reparacion_etapas where activa and fase <> 'listo' order by orden, id`,
    sql<{ id: number; nombre: string }[]>`select id, nombre from tecnicos where activo order by lower(nombre)`,
    sql<{ id: number; creado: Date }[]>`select id, creado from reparaciones where garantia_de = ${id} order by id`,
    origenSitio(),
    r.tipo_reparacion ? precioDeLista(sql, r.equipo, r.tipo_reparacion) : Promise.resolve(null),
  ])
  const e = ESTADOS_REPARACION[r.estado]
  const numero = numeroReparacion(r.id)
  const seguimiento = `${origen}/seguimiento/${r.token}`
  const nombre = r.cliente_nombre.split(' ')[0]
  const estadoTexto = estadoVisible(r)
  const aviso =
    r.estado === 'listo'
      ? `Hola ${nombre}! Tu ${r.equipo} ya está listo para retirar en ${ajustes.nombre_negocio} ${r.sucursal}. Total: ${formatoPesos(Number(r.precio))}. Orden ${numero}. Seguimiento: ${seguimiento}`
      : r.estado === 'sin_reparacion'
        ? `Hola ${nombre}, revisamos tu ${r.equipo}: ${estadoTexto.toLowerCase()}. Podés retirarlo en ${ajustes.nombre_negocio} ${r.sucursal}. Orden ${numero}. Seguimiento: ${seguimiento}`
        : `Hola ${nombre}, te escribimos de ${ajustes.nombre_negocio} por tu ${r.equipo} (orden ${numero}). Estado: ${estadoTexto}. Podés seguirlo acá: ${seguimiento}`
  const whatsapp = linkWhatsApp(r.cliente_telefono, aviso)
  const hasta = garantiaHasta(r)
  const vencida = hasta ? hasta.getTime() < new Date(new Date().toDateString()).getTime() : false
  const reparadoEntregado = r.estado === 'entregado' && !r.motivo_cierre
  const sinReparar = r.estado === 'sin_reparacion' || (r.estado === 'entregado' && !!r.motivo_cierre)

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <BotonLink href="/reparaciones" variante="secundario">
          ← Reparaciones
        </BotonLink>
        <div className="flex flex-wrap items-center gap-2">
          {whatsapp && (
            <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center rounded-lg border border-linea bg-papel px-4 text-sm font-semibold hover:bg-fondo">
              Avisar por WhatsApp
            </a>
          )}
          <BotonLink href={`/reparacion/${r.id}?c=ingreso`} variante="secundario">
            Comprobante de ingreso
          </BotonLink>
          {(r.estado === 'listo' || reparadoEntregado) && (
            <BotonLink href={`/reparacion/${r.id}?c=garantia`} variante="secundario">
              Garantía
            </BotonLink>
          )}
          {sinReparar && (
            <BotonLink href={`/reparacion/${r.id}?c=entrega`} variante="secundario">
              Comprobante de entrega
            </BotonLink>
          )}
        </div>
      </div>
      {sp.nueva === '1' && (
        <div className="mb-4">
          <Aviso tipo="ok">
            <span className="flex flex-wrap items-center justify-between gap-3">
              <span>
                Equipo recibido con el número <strong>{numero}</strong>. Imprimí el comprobante (detalle y cláusulas, original y copia) y hacé firmar las dos hojas.
              </span>
              <Link href={`/reparacion/${r.id}?c=ingreso&auto=1`} className="inline-flex h-10 items-center rounded-lg bg-marca px-4 text-sm font-semibold text-white hover:bg-marca-oscura">
                Imprimir comprobante
              </Link>
            </span>
          </Aviso>
        </div>
      )}
      {sp.entregada === '1' && (r.estado === 'entregado' || r.estado === 'listo') && (
        <div className="mb-4">
          <Aviso tipo="ok">
            <span className="flex flex-wrap items-center justify-between gap-3">
              <span>Equipo entregado. Imprimí el comprobante de salida para que lo firme el cliente.</span>
              <Link
                href={`/reparacion/${r.id}?c=${r.motivo_cierre ? 'entrega' : 'garantia'}&auto=1`}
                className="inline-flex h-10 items-center rounded-lg bg-marca px-4 text-sm font-semibold text-white hover:bg-marca-oscura"
              >
                Imprimir {r.motivo_cierre ? 'entrega' : 'garantía'}
              </Link>
            </span>
          </Aviso>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          <Tarjeta className="overflow-hidden">
            <div className="border-b border-linea p-6">
              <p className="text-xs font-bold tracking-[.14em] text-apagado">SERVICIO TÉCNICO · {r.sucursal.toUpperCase()}</p>
              <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h1 className="font-mono text-3xl font-bold tracking-tight">{numero}</h1>
                  <p className="mt-1 text-sm text-tinta-suave">Ingresó el {fechaHora(r.creado)}</p>
                </div>
                <div className="text-right">
                  <Etiqueta tono={e.tono}>{estadoTexto}</Etiqueta>
                  {r.tecnico && <p className="mt-1 text-xs text-tinta-suave">Técnico: {r.tecnico}</p>}
                </div>
              </div>
            </div>
            <dl className="grid gap-x-6 gap-y-4 p-6 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium text-apagado">Cliente</dt>
                <dd className="font-medium">{r.cliente_nombre}</dd>
                <dd className="text-sm text-tinta-suave">{[r.cliente_dni && `DNI ${r.cliente_dni}`, r.cliente_telefono].filter(Boolean).join(' · ') || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-apagado">Equipo</dt>
                <dd className="font-medium">{r.equipo}</dd>
                {r.imei && <dd className="font-mono text-sm text-tinta-suave">IMEI / serie {r.imei}</dd>}
              </div>
              <div>
                <dt className="text-xs font-medium text-apagado">Tipo de reparación</dt>
                <dd>{r.tipo_reparacion ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-apagado">Fecha estimada</dt>
                <dd>{r.prometido ?? 'A confirmar'}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-apagado">Falla informada</dt>
                <dd className="whitespace-pre-wrap">{r.falla}</dd>
              </div>
              {r.estado_equipo && (
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium text-apagado">Cómo se recibió</dt>
                  <dd className="whitespace-pre-wrap">{r.estado_equipo}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs font-medium text-apagado">Presupuesto</dt>
                <dd className="num">
                  {r.presupuesto != null ? formatoPesos(r.presupuesto) : 'A confirmar'}
                  {deLista != null && deLista !== r.presupuesto && <span className="ml-1 text-xs text-tinta-suave">(lista: {formatoPesos(deLista)})</span>}
                </dd>
              </div>
              {r.precio != null && (
                <div>
                  <dt className="text-xs font-medium text-apagado">A cobrar</dt>
                  <dd className="num text-xl font-bold">{formatoPesos(r.precio)}</dd>
                  {r.cobrado != null && r.cobrado !== r.precio && <dd className="text-xs text-tinta-suave">Cobrado con descuento: {formatoPesos(r.cobrado)}</dd>}
                </div>
              )}
              {r.motivo_cierre && (
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium text-apagado">Por qué no se reparó</dt>
                  <dd>{MOTIVOS_CIERRE[r.motivo_cierre]}</dd>
                </div>
              )}
              {r.diagnostico && (
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium text-apagado">Diagnóstico / trabajo hecho</dt>
                  <dd className="whitespace-pre-wrap">{r.diagnostico}</dd>
                </div>
              )}
              {(r.garantia_dias != null || hasta) && (
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium text-apagado">Garantía</dt>
                  <dd>
                    {r.garantia_dias} días{hasta ? ` · vigente hasta el ${fecha(hasta)}${vencida ? ' (vencida)' : ''}` : ''}
                  </dd>
                </div>
              )}
            </dl>
          </Tarjeta>

          {(r.garantia_de || reingresos.length > 0) && (
            <Tarjeta className="p-5 text-sm">
              {r.garantia_de && (
                <p>
                  Reingreso por garantía de la reparación{' '}
                  <Link href={`/reparaciones/${r.garantia_de}`} className="font-semibold text-marca hover:underline">
                    {numeroReparacion(r.garantia_de)}
                  </Link>
                  .
                </p>
              )}
              {reingresos.map((x) => (
                <p key={x.id}>
                  Volvió por garantía el {fecha(x.creado)}:{' '}
                  <Link href={`/reparaciones/${x.id}`} className="font-semibold text-marca hover:underline">
                    {numeroReparacion(x.id)}
                  </Link>
                </p>
              ))}
            </Tarjeta>
          )}

          <Tarjeta className="p-5">
            <p className="text-sm font-medium">Enlace de seguimiento para el cliente</p>
            <p className="mt-1 text-xs text-tinta-suave">Ve el estado y el historial, sin notas internas. Va también en el comprobante y en el WhatsApp.</p>
            <CopiarEnlace url={seguimiento} />
          </Tarjeta>
        </div>

        <div className="space-y-5">
          <AccionesReparacion
            id={r.id}
            estado={r.estado}
            etapaId={r.etapa_id}
            precio={r.precio}
            presupuesto={r.presupuesto ?? deLista}
            tipoReparacion={r.tipo_reparacion}
            tecnicoId={r.tecnico_id}
            garantiaDias={r.garantia_dias ?? (Number(ajustes.garantia_dias) || 0)}
            etapas={etapas}
            tecnicos={tecnicos}
            puedeCobrar={puede(u, 'vender')}
            puedeReingresar={reparadoEntregado}
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
                    <span className="font-medium">
                      {ev.estado === 'nota' ? 'Nota interna' : (ev.etapa ?? ESTADOS_REPARACION[ev.estado as EstadoReparacion]?.texto ?? ev.estado)}
                    </span>
                    <span className="text-xs text-apagado">{fechaHora(ev.creado)}</span>
                  </div>
                  {ev.nota && <p className="mt-0.5 whitespace-pre-wrap text-tinta-suave">{ev.nota}</p>}
                  <p className="mt-0.5 text-xs text-apagado">{[ev.usuario, ev.tecnico && `técnico: ${ev.tecnico}`].filter(Boolean).join(' · ')}</p>
                </li>
              ))}
            </ol>
          </Tarjeta>
        </div>
      </div>
    </>
  )
}
