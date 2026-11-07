import { randomInt } from 'node:crypto'
import type { Sql, TransactionSql } from 'postgres'
import { descifrar } from './certificado'
import { ID_ALICUOTA, cuitValido, importes, letraComprobante, tipoComprobante, TIPOS_CBTE, type CondicionEmisor } from './comprobantes'
import { autenticar, solicitarCAE, ultimoAutorizado, type Ambiente, type Auth } from './servicios'
import { ErrorArca } from './soap'

export class ErrorFactura extends Error {}

export type ModoFacturacion = 'desactivada' | 'simulacion' | 'homologacion' | 'produccion'

export type ConfigFiscal = {
  cuit: string | null
  razon_social: string | null
  condicion_iva: CondicionEmisor | null
  inicio_actividades: Date | null
  domicilio: string | null
  iibb: string | null
  modo: ModoFacturacion
  clave_privada: string | null
  pedido_certificado: string | null
  certificado: string | null
  certificado_vence: Date | null
  facturar_automatico: boolean
  identificar_desde: number
}

export async function leerConfig(sql: Sql | TransactionSql): Promise<ConfigFiscal> {
  const [c] = await sql<ConfigFiscal[]>`select * from config_fiscal where id = 1`
  return { ...c, identificar_desde: Number(c.identificar_desde) }
}

export type Receptor = { docTipo: number; docNro: string; nombre: string | null; condicionIva: number; domicilio?: string | null }
export const CONSUMIDOR_FINAL: Receptor = { docTipo: 99, docNro: '0', nombre: null, condicionIva: 5 }

/** Qué falta configurar para poder facturar (vacío = listo). */
export function faltantes(c: ConfigFiscal, puntoVenta: number | null): string[] {
  const f: string[] = []
  if (c.modo === 'desactivada') f.push('La facturación está desactivada')
  if (!c.cuit || !cuitValido(c.cuit)) f.push('CUIT del negocio')
  if (!c.razon_social) f.push('Razón social')
  if (!c.condicion_iva) f.push('Condición frente al IVA')
  if (!puntoVenta) f.push('Punto de venta de la sucursal')
  if ((c.modo === 'homologacion' || c.modo === 'produccion') && (!c.certificado || !c.clave_privada)) f.push('Certificado de ARCA')
  return f
}

function validarReceptor(r: Receptor, letra: 'A' | 'B' | 'C', total: number, identificarDesde: number) {
  if (!(r.condicionIva in { 1: 1, 4: 1, 5: 1, 6: 1, 13: 1, 15: 1, 16: 1 })) throw new ErrorFactura('Elegí la condición frente al IVA del cliente.')
  if (r.docTipo === 80 || r.docTipo === 86) {
    if (!cuitValido(r.docNro)) throw new ErrorFactura('El CUIT/CUIL del cliente no es válido.')
  } else if (r.docTipo === 96) {
    if (!/^\d{6,9}$/.test(r.docNro)) throw new ErrorFactura('El DNI del cliente no es válido.')
  } else if (r.docTipo !== 99) throw new ErrorFactura('Tipo de documento no válido.')
  if (letra === 'A' && r.docTipo !== 80) throw new ErrorFactura('Para Factura A hace falta el CUIT del cliente.')
  if (r.docTipo !== 99 && !r.nombre?.trim()) throw new ErrorFactura('Poné el nombre o razón social del cliente.')
  if (r.docTipo === 99 && r.condicionIva !== 5) throw new ErrorFactura('Si el cliente no se identifica, tiene que ser consumidor final.')
  if (r.docTipo === 99 && total >= identificarDesde)
    throw new ErrorFactura(`Desde $${identificarDesde.toLocaleString('es-AR')} hay que identificar al cliente con DNI o CUIT.`)
}

