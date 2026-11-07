import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import forge from 'node-forge'
import { secreto } from '../secretos'

/**
 * Genera la clave privada y el pedido de certificado (CSR) que se sube a ARCA
 * ("Administración de certificados digitales" o WSASS en homologación).
 */
export function generarClaveYPedido(d: { cuit: string; razonSocial: string; alias: string }): { clavePem: string; csrPem: string } {
  const claves = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 })
  const csr = forge.pki.createCertificationRequest()
  csr.publicKey = claves.publicKey
  csr.setSubject([
    { name: 'countryName', value: 'AR' },
    { name: 'organizationName', value: d.razonSocial.slice(0, 64) },
    { name: 'commonName', value: d.alias.slice(0, 64) },
    { type: '2.5.4.5', value: `CUIT ${d.cuit.replace(/\D/g, '')}` }, // serialNumber
  ])
  csr.sign(claves.privateKey, forge.md.sha256.create())
  return { clavePem: forge.pki.privateKeyToPem(claves.privateKey), csrPem: forge.pki.certificationRequestToPem(csr) }
}

export type InfoCertificado = { sujeto: string; emisor: string; desde: Date; hasta: Date; cuit: string | null }

/** Lee un certificado .crt (PEM) y comprueba que corresponda a la clave. */
export function leerCertificado(certPem: string, clavePem?: string): InfoCertificado {
  let cert: forge.pki.Certificate
  try {
    cert = forge.pki.certificateFromPem(certPem)
  } catch {
    throw new Error('El archivo no es un certificado válido (tiene que ser el .crt que da ARCA).')
  }
  if (clavePem) {
    const clave = forge.pki.privateKeyFromPem(clavePem) as forge.pki.rsa.PrivateKey
    const pub = cert.publicKey as forge.pki.rsa.PublicKey
    if (pub.n.compareTo(clave.n) !== 0) throw new Error('El certificado no corresponde a la clave generada en el sistema.')
  }
  const attr = (campos: forge.pki.CertificateField[], n: string) => campos.find((a) => a.shortName === n || a.name === n)?.value as string | undefined
  const serie = cert.subject.attributes.find((a) => a.type === '2.5.4.5')?.value as string | undefined
  return {
    sujeto: attr(cert.subject.attributes, 'CN') ?? '',
    emisor: attr(cert.issuer.attributes, 'CN') ?? attr(cert.issuer.attributes, 'O') ?? '',
    desde: cert.validity.notBefore,
    hasta: cert.validity.notAfter,
    cuit: serie?.match(/\d{11}/)?.[0] ?? null,
  }
}

/** Firma el pedido de acceso (TRA) en formato CMS, como pide el WSAA. */
export function firmarCMS(contenido: string, certPem: string, clavePem: string): string {
  const p7 = forge.pkcs7.createSignedData()
  p7.content = forge.util.createBuffer(contenido, 'utf8')
  const cert = forge.pki.certificateFromPem(certPem)
  p7.addCertificate(cert)
  p7.addSigner({
    key: forge.pki.privateKeyFromPem(clavePem),
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() as unknown as string },
    ],
  })
  p7.sign()
  return forge.util.encode64(forge.asn1.toDer(p7.toAsn1()).getBytes())
}

// La clave privada se guarda cifrada en la base (AES-256-GCM).
async function claveCifrado(): Promise<Buffer> {
  // Compatibilidad: antes, sin CLAVE_CIFRADO se usaba SESSION_SECRET.
  const s = process.env.CLAVE_CIFRADO || process.env.SESSION_SECRET || (await secreto('cifrado'))
  if (s.length < 32) throw new Error('CLAVE_CIFRADO debe tener al menos 32 caracteres.')
  return scryptSync(s, 'arca-clave-privada', 32)
}

export async function cifrar(texto: string): Promise<string> {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', await claveCifrado(), iv)
  const datos = Buffer.concat([c.update(texto, 'utf8'), c.final()])
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), datos.toString('base64')].join('.')
}

export async function descifrar(guardado: string): Promise<string> {
  const [v, iv, tag, datos] = guardado.split('.')
  if (v !== 'v1') throw new Error('Formato de clave desconocido.')
  const d = createDecipheriv('aes-256-gcm', await claveCifrado(), Buffer.from(iv, 'base64'))
  d.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([d.update(Buffer.from(datos, 'base64')), d.final()]).toString('utf8')
}
