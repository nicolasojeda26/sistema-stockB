import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requerirUsuario } from '@/lib/dal'
import { leerAjustes } from '@/lib/ajustes'
import { leerVenta } from '@/lib/venta-detalle'
import { formatoFecha, formatoPesos } from '@/lib/formato'
import { MEDIOS } from '@/lib/venta-calculo'
import { Imprimir } from './imprimir'

export const metadata: Metadata = { title: 'Ticket' }

/** Ticket para impresora térmica (58 u 80 mm). No es una factura. */
export default async function TicketPage(props: PageProps<'/ticket/[id]'>) {
  const u = await requerirUsuario()
  const id = Number((await props.params).id)
  const imprimir = (await props.searchParams).imprimir === '1'
  if (!Number.isInteger(id)) notFound()
  const [v, ajustes] = await Promise.all([leerVenta(id, u), leerAjustes()])
  if (!v) notFound()
  const ancho = ajustes.ancho_ticket === '58' ? 58 : 80

  return (
    <main className="min-h-screen bg-fondo py-6 print:bg-white print:py-0">
      <style>{`@media print { @page { size: ${ancho}mm auto; margin: 0; } }`}</style>
      <div className="mb-4 flex justify-center gap-2 print:hidden">
        <Imprimir automatico={imprimir} />
      </div>
      <article
        className="mx-auto bg-white px-[3mm] py-[4mm] font-mono text-[11px] leading-snug text-black shadow-sm print:shadow-none"
        style={{ width: `${ancho}mm` }}
      >
        <header className="text-center">
          <p className="text-[14px] font-bold">{ajustes.nombre_negocio}</p>
          <p>{v.sucursal}</p>
          {v.direccion && <p>{v.direccion}</p>}
        </header>
        <hr className="my-2 border-dashed border-black" />
        <p>Comprobante N.º {v.id}</p>
        <p>{formatoFecha(v.creado)}</p>
        {v.vendedora && <p>Atendió: {v.vendedora}</p>}
        {v.estado === 'anulada' && <p className="mt-1 text-center font-bold">*** VENTA ANULADA ***</p>}
        <hr className="my-2 border-dashed border-black" />
        {v.items.map((i) => (
          <div key={i.id} className="mb-1">
            <p>{i.nombre}</p>
            <p className="flex justify-between">
              <span>
                {i.cantidad} x {formatoPesos(i.precio_unitario)}
                {i.descuento_pct > 0 && ` -${i.descuento_pct}%`}
              </span>
              <span>{formatoPesos(i.subtotal)}</span>
            </p>
          </div>
        ))}
        <hr className="my-2 border-dashed border-black" />
        {v.descuento > 0 && (
          <>
            <p className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatoPesos(v.subtotal)}</span>
            </p>
            <p className="flex justify-between">
              <span>Descuentos</span>
              <span>-{formatoPesos(v.descuento)}</span>
            </p>
          </>
        )}
        <p className="flex justify-between text-[14px] font-bold">
          <span>TOTAL</span>
          <span>{formatoPesos(v.total)}</span>
        </p>
        <div className="mt-2">
          {v.pagos.map((p, i) => (
            <p key={i} className="flex justify-between">
              <span>
                {MEDIOS[p.medio]}
                {p.cuotas && p.cuotas > 1 ? ` (${p.cuotas} cuotas)` : ''}
              </span>
              <span>{formatoPesos(p.monto)}</span>
            </p>
          ))}
          {v.efectivo_recibido !== null && v.vuelto > 0 && (
            <>
              <p className="flex justify-between">
                <span>Recibido</span>
                <span>{formatoPesos(v.efectivo_recibido)}</span>
              </p>
              <p className="flex justify-between">
                <span>Vuelto</span>
                <span>{formatoPesos(v.vuelto)}</span>
              </p>
            </>
          )}
        </div>
        <hr className="my-2 border-dashed border-black" />
        {ajustes.pie_ticket && <p className="text-center">{ajustes.pie_ticket}</p>}
        <p className="mt-1 text-center text-[9px]">Comprobante no válido como factura</p>
      </article>
    </main>
  )
}
