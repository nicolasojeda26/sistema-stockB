import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { db } from '@/lib/db'
import { requerirPermiso } from '@/lib/dal'
import { leerAjustes, urlLogo } from '@/lib/ajustes'
import { formatoPesos } from '@/lib/formato'
import { leerReparacion, MOTIVOS_CIERRE, numeroReparacion, type ReparacionCompleta } from '@/lib/reparaciones'
import { origenSitio } from '@/lib/sitio'
import { BarraImprimir } from './imprimir'

export const metadata: Metadata = { title: 'Comprobante de reparación' }

const TIPOS = {
  ingreso: 'Comprobante de ingreso',
  garantia: 'Comprobante de garantía de reparación',
  entrega: 'Comprobante de entrega',
} as const
type Tipo = keyof typeof TIPOS

const fecha = (d: Date) => new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
const fechaHora = (d: Date) =>
  new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d)
const renglones = (t: string) => t.split('\n').map((l) => l.trim()).filter(Boolean)

/**
 * Comprobantes del área técnica, en A4, con original para el cliente y copia para el local:
 * - ingreso: hoja 1 con el detalle de cómo entra el equipo, hoja 2 con las cláusulas (se firman las dos);
 * - garantia: al entregar el equipo reparado;
 * - entrega: al entregarlo sin solución o como devolución (sin costo).
 */
