import http from 'node:http'
import type { AddressInfo } from 'node:net'
import forge from 'node-forge'
import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { migrar } from '../scripts/migrate'
import { cifrar, descifrar, generarClaveYPedido, leerCertificado } from '../src/lib/arca/certificado'
import { cuitValido, importes, letraComprobante, numeroComprobante, tipoComprobante, urlQR } from '../src/lib/arca/comprobantes'
import { CONSUMIDOR_FINAL, ErrorFactura, facturarVenta, notaDeCredito } from '../src/lib/arca/facturacion'
import { leerXml } from '../src/lib/arca/soap'
import { abrirCaja, anularVenta, registrarDevolucion, registrarVenta, resumenCaja } from '../src/lib/ventas'

process.env.SESSION_SECRET ??= 'x'.repeat(40)

describe('reglas de comprobantes', () => {
  it('elige la letra según emisor y receptor', () => {
    expect(letraComprobante('MT', 1)).toBe('C')
    expect(letraComprobante('RI', 1)).toBe('A')
    expect(letraComprobante('RI', 5)).toBe('B')
    expect(letraComprobante('RI', 6)).toBe('B')
    expect(tipoComprobante('B', false)).toBe(6)
    expect(tipoComprobante('B', true)).toBe(8)
    expect(tipoComprobante('C', true)).toBe(13)
  })
  it('separa el IVA del total en A y B, y no en C', () => {
    expect(importes(12100, 'B')).toEqual({ total: 12100, neto: 10000, iva: 2100, alicuota: 21 })
    expect(importes(100, 'A')).toEqual({ total: 100, neto: 82.64, iva: 17.36, alicuota: 21 })
    expect(importes(5000, 'C')).toEqual({ total: 5000, neto: 5000, iva: 0, alicuota: null })
  })
  it('valida CUIT y arma número y QR', () => {
    expect(cuitValido('20-12345678-6')).toBe(true)
    expect(cuitValido('20-12345678-5')).toBe(false)
    expect(numeroComprobante(3, 12)).toBe('00003-00000012')
    const url = urlQR({ fecha: '2026-10-31', cuit: 20123456786, ptoVta: 3, tipoCmp: 6, nroCmp: 12, importe: 12100, tipoDocRec: 99, nroDocRec: 0, cae: '76123456789012' })
    const json = JSON.parse(Buffer.from(url.split('?p=')[1], 'base64').toString())
    expect(json).toMatchObject({ ver: 1, cuit: 20123456786, tipoCmp: 6, moneda: 'PES', tipoCodAut: 'E', codAut: 76123456789012 })
  })
  it('genera clave y pedido de certificado, y guarda la clave cifrada', async () => {
    const { clavePem, csrPem } = generarClaveYPedido({ cuit: '20123456786', razonSocial: 'Belen SRL', alias: 'stock' })
    expect(csrPem).toContain('BEGIN CERTIFICATE REQUEST')
    const csr = forge.pki.certificationRequestFromPem(csrPem)
    expect(csr.verify()).toBe(true)
    expect(csr.subject.attributes.find((a) => a.type === '2.5.4.5')?.value).toBe('CUIT 20123456786')
    const guardada = await cifrar(clavePem)
    expect(guardada).not.toContain('PRIVATE KEY')
    expect(await descifrar(guardada)).toBe(clavePem)
  })
})

/** Certificado autofirmado para la clave (en ARCA lo firma su autoridad). */
function certificadoPara(clavePem: string) {
  const key = forge.pki.privateKeyFromPem(clavePem) as forge.pki.rsa.PrivateKey
  const cert = forge.pki.createCertificate()
  cert.publicKey = forge.pki.setRsaPublicKey(key.n, key.e)
  cert.serialNumber = '01'
  cert.validity.notBefore = new Date()
  cert.validity.notAfter = new Date(Date.now() + 365 * 86400e3)
  cert.setSubject([{ name: 'commonName', value: 'stock' }, { type: '2.5.4.5', value: 'CUIT 20123456786' }])
  cert.setIssuer([{ name: 'commonName', value: 'Computadores Test' }])
  cert.sign(key, forge.md.sha256.create())
  return forge.pki.certificateToPem(cert)
}