const fechaArca = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(d).replace(/-/g, '')
const deArca = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`

/** Token del WSAA guardado, o uno nuevo si venció. */
async function credenciales(sql: Sql, c: ConfigFiscal, amb: Ambiente): Promise<Auth> {
  const [g] = await sql<{ token: string; sign: string }[]>`
    select token, sign from arca_credenciales where ambiente = ${amb} and servicio = 'wsfe' and vence > now() + interval '5 minutes'`
  if (g) return { ...g, cuit: c.cuit!.replace(/\D/g, '') }
  const nueva = await autenticar(amb, c.certificado!, await descifrar(c.clave_privada!))
  await sql`
    insert into arca_credenciales (ambiente, servicio, token, sign, vence) values (${amb}, 'wsfe', ${nueva.token}, ${nueva.sign}, ${nueva.vence})
    on conflict (ambiente, servicio) do update set token = excluded.token, sign = excluded.sign, vence = excluded.vence`
  return { token: nueva.token, sign: nueva.sign, cuit: c.cuit!.replace(/\D/g, '') }
}

type Emision = {
  ventaId: number
  devolucionId?: number | null
  asociado?: { id: number; cbte_tipo: number; punto_venta: number; numero: number; fecha: Date } | null
  notaCredito: boolean
  total: number
  receptor: Receptor
  letra?: 'A' | 'B' | 'C'
  usuarioId: number
}

export type ComprobanteEmitido = { id: number; tipo: string; numero: number; puntoVenta: number; cae: string; simulado: boolean }

async function autorizar(sql: Sql, c: ConfigFiscal, e: Emision): Promise<ComprobanteEmitido> {
  const [suc] = await sql<{ punto_venta: number | null }[]>`
    select s.punto_venta from ventas v join sucursales s on s.id = v.sucursal_id where v.id = ${e.ventaId}`
  const falta = faltantes(c, suc?.punto_venta ?? null)
  if (falta.length) throw new ErrorFactura(`Falta configurar: ${falta.join(', ')}.`)
  const ptoVta = suc.punto_venta!
  const letra = e.letra ?? letraComprobante(c.condicion_iva!, e.receptor.condicionIva)
  validarReceptor(e.receptor, letra, e.total, e.notaCredito ? Infinity : c.identificar_desde)
  const cbteTipo = tipoComprobante(letra, e.notaCredito)
  const imp = importes(e.total, letra)
  const ambiente: 'simulacion' | Ambiente = c.modo === 'simulacion' ? 'simulacion' : (c.modo as Ambiente)
  const hoy = new Date()
  const base = {
    venta_id: e.ventaId,
    devolucion_id: e.devolucionId ?? null,
    asociado_id: e.asociado?.id ?? null,
    ambiente,
    cbte_tipo: cbteTipo,
    punto_venta: ptoVta,
    fecha: deArca(fechaArca(hoy)),
    emisor_cuit: c.cuit!.replace(/\D/g, ''),
    emisor_razon_social: c.razon_social!,
    emisor_condicion: c.condicion_iva!,
    doc_tipo: e.receptor.docTipo,
    doc_nro: e.receptor.docNro,
    receptor_nombre: e.receptor.nombre?.trim() || null,
    receptor_condicion: e.receptor.condicionIva,
    receptor_domicilio: e.receptor.domicilio?.trim() || null,
    total: imp.total,
    neto: imp.neto,
    iva: imp.iva,
    alicuota: imp.alicuota,
    usuario_id: e.usuarioId,
  }

  // Un solo comprobante a la vez por punto de venta y tipo, para que la numeración no se pise.
  const r = await sql.begin(async (tx): Promise<ComprobanteEmitido | { rechazo: Record<string, unknown>; mensaje: string | null }> => {
    await tx`select pg_advisory_xact_lock(4242, ${ptoVta * 100 + cbteTipo})`

    if (ambiente === 'simulacion') {
      const [{ ultimo }] = await tx<{ ultimo: number }[]>`
        select coalesce(max(numero), 0)::int as ultimo from comprobantes
        where ambiente = 'simulacion' and punto_venta = ${ptoVta} and cbte_tipo = ${cbteTipo} and estado = 'autorizado'`
      const cae = String(randomInt(10_000_000, 99_999_999)) + String(randomInt(100_000, 999_999))
      const vence = new Date(hoy.getTime() + 10 * 86400_000)
      const [r] = await tx<{ id: number }[]>`
        insert into comprobantes ${tx({ ...base, numero: ultimo + 1, estado: 'autorizado', cae, cae_vence: deArca(fechaArca(vence)), mensaje: 'Simulación: sin validez fiscal' })}
        returning id`
      return { id: r.id, tipo: TIPOS_CBTE[cbteTipo].nombre, numero: ultimo + 1, puntoVenta: ptoVta, cae, simulado: true }
    }

    const auth = await credenciales(sql, c, ambiente)
    const numero = (await ultimoAutorizado(ambiente, auth, ptoVta, cbteTipo)) + 1
    const resp = await solicitarCAE(ambiente, auth, {
      ptoVta,
      cbteTipo,
      numero,
      fecha: fechaArca(hoy),
      docTipo: e.receptor.docTipo,
      docNro: e.receptor.docNro,
      condicionIvaReceptor: e.receptor.condicionIva,
      total: imp.total,
      neto: imp.neto,
      iva: imp.iva,
      alicuotaId: imp.alicuota === null ? null : ID_ALICUOTA[imp.alicuota],
      asociado: e.asociado
        ? { tipo: e.asociado.cbte_tipo, ptoVta: e.asociado.punto_venta, numero: e.asociado.numero, cuit: base.emisor_cuit, fecha: fechaArca(e.asociado.fecha) }
        : null,
    })
    const mensaje = [resp.errores, ...resp.observaciones].filter(Boolean).join(' · ') || null
    if (!resp.aprobado) return { rechazo: { ...base, numero: null, estado: 'rechazado', mensaje: mensaje ?? 'Rechazado por ARCA', xml_pedido: resp.xmlPedido }, mensaje }
    const [r] = await tx<{ id: number }[]>`
      insert into comprobantes ${tx({ ...base, numero, estado: 'autorizado', cae: resp.cae, cae_vence: resp.vence ? deArca(resp.vence) : null, mensaje, xml_pedido: resp.xmlPedido })}
      returning id`
    return { id: r.id, tipo: TIPOS_CBTE[cbteTipo].nombre, numero, puntoVenta: ptoVta, cae: resp.cae!, simulado: false }
  })
  if ('rechazo' in r) {
    // El rechazo se guarda fuera de la transacción para que quede registrado.
    await sql`insert into comprobantes ${sql(r.rechazo)}`
    throw new ErrorFactura(`ARCA rechazó el comprobante: ${r.mensaje ?? 'sin detalle'}`)
  }
  return r
}

/** Factura de una venta (una sola por venta). */
export async function facturarVenta(sql: Sql, d: { ventaId: number; receptor: Receptor; usuarioId: number }): Promise<ComprobanteEmitido> {
  const [v] = await sql<{ total: number; estado: string }[]>`select total, estado from ventas where id = ${d.ventaId}`
  if (!v) throw new ErrorFactura('La venta no existe.')
  if (v.estado === 'anulada') throw new ErrorFactura('La venta está anulada.')
  const [ya] = await sql`select 1 from comprobantes where venta_id = ${d.ventaId} and estado = 'autorizado' and cbte_tipo in (1, 6, 11)`
  if (ya) throw new ErrorFactura('Esta venta ya tiene factura.')
  const c = await leerConfig(sql)
  try {
    return await autorizar(sql, c, { ventaId: d.ventaId, notaCredito: false, total: Number(v.total), receptor: d.receptor, usuarioId: d.usuarioId })
  } catch (e) {
    if (e instanceof ErrorArca) throw new ErrorFactura(e.message)
    throw e
  }
}

/** Factura autorizada de una venta, si tiene. */
export async function facturaDeVenta(sql: Sql | TransactionSql, ventaId: number) {
  const [f] = await sql<
    { id: number; cbte_tipo: number; punto_venta: number; numero: number; fecha: Date; doc_tipo: number; doc_nro: string; receptor_nombre: string | null; receptor_condicion: number; receptor_domicilio: string | null; total: number }[]
  >`
    select id, cbte_tipo, punto_venta, numero, fecha, doc_tipo, doc_nro, receptor_nombre, receptor_condicion, receptor_domicilio, total
    from comprobantes where venta_id = ${ventaId} and estado = 'autorizado' and cbte_tipo in (1, 6, 11)`
  return f ?? null
}

/** Nota de crédito asociada a la factura de la venta (por anulación o devolución). */
export async function notaDeCredito(sql: Sql, d: { ventaId: number; devolucionId?: number | null; total: number; usuarioId: number }): Promise<ComprobanteEmitido | null> {
  const f = await facturaDeVenta(sql, d.ventaId)
  if (!f) return null // la venta no se facturó: no hace falta nota de crédito
  const [{ acreditado }] = await sql<{ acreditado: number }[]>`
    select coalesce(sum(total), 0) as acreditado from comprobantes where asociado_id = ${f.id} and estado = 'autorizado'`
  if (Math.round((Number(acreditado) + d.total) * 100) > Math.round(Number(f.total) * 100))
    throw new ErrorFactura('La nota de crédito supera lo que queda de la factura.')
  const c = await leerConfig(sql)
  try {
    return await autorizar(sql, c, {
      ventaId: d.ventaId,
      devolucionId: d.devolucionId,
      asociado: f,
      notaCredito: true,
      total: d.total,
      letra: TIPOS_CBTE[f.cbte_tipo].letra,
      receptor: { docTipo: f.doc_tipo, docNro: f.doc_nro, nombre: f.receptor_nombre, condicionIva: f.receptor_condicion, domicilio: f.receptor_domicilio },
      usuarioId: d.usuarioId,
    })
  } catch (e) {
    if (e instanceof ErrorArca) throw new ErrorFactura(e.message)
    throw e
  }
}

export async function guardarCliente(sql: Sql, r: Receptor) {
  if (r.docTipo === 99 || !r.nombre?.trim()) return
  await sql`
    insert into clientes (doc_tipo, doc_nro, nombre, condicion_iva, domicilio)
    values (${r.docTipo}, ${r.docNro}, ${r.nombre.trim()}, ${r.condicionIva}, ${r.domicilio?.trim() || null})
    on conflict (doc_tipo, doc_nro) do update set nombre = excluded.nombre, condicion_iva = excluded.condicion_iva,
      domicilio = coalesce(excluded.domicilio, clientes.domicilio)`
}