export default async function ComprobanteReparacionPage(props: PageProps<'/reparacion/[id]'>) {
  const u = await requerirPermiso('reparaciones')
  const id = Number((await props.params).id)
  const sp = await props.searchParams
  if (!Number.isInteger(id) || id <= 0) notFound()
  const [r, ajustes, origen] = await Promise.all([leerReparacion(db(), { id }), leerAjustes(), origenSitio()])
  if (!r || (u.rol !== 'admin' && r.sucursal_id !== u.sucursal_id)) notFound()
  // "salida": la que corresponde al entregar (garantía si se reparó, entrega si no).
  const tipo: Tipo = sp.c === 'salida' ? (r.motivo_cierre ? 'entrega' : 'garantia') : sp.c === 'garantia' || sp.c === 'entrega' ? sp.c : 'ingreso'
  const logo = urlLogo(ajustes)
  const seguimiento = `${origen}/seguimiento/${r.token}`
  const copias = ['Original: cliente', 'Copia: local']

  const Encabezado = ({ titulo, copia, hoja }: { titulo: string; copia: string; hoja?: string }) => (
    <header className="mb-5 flex items-start justify-between gap-4 border-b-2 border-black pb-3">
      <div>
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt={ajustes.nombre_negocio} className="h-12 w-auto object-contain" />
        ) : (
          <p className="text-2xl font-bold">{ajustes.nombre_negocio}</p>
        )}
        <p className="mt-1 text-xs">
          {r.sucursal}
          {r.sucursal_direccion && r.sucursal_direccion !== r.sucursal ? ` · ${r.sucursal_direccion}` : ''}
        </p>
      </div>
      <div className="text-right">
        <p className="text-xs uppercase">N.º de orden</p>
        <p className="font-mono text-2xl font-bold">{numeroReparacion(r.id)}</p>
        <p className="mt-1 text-sm font-bold uppercase underline">{titulo}</p>
        <p className="text-[10px] uppercase">
          {copia}
          {hoja ? ` · ${hoja}` : ''}
        </p>
      </div>
    </header>
  )
  const Dato = ({ k, v, ancho }: { k: string; v: ReactNode; ancho?: boolean }) => (
    <div className={`border-b border-dotted border-black pb-1 ${ancho ? 'col-span-2' : ''}`}>
      <span className="text-[10px] uppercase">{k}: </span>
      <span className="font-medium">{v || '—'}</span>
    </div>
  )
  const Clausulas = ({ texto }: { texto: string }) => (
    <div className="rounded border border-black p-3 text-[11px] leading-snug">
      <p className="mb-2 font-bold underline">CLÁUSULAS</p>
      {renglones(texto).map((l, i) => {
        // "CLÁUSULA 1:" va subrayado, como en el talonario.
        const m = l.match(/^(CL[AÁ]USULA\s*\d+\s*[:.\-–]?)(.*)$/i)
        return (
          <p key={i} className="mb-1.5">
            {m ? (
              <>
                <span className="font-semibold underline">{m[1]}</span>
                {m[2]}
              </>
            ) : (
              l
            )}
          </p>
        )
      })}
    </div>
  )
  const Firmas = ({ personal }: { personal: string | null }) => (
    <div className="mt-8 space-y-6 text-xs">
      <p className="font-bold underline">DATOS DEL CLIENTE</p>
      <div className="grid grid-cols-3 gap-6">
        <p className="border-t border-black pt-1">DNI: {r.cliente_dni ?? ''}</p>
        <p className="border-t border-black pt-1">Firma</p>
        <p className="border-t border-black pt-1">Aclaración: {r.cliente_nombre}</p>
      </div>
      <p className="border-t border-black pt-1 sm:w-1/2">Personal encargado/a: {personal ?? ''}</p>
    </div>
  )

  return (
    <main className="min-h-screen bg-fondo py-6 text-black print:bg-white print:py-0">
      <style>{`@media print { @page { size: A4; margin: 12mm; } .hoja { break-after: page; } .hoja:last-child { break-after: auto; } }`}</style>
      <BarraImprimir automatico={sp.auto === '1'} volver={`/reparaciones/${r.id}`} />
      <div className="mx-auto max-w-[210mm] space-y-6 print:space-y-0">
        {copias.map((copia) =>
          tipo === 'ingreso' ? (
            <IngresoHojas key={copia} copia={copia} />
          ) : tipo === 'garantia' ? (
            <section key={copia} className="hoja bg-white p-[12mm] shadow-sm print:p-0 print:shadow-none">
              <Encabezado titulo={TIPOS.garantia} copia={copia} />
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <Dato k="Fecha" v={fecha(r.entregado_en ?? new Date())} />
                <Dato k="Orden de reparación N.º" v={numeroReparacion(r.id)} />
                <Dato k="Dirección de sucursal" v={r.sucursal_direccion ?? r.sucursal} ancho />
                <Dato k="Equipo" v={`${r.equipo}${r.imei ? ` · IMEI ${r.imei}` : ''}`} ancho />
                <Dato k="Tipo de reparación" v={r.tipo_reparacion ?? r.diagnostico} ancho />
                <Dato k="Precio final en pesos" v={formatoPesos(r.cobrado ?? r.precio ?? 0)} />
                <Dato k="Técnico" v={r.tecnico} />
              </div>
              <p className="my-4 text-xs font-bold underline">
                EN VIRTUD DE LA NATURALEZA DEL PRODUCTO ELECTRÓNICO Y CON EL OBJETIVO DE GARANTIZAR UN SERVICIO EFICIENTE Y OPORTUNO SE ESTABLECE QUE LA
                GARANTÍA NO PODRÁ SER EXTENDIDA POR UN PERÍODO SUPERIOR A {r.garantia_dias ?? Number(ajustes.garantia_dias) ?? 0} DÍAS A PARTIR DE LA FECHA
                DE ADQUISICIÓN.
              </p>
              <Clausulas texto={ajustes.clausulas_garantia} />
              <Firmas personal={r.entrego} />
            </section>
          ) : (
            <section key={copia} className="hoja bg-white p-[12mm] shadow-sm print:p-0 print:shadow-none">
              <Encabezado titulo={`${TIPOS.entrega}${(r.cobrado ?? r.precio ?? 0) > 0 ? '' : ' (no tiene costo alguno)'}`} copia={copia} />
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <Dato k="N.º de orden de reparación" v={numeroReparacion(r.id)} />
                <Dato k="Fecha" v={fecha(r.entregado_en ?? new Date())} />
                <Dato k="Dirección de sucursal" v={r.sucursal_direccion ?? r.sucursal} ancho />
                <Dato k="Nombre y apellido" v={r.cliente_nombre} />
                <Dato k="DNI" v={r.cliente_dni} />
                <Dato k="Equipo" v={`${r.equipo}${r.imei ? ` · IMEI ${r.imei}` : ''}`} ancho />
                <Dato k="Tipo de reparación" v={r.tipo_reparacion ?? r.falla} ancho />
                <Dato k="Motivo" v={r.motivo_cierre ? MOTIVOS_CIERRE[r.motivo_cierre] : null} ancho />
                <Dato k="Precio" v={(r.cobrado ?? r.precio ?? 0) > 0 ? formatoPesos(r.cobrado ?? r.precio ?? 0) : 'Sin costo'} />
              </div>
              <div className="mt-5">
                <Clausulas texto={ajustes.clausulas_entrega} />
              </div>
              <Firmas personal={r.entrego} />
            </section>
          ),
        )}
      </div>
    </main>
  )

  function IngresoHojas({ copia }: { copia: string }) {
    return (
      <>
        <section className="hoja bg-white p-[12mm] shadow-sm print:p-0 print:shadow-none">
          <Encabezado titulo={TIPOS.ingreso} copia={copia} hoja="Hoja 1 de 2" />
          <DetalleIngreso r={r!} seguimiento={seguimiento} />
          <Firmas personal={r!.recibio} />
        </section>
        <section className="hoja bg-white p-[12mm] shadow-sm print:p-0 print:shadow-none">
          <Encabezado titulo={TIPOS.ingreso} copia={copia} hoja="Hoja 2 de 2" />
          <p className="mb-3 text-sm">
            Cliente: <strong>{r!.cliente_nombre}</strong>
            {r!.cliente_dni ? ` · DNI ${r!.cliente_dni}` : ''} · Equipo: <strong>{r!.equipo}</strong>
          </p>
          <Clausulas texto={ajustes.clausulas_ingreso} />
          <p className="mt-3 text-xs">El cliente declara conocer y aceptar las cláusulas anteriores.</p>
          <Firmas personal={r!.recibio} />
        </section>
      </>
    )
  }
}