const url = process.env.TEST_DATABASE_URL

describe.skipIf(!url)('facturación', () => {
  const sql = postgres(url!, { prepare: false, max: 3, onnotice: () => {}, types: { numeric: { to: 1700, from: [1700], serialize: String, parse: Number } } })
  let suc: number, vend: { id: number; rol: 'vendedora' }, admin: { id: number; rol: 'admin' }, remera: number
  // Servidor que imita a ARCA (WSAA + WSFEv1).
  const pedidos: { accion: string; cuerpo: Record<string, unknown> }[] = []
  let rechazar = false
  let ultimo = 41
  let loginCount = 0
  const fake = http.createServer((req, res) => {
    let b = ''
    req.on('data', (c) => (b += c))
    req.on('end', () => {
      const accion = String(req.headers.soapaction ?? '')
      const cuerpo = (leerXml(b).Envelope as { Body: Record<string, unknown> }).Body
      pedidos.push({ accion, cuerpo })
      let r = ''
      if (req.url!.includes('LoginCms')) {
        loginCount++
        const t = `<loginTicketResponse><header><expirationTime>${new Date(Date.now() + 12 * 3600e3).toISOString()}</expirationTime></header><credentials><token>TOKEN</token><sign>SIGN</sign></credentials></loginTicketResponse>`
        r = `<loginCmsResponse><loginCmsReturn>${t.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</loginCmsReturn></loginCmsResponse>`
      } else if (accion.endsWith('FECompUltimoAutorizado')) {
        r = `<FECompUltimoAutorizadoResponse><FECompUltimoAutorizadoResult><PtoVta>3</PtoVta><CbteTipo>6</CbteTipo><CbteNro>${ultimo}</CbteNro></FECompUltimoAutorizadoResult></FECompUltimoAutorizadoResponse>`
      } else if (accion.endsWith('FECAESolicitar')) {
        const det = (cuerpo.FECAESolicitar as { FeCAEReq: { FeDetReq: { FECAEDetRequest: { CbteDesde: string } } } }).FeCAEReq.FeDetReq.FECAEDetRequest
        if (!rechazar) ultimo = Number(det.CbteDesde)
        r = rechazar
          ? `<FECAESolicitarResponse><FECAESolicitarResult><FeDetResp><FECAEDetResponse><Resultado>R</Resultado><Observaciones><Obs><Code>10015</Code><Msg>DocNro invalido</Msg></Obs></Observaciones></FECAEDetResponse></FeDetResp></FECAESolicitarResult></FECAESolicitarResponse>`
          : `<FECAESolicitarResponse><FECAESolicitarResult><FeDetResp><FECAEDetResponse><Resultado>A</Resultado><CAE>76123456789012</CAE><CAEFchVto>20261110</CAEFchVto></FECAEDetResponse></FeDetResp></FECAESolicitarResult></FECAESolicitarResponse>`
      }
      res.writeHead(200, { 'Content-Type': 'text/xml' })
      res.end(`<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>${r}</soap:Body></soap:Envelope>`)
    })
  })

  beforeAll(async () => {
    await new Promise<void>((r) => fake.listen(0, '127.0.0.1', r))
    const port = (fake.address() as AddressInfo).port
    process.env.ARCA_URL_WSAA = `http://127.0.0.1:${port}/LoginCms`
    process.env.ARCA_URL_WSFE = `http://127.0.0.1:${port}/wsfe`
    await sql.unsafe('drop schema public cascade; create schema public;')
    await migrar(url!, () => {})
  })
  afterAll(async () => {
    fake.close()
    await sql.end()
  })
  beforeEach(async () => {
    await sql`truncate comprobantes, devolucion_items, devoluciones, arca_credenciales, clientes, venta_pagos, venta_items, ventas, movimientos_caja, cajas, movimientos_stock, stock, productos, usuarios, depositos, sucursales restart identity cascade`
    await sql`update config_fiscal set cuit = '20123456786', razon_social = 'Belen SRL', condicion_iva = 'RI', modo = 'simulacion', certificado = null, clave_privada = null, identificar_desde = 10000000`
    ;[{ id: suc }] = await sql`insert into sucursales (nombre, punto_venta) values ('Centro', 3) returning id`
    await sql`insert into depositos (nombre, sucursal_id, es_principal) values ('Local', ${suc}, true)`
    const [v] = await sql`insert into usuarios (usuario, nombre, password_hash, rol, sucursal_id) values ('sofia', 'Sofía', 'x', 'vendedora', ${suc}) returning id`
    const [a] = await sql`insert into usuarios (usuario, nombre, password_hash, rol) values ('belen', 'Belen', 'x', 'admin') returning id`
    vend = { id: v.id, rol: 'vendedora' }
    admin = { id: a.id, rol: 'admin' }
    ;[{ id: remera }] = await sql`insert into productos (codigo, nombre, precio) values ('R1', 'Remera', 12100) returning id`
    await abrirCaja(sql, { usuarioId: vend.id, sucursalId: suc, montoInicial: 0 })
    pedidos.length = 0
    rechazar = false
    ultimo = 41
    loginCount = 0
  })

  const vender = (cant = 1) =>
    registrarVenta(sql, { usuario: vend, items: [{ productoId: remera, cantidad: cant, descuentoPct: 0 }], descuentoGlobalPct: 0, pagos: [{ medio: 'efectivo', monto: 12100 * cant }], totalEsperado: 12100 * cant })

  it('en simulación numera correlativo por punto de venta y tipo', async () => {
    const a = await facturarVenta(sql, { ventaId: (await vender()).ventaId, receptor: CONSUMIDOR_FINAL, usuarioId: vend.id })
    const b = await facturarVenta(sql, { ventaId: (await vender()).ventaId, receptor: CONSUMIDOR_FINAL, usuarioId: vend.id })
    expect([a.tipo, a.numero, b.numero, a.simulado]).toEqual(['Factura B', 1, 2, true])
    const [c] = await sql`select neto, iva, total from comprobantes where id = ${a.id}`
    expect(c).toEqual({ neto: 10000, iva: 2100, total: 12100 })
  })

  it('no factura dos veces la misma venta y valida al cliente', async () => {
    const { ventaId } = await vender()
    await expect(facturarVenta(sql, { ventaId, receptor: { docTipo: 80, docNro: '20123456785', nombre: 'X', condicionIva: 1 }, usuarioId: vend.id })).rejects.toThrow('CUIT')
    await expect(facturarVenta(sql, { ventaId, receptor: { docTipo: 96, docNro: '30111222', nombre: 'Ana', condicionIva: 1 }, usuarioId: vend.id })).rejects.toThrow('Factura A')
    await facturarVenta(sql, { ventaId, receptor: { docTipo: 80, docNro: '20123456786', nombre: 'Cliente SA', condicionIva: 1 }, usuarioId: vend.id })
    await expect(facturarVenta(sql, { ventaId, receptor: CONSUMIDOR_FINAL, usuarioId: vend.id })).rejects.toThrow('ya tiene factura')
  })

  it('exige identificar al consumidor final desde el monto configurado', async () => {
    await sql`update config_fiscal set identificar_desde = 20000`
    const { ventaId } = await vender(2)
    await expect(facturarVenta(sql, { ventaId, receptor: CONSUMIDOR_FINAL, usuarioId: vend.id })).rejects.toThrow('identificar al cliente')
    const f = await facturarVenta(sql, { ventaId, receptor: { docTipo: 96, docNro: '30111222', nombre: 'Ana Pérez', condicionIva: 5 }, usuarioId: vend.id })
    expect(f.tipo).toBe('Factura B')
  })

  it('el monotributo emite C y la devolución hace nota de crédito parcial', async () => {
    await sql`update config_fiscal set condicion_iva = 'MT'`
    const { ventaId } = await vender(2)
    const f = await facturarVenta(sql, { ventaId, receptor: CONSUMIDOR_FINAL, usuarioId: vend.id })
    expect(f.tipo).toBe('Factura C')
    const [item] = await sql`select id from venta_items where venta_id = ${ventaId}`
    const dev = await registrarDevolucion(sql, { ventaId, usuario: vend, items: [{ ventaItemId: item.id, cantidad: 1 }], medio: 'efectivo', motivo: 'No le quedó' })
    expect(dev.total).toBe(12100)
    const nc = await notaDeCredito(sql, { ventaId, devolucionId: dev.devolucionId, total: dev.total, usuarioId: vend.id })
    expect(nc?.tipo).toBe('Nota de crédito C')
    await expect(notaDeCredito(sql, { ventaId, total: 12100.01, usuarioId: vend.id })).rejects.toThrow('supera')
    const caja = (await sql`select id from cajas where usuario_id = ${vend.id}`)[0].id
    const r = await resumenCaja(sql, caja)
    expect(r).toMatchObject({ total: 12100, devoluciones: 12100, efectivoEsperado: 12100 })
    await expect(registrarDevolucion(sql, { ventaId, usuario: vend, items: [{ ventaItemId: item.id, cantidad: 2 }], medio: 'efectivo', motivo: 'x' })).rejects.toThrow('como mucho 1')
    await expect(anularVenta(sql, { ventaId, usuarioId: admin.id, motivo: 'x' })).rejects.toThrow('devoluciones')
  })

  it('con ARCA: autentica una vez, pide el número siguiente y guarda el CAE', async () => {
    const { clavePem } = generarClaveYPedido({ cuit: '20123456786', razonSocial: 'Belen SRL', alias: 'stock' })
    const cert = certificadoPara(clavePem)
    expect(leerCertificado(cert, clavePem).cuit).toBe('20123456786')
    await sql`update config_fiscal set modo = 'homologacion', certificado = ${cert}, clave_privada = ${await cifrar(clavePem)}`

    const a = await facturarVenta(sql, { ventaId: (await vender()).ventaId, receptor: CONSUMIDOR_FINAL, usuarioId: vend.id })
    const b = await facturarVenta(sql, { ventaId: (await vender()).ventaId, receptor: CONSUMIDOR_FINAL, usuarioId: vend.id })
    expect([a.numero, b.numero, a.cae, a.simulado]).toEqual([42, 43, '76123456789012', false])
    expect(loginCount).toBe(1) // el token se reusa

    const pedido = pedidos.find((p) => p.accion.endsWith('FECAESolicitar'))!.cuerpo.FECAESolicitar as {
      Auth: Record<string, string>
      FeCAEReq: { FeCabReq: Record<string, string>; FeDetReq: { FECAEDetRequest: Record<string, unknown> } }
    }
    expect(pedido.Auth).toEqual({ Token: 'TOKEN', Sign: 'SIGN', Cuit: '20123456786' })
    expect(pedido.FeCAEReq.FeCabReq).toEqual({ CantReg: '1', PtoVta: '3', CbteTipo: '6' })
    expect(pedido.FeCAEReq.FeDetReq.FECAEDetRequest).toMatchObject({
      Concepto: '1',
      DocTipo: '99',
      DocNro: '0',
      ImpTotal: '12100.00',
      ImpNeto: '10000.00',
      ImpIVA: '2100.00',
      MonId: 'PES',
      CondicionIVAReceptorId: '5',
      Iva: { AlicIva: { Id: '5', BaseImp: '10000.00', Importe: '2100.00' } },
    })
    const [{ cae_vence }] = await sql`select cae_vence::text from comprobantes where id = ${a.id}`
    expect(cae_vence).toBe('2026-11-10')
  })

  it('si ARCA rechaza, avisa y deja registrado el rechazo', async () => {
    const { clavePem } = generarClaveYPedido({ cuit: '20123456786', razonSocial: 'Belen SRL', alias: 'stock' })
    await sql`update config_fiscal set modo = 'homologacion', certificado = ${certificadoPara(clavePem)}, clave_privada = ${await cifrar(clavePem)}`
    rechazar = true
    const { ventaId } = await vender()
    await expect(facturarVenta(sql, { ventaId, receptor: CONSUMIDOR_FINAL, usuarioId: vend.id })).rejects.toBeInstanceOf(ErrorFactura)
    const [c] = await sql`select estado, mensaje from comprobantes where venta_id = ${ventaId}`
    expect(c).toEqual({ estado: 'rechazado', mensaje: '10015: DocNro invalido' })
  })
})
