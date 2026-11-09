import * as XLSX from 'xlsx'
import { db } from '@/lib/db'
import { usuarioActual } from '@/lib/dal'
import { MEDIOS, type MedioPago } from '@/lib/venta-calculo'
import { fechaValida, hoyAR, inicioDeMes, masVendidos, porDia, porMedio, porSucursal, porVendedora, resumen, sinMovimiento, valorStock } from '@/lib/reportes'

/** Reportes en un Excel con una hoja por tema. */
export async function GET(req: Request) {
  const u = await usuarioActual()
  if (!u || u.rol !== 'admin') return new Response('No autorizado', { status: 403 })
  const sp = new URL(req.url).searchParams
  const desde = fechaValida(sp.get('desde')) || inicioDeMes()
  const hasta = fechaValida(sp.get('hasta')) || hoyAR()
  const f = { desde, hasta: hasta < desde ? desde : hasta, sucursalId: Number(sp.get('sucursal')) || null }
  const sql = db()
  const [r, dias, sucs, vends, medios, top, quietos, valor] = await Promise.all([
    resumen(sql, f),
    porDia(sql, f),
    porSucursal(sql, f),
    porVendedora(sql, f),
    porMedio(sql, f),
    masVendidos(sql, f, 200),
    sinMovimiento(sql, f.sucursalId),
    valorStock(sql, f.sucursalId),
  ])
  const n = (v: unknown) => Number(v ?? 0)
  const libro = XLSX.utils.book_new()
  const hoja = (nombre: string, filas: Record<string, unknown>[]) =>
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(filas.length ? filas : [{ '': 'Sin datos' }]), nombre)

  hoja('Resumen', [
    { Dato: 'Desde', Valor: f.desde },
    { Dato: 'Hasta', Valor: f.hasta },
    { Dato: 'Ventas', Valor: r.ventas },
    { Dato: 'Vendido bruto', Valor: r.bruto },
    { Dato: 'Devoluciones', Valor: r.devuelto },
    { Dato: 'Vendido neto', Valor: r.neto },
    { Dato: 'Ticket promedio', Valor: r.promedio },
    { Dato: 'Unidades', Valor: r.unidades },
  ])
  hoja('Por día', dias.map((d) => ({ Fecha: d.dia, Ventas: d.ventas, Total: n(d.total) })))
  hoja('Por sucursal', sucs.map((s) => ({ Sucursal: s.nombre, Ventas: s.ventas, Total: n(s.total) })))
  hoja('Por vendedor', vends.map((s) => ({ Vendedor: s.nombre, Ventas: s.ventas, Total: n(s.total) })))
  hoja('Por medio de pago', medios.map((m) => ({ Medio: MEDIOS[m.medio as MedioPago], Pagos: m.pagos, Total: n(m.total) })))
  hoja('Más vendidos', top.map((p) => ({ Código: p.codigo, Producto: p.nombre, Unidades: p.unidades, Total: n(p.total) })))
  hoja(
    'Sin ventas 60 días',
    quietos.map((p) => ({ Código: p.codigo, Producto: p.nombre, Stock: p.stock, 'Valor a costo': n(p.valor), 'Última venta': p.ultima ? p.ultima.toISOString().slice(0, 10) : 'Nunca' })),
  )
  hoja('Valor del stock', valor.map((v) => ({ Sucursal: v.sucursal, Depósito: v.deposito, Unidades: v.unidades, 'A costo': n(v.costo), 'A precio de venta': n(v.venta) })))

  const archivo = XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  return new Response(new Uint8Array(archivo), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="reportes-${f.desde}-a-${f.hasta}.xlsx"`,
    },
  })
}
