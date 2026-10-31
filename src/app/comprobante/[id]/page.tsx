import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import QRCode from 'qrcode'
import { db } from '@/lib/db'
import { requerirUsuario } from '@/lib/dal'
import { leerAjustes } from '@/lib/ajustes'
import { leerConfig } from '@/lib/arca/facturacion'
import { CONDICIONES_EMISOR, CONDICIONES_RECEPTOR, DOC_TIPOS, TIPOS_CBTE, formatoCuit, numeroComprobante, urlQR, type CondicionEmisor } from '@/lib/arca/comprobantes'
import { formatoPesos } from '@/lib/formato'
import { Imprimir } from '@/app/ticket/[id]/imprimir'

export const metadata: Metadata = { title: 'Comprobante' }

const fecha = (d: Date | string) => new Date(d).toLocaleDateString('es-AR', { timeZone: 'UTC' })

/** Factura o nota de crédito electrónica, lista para imprimir (térmica o A4). */
export default async function ComprobantePage(props: PageProps<'/comprobante/[id]'>) {
  const u = await requerirUsuario()
  const id = Number((await props.params).id)
  const sp = await props.searchParams
  if (!Number.isInteger(id)) notFound()
  const sql = db()
  const [c] = await sql<
    {
      venta_id: number
      devolucion_id: number | null
      asociado_id: number | null
      ambiente: string
      cbte_tipo: number
      punto_venta: number
      numero: number
      fecha: Date
      emisor_cuit: string
      emisor_razon_social: string
      emisor_condicion: CondicionEmisor
      doc_tipo: number
      doc_nro: string
      receptor_nombre: string | null
      receptor_condicion: number
      receptor_domicilio: string | null
      total: number
      neto: number
      iva: number
      alicuota: number | null
      cae: string
      cae_vence: Date | null
      estado: string
      sucursal_id: number
      sucursal: string
    }[]
  >`
    select c.*, v.sucursal_id, s.nombre as sucursal
    from comprobantes c join ventas v on v.id = c.venta_id join sucursales s on s.id = v.sucursal_id
    where c.id = ${id} and c.estado = 'autorizado'`
  if (!c || (u.rol !== 'admin' && c.sucursal_id !== u.sucursal_id)) notFound()

  const [ajustes, config, items, asociado] = await Promise.all([
    leerAjustes(),
    leerConfig(sql),
    c.devolucion_id
      ? sql<{ nombre: string; cantidad: number; subtotal: number }[]>`
          select i.nombre, di.cantidad, di.subtotal from devolucion_items di join venta_items i on i.id = di.venta_item_id where di.devolucion_id = ${c.devolucion_id} order by di.id`
      : sql<{ nombre: string; cantidad: number; subtotal: number }[]>`select nombre, cantidad, subtotal from venta_items where venta_id = ${c.venta_id} order by id`,
    c.asociado_id ? sql<{ cbte_tipo: number; punto_venta: number; numero: number }[]>`select cbte_tipo, punto_venta, numero from comprobantes where id = ${c.asociado_id}` : [],
  ])

  const tipo = TIPOS_CBTE[c.cbte_tipo]
  const fechaIso = new Date(c.fecha).toISOString().slice(0, 10)
  const qr = await QRCode.toString(
    urlQR({ fecha: fechaIso, cuit: Number(c.emisor_cuit), ptoVta: c.punto_venta, tipoCmp: c.cbte_tipo, nroCmp: c.numero, importe: Number(c.total), tipoDocRec: c.doc_tipo, nroDocRec: Number(c.doc_nro), cae: c.cae }),
    { type: 'svg', margin: 0, errorCorrectionLevel: 'M' },
  )
  const a4 = sp.formato === 'a4'
  const ancho = a4 ? 190 : ajustes.ancho_ticket === '58' ? 58 : 80
  // Los ítems se imprimen con el total ajustado (descuento general incluido).
  const sumaItems = items.reduce((a, i) => a + Number(i.subtotal), 0)
  const factor = sumaItems > 0 && !c.devolucion_id ? Number(c.total) / sumaItems : 1
  const discrimina = tipo.letra === 'A'
  const prueba = c.ambiente !== 'produccion'

  return (
    <main className="min-h-screen bg-fondo py-6 print:bg-white print:py-0">
      <style>{`@media print { @page { size: ${a4 ? 'A4' : `${ancho}mm auto`}; margin: ${a4 ? '10mm' : '0'}; } }`}</style>
      <div className="mb-4 flex justify-center gap-2 print:hidden">
        <Imprimir automatico={sp.imprimir === '1'} />
        <a href={a4 ? `/comprobante/${id}` : `/comprobante/${id}?formato=a4`} className="inline-flex h-10 items-center rounded-lg border border-linea bg-papel px-4 text-sm font-medium hover:bg-fondo">
          {a4 ? 'Formato ticket' : 'Formato A4'}
        </a>
      </div>
      <article
        className={`mx-auto bg-white text-black shadow-sm print:shadow-none ${a4 ? 'p-8 text-[12px]' : 'px-[3mm] py-[4mm] font-mono text-[10.5px]'} leading-snug`}
        style={{ width: `${ancho}mm` }}
      >
        {prueba && (
          <p className="mb-2 border border-black py-1 text-center font-bold">
            {c.ambiente === 'simulacion' ? 'SIMULACIÓN · SIN VALIDEZ FISCAL' : 'HOMOLOGACIÓN · SIN VALIDEZ FISCAL'}
          </p>
        )}
        <header className={a4 ? 'grid grid-cols-[1fr_auto_1fr] items-start gap-4 border-b border-black pb-4' : 'text-center'}>
          <div className={a4 ? '' : ''}>
            <p className={`font-bold ${a4 ? 'text-[16px]' : 'text-[13px]'}`}>{ajustes.nombre_negocio}</p>
            <p>{c.emisor_razon_social}</p>
            {config.domicilio && <p>{config.domicilio}</p>}
            <p>{CONDICIONES_EMISOR[c.emisor_condicion]}</p>
          </div>
          <div className={`text-center ${a4 ? 'border border-black px-4 py-2' : 'my-2'}`}>
            <p className="text-[20px] leading-none font-bold">{tipo.letra}</p>
            <p className="text-[9px]">COD. {String(c.cbte_tipo).padStart(3, '0')}</p>
          </div>
          <div className={a4 ? 'text-right' : ''}>
            <p className="font-bold">{tipo.nombre.toUpperCase()}</p>
            <p>N.º {numeroComprobante(c.punto_venta, c.numero)}</p>
            <p>Fecha: {fecha(c.fecha)}</p>
            <p>CUIT: {formatoCuit(c.emisor_cuit)}</p>
            {config.iibb && <p>IIBB: {config.iibb}</p>}
            {config.inicio_actividades && <p>Inicio de actividades: {fecha(config.inicio_actividades)}</p>}
          </div>
        </header>
        <hr className={`my-2 border-dashed border-black ${a4 ? 'hidden' : ''}`} />
        <section className={a4 ? 'mt-3 border-b border-black pb-3' : ''}>
          {c.doc_tipo === 99 ? (
            <p>Cliente: Consumidor Final</p>
          ) : (
            <>
              <p>Cliente: {c.receptor_nombre}</p>
              <p>
                {DOC_TIPOS[c.doc_tipo]}: {c.doc_tipo === 80 || c.doc_tipo === 86 ? formatoCuit(c.doc_nro) : c.doc_nro}
              </p>
              <p>{CONDICIONES_RECEPTOR[c.receptor_condicion]}</p>
              {c.receptor_domicilio && <p>{c.receptor_domicilio}</p>}
            </>
          )}
          {asociado[0] && (
            <p className="mt-1">
              Asociada a {TIPOS_CBTE[asociado[0].cbte_tipo].nombre} {numeroComprobante(asociado[0].punto_venta, asociado[0].numero)}
            </p>
          )}
        </section>
        <hr className={`my-2 border-dashed border-black ${a4 ? 'hidden' : ''}`} />
        <section className={a4 ? 'mt-3' : ''}>
          {items.map((i, n) => {
            const sub = Math.round(Number(i.subtotal) * factor * 100) / 100
            const mostrado = discrimina ? Math.round((sub / (1 + (Number(c.alicuota) || 21) / 100)) * 100) / 100 : sub
            return (
              <div key={n} className="mb-1 flex justify-between gap-2">
                <span>
                  {i.cantidad} × {i.nombre}
                </span>
                <span className="shrink-0">{formatoPesos(mostrado)}</span>
              </div>
            )
          })}
        </section>
        <hr className="my-2 border-dashed border-black" />
        <section className={a4 ? 'ml-auto w-72' : ''}>
          {discrimina && (
            <>
              <p className="flex justify-between">
                <span>Neto gravado</span>
                <span>{formatoPesos(c.neto)}</span>
              </p>
              <p className="flex justify-between">
                <span>IVA {Number(c.alicuota)} %</span>
                <span>{formatoPesos(c.iva)}</span>
              </p>
            </>
          )}
          <p className={`flex justify-between font-bold ${a4 ? 'text-[15px]' : 'text-[13px]'}`}>
            <span>TOTAL</span>
            <span>{formatoPesos(c.total)}</span>
          </p>
          {tipo.letra === 'B' && Number(c.iva) > 0 && (
            <p className="mt-1 text-[9.5px]">
              Régimen de Transparencia Fiscal al Consumidor (Ley 27.743) · IVA contenido: {formatoPesos(c.iva)}
            </p>
          )}
        </section>
        <hr className="my-2 border-dashed border-black" />
        <footer className={a4 ? 'mt-4 flex items-center gap-4' : 'text-center'}>
          <div className={a4 ? 'w-28 shrink-0' : 'mx-auto my-2 w-[30mm]'} dangerouslySetInnerHTML={{ __html: qr }} />
          <div>
            <p className="font-bold">CAE: {c.cae}</p>
            {c.cae_vence && <p>Vencimiento CAE: {fecha(c.cae_vence)}</p>}
            <p className="mt-1 text-[9px]">Comprobante autorizado por ARCA</p>
          </div>
        </footer>
      </article>
    </main>
  )
}
