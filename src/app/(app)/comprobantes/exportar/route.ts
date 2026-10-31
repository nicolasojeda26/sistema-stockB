import * as XLSX from 'xlsx'
import { db } from '@/lib/db'
import { usuarioActual } from '@/lib/dal'
import { CONDICIONES_RECEPTOR, DOC_TIPOS, TIPOS_CBTE, numeroComprobante } from '@/lib/arca/comprobantes'
import { comprobantes, fechaValida, hoyAR, inicioDeMes } from '@/lib/reportes'

/** Libro de ventas para el contador: un comprobante por fila; las notas de crédito en negativo. */
export async function GET(req: Request) {
  const u = await usuarioActual()
  if (!u || u.rol !== 'admin') return new Response('No autorizado', { status: 403 })
  const sp = new URL(req.url).searchParams
  const f = {
    desde: fechaValida(sp.get('desde')) || inicioDeMes(),
    hasta: fechaValida(sp.get('hasta')) || hoyAR(),
    ambiente: ['simulacion', 'homologacion', 'produccion'].includes(sp.get('ambiente') ?? '') ? sp.get('ambiente')! : 'produccion',
    puntoVenta: Number(sp.get('pv')) || null,
  }
  const filas = await comprobantes(db(), f)
  const s = (tipo: number) => (TIPOS_CBTE[tipo].nc ? -1 : 1)
  const hoja = XLSX.utils.json_to_sheet(
    filas.map((c) => ({
      Fecha: new Date(c.fecha).toISOString().slice(0, 10),
      Tipo: TIPOS_CBTE[c.cbte_tipo].nombre,
      'Código tipo': c.cbte_tipo,
      'Punto de venta': c.punto_venta,
      Número: c.numero,
      Comprobante: numeroComprobante(c.punto_venta, c.numero),
      'Tipo doc.': DOC_TIPOS[c.doc_tipo],
      'Nro. doc.': c.doc_nro,
      Cliente: c.doc_tipo === 99 ? 'Consumidor final' : c.receptor_nombre,
      'Condición IVA': CONDICIONES_RECEPTOR[c.receptor_condicion],
      Neto: s(c.cbte_tipo) * Number(c.neto),
      IVA: s(c.cbte_tipo) * Number(c.iva),
      Total: s(c.cbte_tipo) * Number(c.total),
      CAE: c.cae,
    })),
  )
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, 'Comprobantes')
  const archivo = XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  return new Response(new Uint8Array(archivo), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="comprobantes-${f.desde}-a-${f.hasta}.xlsx"`,
    },
  })
}
