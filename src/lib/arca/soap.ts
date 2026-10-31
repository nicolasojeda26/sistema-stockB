import https from 'node:https'
import http from 'node:http'
import { XMLParser } from 'fast-xml-parser'

export class ErrorArca extends Error {
  constructor(
    message: string,
    public codigo?: string,
  ) {
    super(message)
  }
}

const parser = new XMLParser({ removeNSPrefix: true, ignoreAttributes: true, parseTagValue: false, trimValues: true })
export const leerXml = (xml: string) => parser.parse(xml) as Record<string, unknown>

export const escapar = (s: string | number) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * POST SOAP. Los servidores de ARCA usan claves DH viejas: se baja el nivel de
 * seguridad de OpenSSL solo para estas conexiones, como hacen las librerías conocidas.
 */
export function postSoap(url: string, accion: string, cuerpo: string, timeoutMs = 30000): Promise<Record<string, unknown>> {
  const u = new URL(url)
  const mod = u.protocol === 'http:' ? http : https
  return new Promise((resolve, reject) => {
    const req = mod.request(
      u,
      {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: accion },
        timeout: timeoutMs,
        ...(u.protocol === 'https:' ? { ciphers: 'DEFAULT@SECLEVEL=1' } : {}),
      },
      (res) => {
        let datos = ''
        res.setEncoding('utf8')
        res.on('data', (c) => (datos += c))
        res.on('end', () => {
          let xml: Record<string, unknown>
          try {
            xml = leerXml(datos)
          } catch {
            return reject(new ErrorArca(`Respuesta ilegible de ARCA (HTTP ${res.statusCode}).`))
          }
          const cuerpoResp = (xml.Envelope as Record<string, unknown> | undefined)?.Body as Record<string, unknown> | undefined
          const falla = cuerpoResp?.Fault as { faultcode?: string; faultstring?: string } | undefined
          if (falla) return reject(new ErrorArca(String(falla.faultstring ?? 'Error de ARCA'), String(falla.faultcode ?? '')))
          if (!cuerpoResp) return reject(new ErrorArca(`ARCA respondió HTTP ${res.statusCode} sin contenido.`))
          resolve(cuerpoResp)
        })
      },
    )
    req.on('timeout', () => req.destroy(new ErrorArca('ARCA no respondió a tiempo. Probá de nuevo en unos minutos.')))
    req.on('error', (e) => reject(e instanceof ErrorArca ? e : new ErrorArca(`No se pudo conectar con ARCA: ${e.message}`)))
    req.end(cuerpo)
  })
}

export const lista = <T>(v: T | T[] | undefined | null): T[] => (v === undefined || v === null || v === '' ? [] : Array.isArray(v) ? v : [v])
