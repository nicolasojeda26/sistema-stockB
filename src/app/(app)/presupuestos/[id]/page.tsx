import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { requerirUsuario } from '@/lib/dal'
import { formatoDia, formatoPesos, hoyAR } from '@/lib/formato'
import { calcularVenta } from '@/lib/venta-calculo'
import { Aviso, BotonLink, Etiqueta, Tarjeta, TituloTarjeta, tablaCls as t } from '@/components/ui'
import { BotonImprimir } from '@/components/boton-imprimir'
import { EstadoPresupuesto } from '../estado'

export const metadata: Metadata = { title: 'Presupuesto' }

const ESTADOS = {
  abierto: { texto: 'Abierto', tono: 'marca' },
  aceptado: { texto: 'Aceptado', tono: 'ok' },
  rechazado: { texto: 'Rechazado', tono: 'alerta' },
  cancelado: { texto: 'Cancelado', tono: 'apagado' },
} as const

export default async function PresupuestoDetallePage(props: PageProps<'/presupuestos/[id]'>) {
  const u = await requerirUsuario()
  const id = Number((await props.params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const sql = db()
  const [p] = await sql<{
    id: number; sucursal_id: number; sucursal: string; creado: Date; valido_hasta: Date | null; estado: keyof typeof ESTADOS
    descuento_global: number; total: number; nota: string | null; cliente: string | null; usuario: string
  }[]>`
    select p.*, s.nombre as sucursal, c.nombre as cliente, u.nombre as usuario
    from presupuestos p join sucursales s on s.id = p.sucursal_id
    left join clientes c on c.id = p.cliente_id join usuarios u on u.id = p.usuario_id
    where p.id = ${id}`
  if (!p || (u.rol !== 'admin' && p.sucursal_id !== u.sucursal_id)) notFound()
  const items = await sql<{ id: number; codigo: string; nombre: string; cantidad: number; precio: number; descuento_pct: number }[]>`
    select id, codigo, nombre, cantidad, precio, descuento_pct from presupuesto_items where presupuesto_id = ${id} order by id`
  const calculo = calcularVenta(items.map((i) => ({ precio: Number(i.precio), cantidad: i.cantidad, descuentoPct: Number(i.descuento_pct) })), Number(p.descuento_global))
  const estado = ESTADOS[p.estado]
  const vencido = p.estado === 'abierto' && p.valido_hasta && new Date(p.valido_hasta).toISOString().slice(0, 10) < hoyAR()

  return (
    <>
      <div className="print:hidden">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <BotonLink href="/presupuestos" variante="secundario">← Presupuestos</BotonLink>
          <div className="flex flex-wrap gap-2"><BotonImprimir texto="Imprimir / guardar PDF" /><Etiqueta tono={vencido ? 'alerta' : estado.tono}>{vencido ? 'Vencido' : estado.texto}</Etiqueta></div>
        </div>
      </div>
      {p.estado === 'cancelado' && <div className="mb-4 print:hidden"><Aviso tipo="alerta">Este presupuesto fue cancelado.</Aviso></div>}
      <Tarjeta className="mx-auto max-w-4xl overflow-hidden print:rounded-none print:border-0 print:shadow-none">
        <div className="border-b border-linea p-6 sm:p-8">
          <p className="text-xs font-bold tracking-[.14em] text-apagado">PRESUPUESTO</p>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
            <div><h1 className="text-3xl font-bold tracking-tight">P-{String(p.id).padStart(6, '0')}</h1><p className="mt-1 text-sm text-tinta-suave">Emitido el {formatoDia(p.creado)} · {p.sucursal}</p></div>
            <div className="text-left sm:text-right"><p className="text-sm font-semibold">{p.cliente ?? 'Cliente no especificado'}</p><p className="text-sm text-tinta-suave">Preparó {p.usuario}</p>{p.valido_hasta && <p className="mt-1 text-sm text-tinta-suave">Válido hasta el {formatoDia(p.valido_hasta)}</p>}</div>
          </div>
          {vencido && <p className="mt-4 text-sm font-medium text-alerta">La vigencia de este presupuesto venció.</p>}
        </div>
        <div className="overflow-x-auto">
          <table className={t.tabla}>
            <thead><tr><th className={t.th}>Producto</th><th className={`${t.th} text-right`}>Cant.</th><th className={`${t.th} text-right`}>Precio</th><th className={`${t.th} text-right`}>Desc.</th><th className={`${t.th} text-right`}>Subtotal</th></tr></thead>
            <tbody>
              {items.map((i, n) => (
                <tr key={i.id}>
                  <td className={t.td}><span className="block font-medium">{i.nombre}</span><span className="font-mono text-xs text-apagado">{i.codigo}</span></td>
                  <td className={`${t.td} num text-right`}>{i.cantidad}</td>
                  <td className={`${t.td} num text-right whitespace-nowrap`}>{formatoPesos(Number(i.precio))}</td>
                  <td className={`${t.td} num text-right`}>{Number(i.descuento_pct) ? `${Number(i.descuento_pct)}%` : '—'}</td>
                  <td className={`${t.td} num text-right whitespace-nowrap`}>{formatoPesos(calculo.subtotales[n] / 100)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="ml-auto max-w-sm space-y-2 p-6 sm:p-8">
          <p className="flex justify-between text-sm text-tinta-suave"><span>Subtotal</span><span className="num">{formatoPesos(calculo.bruto / 100)}</span></p>
          {calculo.descuento > 0 && <p className="flex justify-between text-sm text-tinta-suave"><span>Descuentos incluidos</span><span className="num">−{formatoPesos(calculo.descuento / 100)}</span></p>}
          <p className="flex justify-between border-t border-linea pt-3 text-lg font-bold"><span>Total</span><span className="num">{formatoPesos(calculo.total / 100)}</span></p>
        </div>
        {p.nota && <div className="border-t border-linea px-6 py-4 text-sm sm:px-8"><p className="font-semibold">Observaciones</p><p className="mt-1 whitespace-pre-wrap text-tinta-suave">{p.nota}</p></div>}
      </Tarjeta>
      <div className="mx-auto mt-5 max-w-4xl print:hidden"><EstadoPresupuesto id={p.id} estado={p.estado} /></div>
    </>
  )
}