function DetalleIngreso({ r, seguimiento }: { r: ReparacionCompleta; seguimiento: string }) {
  const filas: [string, ReactNode][] = [
    ['Fecha de ingreso', fechaHora(r.creado)],
    ['Cliente', r.cliente_nombre],
    ['DNI', r.cliente_dni],
    ['Teléfono', r.cliente_telefono],
    ['Equipo', r.equipo],
    ['IMEI / n.º de serie', r.imei],
    ['Tipo de reparación', r.tipo_reparacion],
    ['Falla informada', r.falla],
    ['Cómo se recibe', r.estado_equipo],
    ['Presupuesto estimado', r.presupuesto != null ? formatoPesos(r.presupuesto) : 'A confirmar'],
    ['Fecha estimada', r.prometido ?? 'A confirmar'],
    ...(r.garantia_de ? ([['Reingreso por garantía de', numeroReparacion(r.garantia_de)]] as [string, ReactNode][]) : []),
    ['Recibió', r.recibio],
  ]
  return (
    <>
      <table className="w-full border-collapse text-sm">
        <tbody>
          {filas.map(([k, v]) => (
            <tr key={k} className="border-b border-dotted border-black align-top">
              <td className="w-44 py-1.5 pr-3 text-[11px] uppercase">{k}</td>
              <td className="py-1.5 font-medium whitespace-pre-wrap">{v || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-4 text-xs">
        Seguí el estado de tu equipo en: <span className="font-mono break-all">{seguimiento}</span>
      </p>
    </>
  )
}
