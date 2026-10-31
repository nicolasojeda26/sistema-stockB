// Cliente de los web services de ARCA: WSAA (autenticación) y WSFEv1 (factura electrónica).
import { firmarCMS } from './certificado'
import { ErrorArca, escapar, leerXml, lista, postSoap } from './soap'

export type Ambiente = 'homologacion' | 'produccion'

export const URLS: Record<Ambiente, { wsaa: string; wsfe: string }> = {
  homologacion: {
    wsaa: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',
    wsfe: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
  },
  produccion: {
    wsaa: 'https://wsaa.afip.gov.ar/ws/services/LoginCms',
    wsfe: 'https://servicios1.afip.gov.ar/wsfev1/service.asmx',
  },
}

// Permite apuntar a un servidor de prueba local en los tests.
const url = (amb: Ambiente, s: 'wsaa' | 'wsfe') => process.env[`ARCA_URL_${s.toUpperCase()}`] || URLS[amb][s]

/** Hora con el huso de Argentina, como la espera el WSAA. */
function isoAR(d: Date): string {
  const ar = new Date(d.getTime() - 3 * 3600_000)
  return ar.toISOString().replace(/\.\d{3}Z$/, '-03:00')
}

export function pedidoAcceso(servicio: string, ahora = new Date()): string {
  return `<?xml version="1.0" encoding="UTF-8"?><loginTicketRequest version="1.0"><header><uniqueId>${Math.floor(ahora.getTime() / 1000)}</uniqueId><generationTime>${isoAR(new Date(ahora.getTime() - 10 * 60_000))}</generationTime><expirationTime>${isoAR(new Date(ahora.getTime() + 10 * 60_000))}</expirationTime></header><service>${servicio}</service></loginTicketRequest>`
}

export type Credenciales = { token: string; sign: string; vence: Date }

/** Pide token y firma al WSAA (valen unas 12 horas: hay que guardarlos y reusarlos). */
export async function autenticar(amb: Ambiente, certPem: string, clavePem: string, servicio = 'wsfe'): Promise<Credenciales> {
  const cms = firmarCMS(pedidoAcceso(servicio), certPem, clavePem)
  const cuerpo = `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov"><soapenv:Header/><soapenv:Body><wsaa:loginCms><wsaa:in0>${cms}</wsaa:in0></wsaa:loginCms></soapenv:Body></soapenv:Envelope>`
  let resp: Record<string, unknown>
  try {
    resp = await postSoap(url(amb, 'wsaa'), '', cuerpo)
  } catch (e) {
    if (e instanceof ErrorArca && /alreadyAuthenticated/i.test(`${e.codigo} ${e.message}`))
      throw new ErrorArca('ARCA dice que ya hay un acceso vigente para este certificado. Esperá unos minutos o usá el guardado.', 'alreadyAuthenticated')
    if (e instanceof ErrorArca && /cert\.untrusted|cms\.cert/i.test(`${e.codigo} ${e.message}`))
      throw new ErrorArca('ARCA no reconoce el certificado: revisá que sea del ambiente correcto (homologación o producción) y que esté vigente.', e.codigo)
    throw e
  }
  const ret = (resp.loginCmsResponse as Record<string, unknown> | undefined)?.loginCmsReturn
  if (typeof ret !== 'string') throw new ErrorArca('Respuesta inesperada del WSAA.')
  const ticket = leerXml(ret).loginTicketResponse as { header: { expirationTime: string }; credentials: { token: string; sign: string } }
  return { token: ticket.credentials.token, sign: ticket.credentials.sign, vence: new Date(ticket.header.expirationTime) }
}

export type Auth = { token: string; sign: string; cuit: string }

const sobreWsfe = (metodo: string, interior: string) =>
  `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/"><soap:Body><ar:${metodo}>${interior}</ar:${metodo}></soap:Body></soap:Envelope>`

const auth = (a: Auth) => `<ar:Auth><ar:Token>${escapar(a.token)}</ar:Token><ar:Sign>${escapar(a.sign)}</ar:Sign><ar:Cuit>${a.cuit}</ar:Cuit></ar:Auth>`

type ErrWs = { Code: string; Msg: string }
function erroresWs(r: Record<string, unknown> | undefined): string | null {
  const errs = lista((r?.Errors as { Err?: ErrWs | ErrWs[] } | undefined)?.Err)
  return errs.length ? errs.map((e) => `${e.Code}: ${e.Msg}`).join(' · ') : null
}

export async function estadoServidor(amb: Ambiente): Promise<{ app: string; db: string; auth: string }> {
  const r = await postSoap(url(amb, 'wsfe'), 'http://ar.gov.afip.dif.FEV1/FEDummy', sobreWsfe('FEDummy', ''))
  const d = (r.FEDummyResponse as { FEDummyResult: { AppServer: string; DbServer: string; AuthServer: string } }).FEDummyResult
  return { app: d.AppServer, db: d.DbServer, auth: d.AuthServer }
}

