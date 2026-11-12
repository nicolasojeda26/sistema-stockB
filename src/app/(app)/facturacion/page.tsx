import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { requerirPermiso } from '@/lib/dal'
import { leerConfig } from '@/lib/arca/facturacion'
import { leerCertificado } from '@/lib/arca/certificado'
import { formatoFecha } from '@/lib/formato'
import { Aviso, Encabezado, Tarjeta, TituloTarjeta } from '@/components/ui'
import { Certificado, FormDatos, FormModo, FormPuntos } from './formularios'

export const metadata: Metadata = { title: 'Facturación' }

const MODOS = {
  desactivada: { tono: 'alerta', texto: 'La facturación está desactivada: las ventas salen solo con ticket.' },
  simulacion: { tono: 'alerta', texto: 'Modo simulación: los comprobantes son de prueba, sin validez fiscal. Sirve para practicar.' },
  homologacion: { tono: 'info', texto: 'Homologación: se factura contra el ambiente de pruebas de ARCA. Los comprobantes no tienen validez fiscal.' },
  produccion: { tono: 'ok', texto: 'Producción: las facturas se autorizan en ARCA y tienen validez fiscal.' },
} as const

export default async function FacturacionPage() {
  await requerirPermiso('facturacion')
  const [c, sucursales] = await Promise.all([
    leerConfig(db()),
    db()<{ id: number; nombre: string; punto_venta: number | null }[]>`select id, nombre, punto_venta from sucursales where activa order by nombre`,
  ])
  let cert: { sujeto: string; emisor: string; hasta: string } | null = null
  if (c.certificado) {
    try {
      const i = leerCertificado(c.certificado)
      cert = { sujeto: i.sujeto, emisor: i.emisor, hasta: formatoFecha(i.hasta) }
    } catch {}
  }
  const modo = MODOS[c.modo]

  return (
    <>
      <Encabezado titulo="Facturación electrónica" detalle="Datos del negocio y conexión con ARCA para emitir facturas y notas de crédito." />
      <div className="mb-5">
        <Aviso tipo={modo.tono}>{modo.texto}</Aviso>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="min-w-0 space-y-5">
          <Tarjeta>
            <TituloTarjeta>1. Datos fiscales</TituloTarjeta>
            <FormDatos
              datos={{
                cuit: c.cuit ?? '',
                razon_social: c.razon_social ?? '',
                condicion_iva: c.condicion_iva ?? '',
                inicio_actividades: c.inicio_actividades ? new Date(c.inicio_actividades).toISOString().slice(0, 10) : '',
                domicilio: c.domicilio ?? '',
                iibb: c.iibb ?? '',
              }}
            />
          </Tarjeta>
          <Tarjeta>
            <TituloTarjeta>2. Puntos de venta</TituloTarjeta>
            <FormPuntos sucursales={sucursales} />
          </Tarjeta>
        </div>
        <div className="min-w-0 space-y-5">
          <Tarjeta>
            <TituloTarjeta>3. Certificado de ARCA</TituloTarjeta>
            <Certificado tienePedido={!!c.pedido_certificado} pedido={c.pedido_certificado} cert={cert} puedeGenerar={!!c.cuit && !!c.razon_social} />
          </Tarjeta>
          <Tarjeta>
            <TituloTarjeta>4. Cómo se factura</TituloTarjeta>
            <FormModo modo={c.modo} automatico={c.facturar_automatico} identificarDesde={c.identificar_desde} hayCertificado={!!c.certificado} />
          </Tarjeta>
        </div>
      </div>
    </>
  )
}