export async function ultimoAutorizado(amb: Ambiente, a: Auth, ptoVta: number, cbteTipo: number): Promise<number> {
  const r = await postSoap(
    url(amb, 'wsfe'),
    'http://ar.gov.afip.dif.FEV1/FECompUltimoAutorizado',
    sobreWsfe('FECompUltimoAutorizado', `${auth(a)}<ar:PtoVta>${ptoVta}</ar:PtoVta><ar:CbteTipo>${cbteTipo}</ar:CbteTipo>`),
  )
  const res = (r.FECompUltimoAutorizadoResponse as Record<string, unknown>).FECompUltimoAutorizadoResult as Record<string, unknown>
  const err = erroresWs(res)
  if (err) throw new ErrorArca(`ARCA: ${err}`)
  return Number(res.CbteNro)
}

export type PedidoCAE = {
  ptoVta: number
  cbteTipo: number
  numero: number
  fecha: string // AAAAMMDD
  docTipo: number
  docNro: string
  condicionIvaReceptor: number
  total: number
  neto: number
  iva: number
  alicuotaId: number | null
  asociado?: { tipo: number; ptoVta: number; numero: number; cuit: string; fecha: string } | null
}

export type RespuestaCAE = {
  aprobado: boolean
  cae: string | null
  vence: string | null // AAAAMMDD
  observaciones: string[]
  errores: string | null
  xmlPedido: string
}

const m = (n: number) => n.toFixed(2)

export function xmlPedidoCAE(a: Auth, p: PedidoCAE): string {
  const asoc = p.asociado
    ? `<ar:CbtesAsoc><ar:CbteAsoc><ar:Tipo>${p.asociado.tipo}</ar:Tipo><ar:PtoVta>${p.asociado.ptoVta}</ar:PtoVta><ar:Nro>${p.asociado.numero}</ar:Nro><ar:Cuit>${p.asociado.cuit}</ar:Cuit><ar:CbteFch>${p.asociado.fecha}</ar:CbteFch></ar:CbteAsoc></ar:CbtesAsoc>`
    : ''
  const iva =
    p.alicuotaId !== null
      ? `<ar:Iva><ar:AlicIva><ar:Id>${p.alicuotaId}</ar:Id><ar:BaseImp>${m(p.neto)}</ar:BaseImp><ar:Importe>${m(p.iva)}</ar:Importe></ar:AlicIva></ar:Iva>`
      : ''
  // El orden de los campos es el del WSDL.
  const det =
    `<ar:Concepto>1</ar:Concepto><ar:DocTipo>${p.docTipo}</ar:DocTipo><ar:DocNro>${escapar(p.docNro)}</ar:DocNro>` +
    `<ar:CbteDesde>${p.numero}</ar:CbteDesde><ar:CbteHasta>${p.numero}</ar:CbteHasta><ar:CbteFch>${p.fecha}</ar:CbteFch>` +
    `<ar:ImpTotal>${m(p.total)}</ar:ImpTotal><ar:ImpTotConc>0.00</ar:ImpTotConc><ar:ImpNeto>${m(p.neto)}</ar:ImpNeto>` +
    `<ar:ImpOpEx>0.00</ar:ImpOpEx><ar:ImpTrib>0.00</ar:ImpTrib><ar:ImpIVA>${m(p.iva)}</ar:ImpIVA>` +
    `<ar:MonId>PES</ar:MonId><ar:MonCotiz>1</ar:MonCotiz><ar:CondicionIVAReceptorId>${p.condicionIvaReceptor}</ar:CondicionIVAReceptorId>` +
    asoc +
    iva
  return sobreWsfe(
    'FECAESolicitar',
    `${auth(a)}<ar:FeCAEReq><ar:FeCabReq><ar:CantReg>1</ar:CantReg><ar:PtoVta>${p.ptoVta}</ar:PtoVta><ar:CbteTipo>${p.cbteTipo}</ar:CbteTipo></ar:FeCabReq><ar:FeDetReq><ar:FECAEDetRequest>${det}</ar:FECAEDetRequest></ar:FeDetReq></ar:FeCAEReq>`,
  )
}

export async function solicitarCAE(amb: Ambiente, a: Auth, p: PedidoCAE): Promise<RespuestaCAE> {
  const xmlPedido = xmlPedidoCAE(a, p)
  const r = await postSoap(url(amb, 'wsfe'), 'http://ar.gov.afip.dif.FEV1/FECAESolicitar', xmlPedido)
  const res = (r.FECAESolicitarResponse as Record<string, unknown>).FECAESolicitarResult as Record<string, unknown>
  const det = lista((res.FeDetResp as { FECAEDetResponse?: unknown } | undefined)?.FECAEDetResponse)[0] as
    | { Resultado?: string; CAE?: string; CAEFchVto?: string; Observaciones?: { Obs?: ErrWs | ErrWs[] } }
    | undefined
  const obs = lista(det?.Observaciones?.Obs).map((o) => `${o.Code}: ${o.Msg}`)
  return {
    aprobado: det?.Resultado === 'A' && !!det.CAE,
    cae: det?.CAE || null,
    vence: det?.CAEFchVto || null,
    observaciones: obs,
    errores: erroresWs(res),
    xmlPedido,
  }
}
