'use client'

import { useState, useTransition } from 'react'
import { FormAccion } from '@/components/form-accion'
import { Aviso, Boton, Campo, Input, Select } from '@/components/ui'
import { CONDICIONES_EMISOR } from '@/lib/arca/comprobantes'
import { cargarCertificado, generarPedido, guardarDatos, guardarModo, guardarPuntos, probarConexion } from './actions'

export function FormDatos({ datos }: { datos: Record<string, string> }) {
  return (
    <FormAccion accion={guardarDatos} className="space-y-4 p-5">
      {(_, enviando) => (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="CUIT">
              <Input name="cuit" defaultValue={datos.cuit} placeholder="20-12345678-6" inputMode="numeric" required />
            </Campo>
            <Campo etiqueta="Condición frente al IVA">
              <Select name="condicion_iva" defaultValue={datos.condicion_iva} required>
                <option value="" disabled>
                  Elegí…
                </option>
                {Object.entries(CONDICIONES_EMISOR).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Campo>
          </div>
          <Campo etiqueta="Razón social" ayuda="Como figura en ARCA.">
            <Input name="razon_social" defaultValue={datos.razon_social} required />
          </Campo>
          <Campo etiqueta="Domicilio comercial">
            <Input name="domicilio" defaultValue={datos.domicilio} />
          </Campo>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Ingresos Brutos">
              <Input name="iibb" defaultValue={datos.iibb} />
            </Campo>
            <Campo etiqueta="Inicio de actividades">
              <Input name="inicio_actividades" type="date" defaultValue={datos.inicio_actividades} />
            </Campo>
          </div>
          <Boton type="submit" disabled={enviando}>
            Guardar datos
          </Boton>
        </>
      )}
    </FormAccion>
  )
}

export function FormPuntos({ sucursales }: { sucursales: { id: number; nombre: string; punto_venta: number | null }[] }) {
  return (
    <FormAccion accion={guardarPuntos} className="space-y-4 p-5">
      {(_, enviando) => (
        <>
          <p className="text-sm text-tinta-suave">
            Cada sucursal factura con su propio punto de venta. Se crean en ARCA, en «Administración de puntos de venta y domicilios», del tipo <b>Factura electrónica · Web Services</b>.
          </p>
          <ul className="space-y-2">
            {sucursales.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3">
                <label htmlFor={`pv_${s.id}`} className="text-sm">
                  {s.nombre}
                </label>
                <Input id={`pv_${s.id}`} name={`pv_${s.id}`} defaultValue={s.punto_venta ?? ''} inputMode="numeric" placeholder="Ej.: 3" className="w-28 text-right" />
              </li>
            ))}
          </ul>
          <Boton type="submit" disabled={enviando}>
            Guardar puntos de venta
          </Boton>
        </>
      )}
    </FormAccion>
  )
}

export function Certificado({
  tienePedido,
  pedido,
  cert,
  puedeGenerar,
}: {
  tienePedido: boolean
  pedido: string | null
  cert: { sujeto: string; emisor: string; hasta: string } | null
  puedeGenerar: boolean
}) {
  const [csr, setCsr] = useState(pedido)
  const [crt, setCrt] = useState('')
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [prueba, setPrueba] = useState<{ texto: string; ok: boolean }[] | null>(null)
  const [ocupado, iniciar] = useTransition()

  const descargar = (texto: string) => `data:application/pkcs10;charset=utf-8,${encodeURIComponent(texto)}`

  return (
    <div className="space-y-5 p-5 text-sm">
      {msg && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}
      {cert && (
        <div className="rounded-lg bg-ok-claro p-3 text-ok">
          <b>Certificado cargado</b> · {cert.sujeto} · emitido por {cert.emisor} · vence {cert.hasta}
        </div>
      )}

      <ol className="space-y-4">
        <li>
          <p className="font-medium">a. Generar la clave y el pedido de certificado</p>
          <p className="mt-1 text-tinta-suave">La clave privada queda guardada cifrada en el sistema; nadie tiene que manejar archivos de claves.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Boton
              type="button"
              variante={csr ? 'secundario' : 'primario'}
              disabled={ocupado || !puedeGenerar}
              onClick={() => {
                if (cert && !confirm('Generar una clave nueva deja sin efecto el certificado cargado. ¿Seguir?')) return
                iniciar(async () => {
                  const r = await generarPedido()
                  if (r.error) return setMsg({ tipo: 'error', texto: r.error })
                  setCsr(r.csr!)
                  setMsg({ tipo: 'ok', texto: 'Pedido generado. Descargalo y subilo a ARCA.' })
                })
              }}
            >
              {csr ? 'Generar otra clave' : 'Generar clave y pedido'}
            </Boton>
            {csr && (
              <a href={descargar(csr)} download="pedido-certificado.csr" className="inline-flex h-10 items-center rounded-lg border border-linea px-4 font-medium hover:bg-fondo">
                Descargar pedido (.csr)
              </a>
            )}
          </div>
          {!puedeGenerar && <p className="mt-1 text-xs text-alerta">Primero guardá el CUIT y la razón social.</p>}
        </li>
        <li>
          <p className="font-medium">b. Subir el pedido a ARCA y bajar el certificado</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-tinta-suave">
            <li>
              Para pruebas: servicio <b>WSASS – Autogestión Certificados Homologación</b>, «Nuevo certificado», pegando el pedido. Después, «Crear autorización a servicio» para <b>wsfe</b>.
            </li>
            <li>
              Para facturar en serio: servicio <b>Administración de Certificados Digitales</b>, agregar alias y subir el .csr. Después, en <b>Administrador de Relaciones de Clave Fiscal</b>, asociar el certificado al servicio «Facturación electrónica».
            </li>
          </ul>
        </li>
        <li>
          <p className="font-medium">c. Cargar el certificado (.crt) que da ARCA</p>
          <input
            type="file"
            accept=".crt,.pem,.cer"
            disabled={!tienePedido && !csr}
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (f) setCrt(await f.text())
            }}
            className="mt-2 block text-sm file:mr-3 file:h-9 file:rounded-lg file:border file:border-linea file:bg-papel file:px-3 file:text-sm"
          />
          {crt && (
            <Boton
              type="button"
              className="mt-2"
              disabled={ocupado}
              onClick={() =>
                iniciar(async () => {
                  const r = await cargarCertificado(crt)
                  setMsg(r.error ? { tipo: 'error', texto: r.error } : { tipo: 'ok', texto: r.ok! })
                  if (r.ok) setCrt('')
                })
              }
            >
              Cargar certificado
            </Boton>
          )}
        </li>
        <li>
          <p className="font-medium">d. Probar la conexión</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(['homologacion', 'produccion'] as const).map((amb) => (
              <Boton
                key={amb}
                type="button"
                variante="secundario"
                disabled={ocupado}
                onClick={() => iniciar(async () => setPrueba((await probarConexion(amb)).pasos))}
              >
                Probar {amb === 'homologacion' ? 'homologación' : 'producción'}
              </Boton>
            ))}
          </div>
          {prueba && (
            <ul className="mt-3 space-y-1">
              {prueba.map((p, i) => (
                <li key={i} className={p.ok ? 'text-ok' : 'text-error'}>
                  {p.ok ? '✓' : '✕'} {p.texto}
                </li>
              ))}
            </ul>
          )}
        </li>
      </ol>
    </div>
  )
}

export function FormModo({
  modo,
  automatico,
  identificarDesde,
  hayCertificado,
}: {
  modo: string
  automatico: boolean
  identificarDesde: number
  hayCertificado: boolean
}) {
  return (
    <FormAccion accion={guardarModo} className="space-y-4 p-5">
      {(_, enviando) => (
        <>
          <Campo etiqueta="Modo">
            <Select name="modo" defaultValue={modo}>
              <option value="desactivada">Desactivada (solo tickets)</option>
              <option value="simulacion">Simulación (para practicar, sin validez)</option>
              <option value="homologacion" disabled={!hayCertificado}>
                ARCA homologación (pruebas)
              </option>
              <option value="produccion" disabled={!hayCertificado}>
                ARCA producción (facturas reales)
              </option>
            </Select>
          </Campo>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="facturar_automatico" defaultChecked={automatico} className="mt-0.5 h-4 w-4 accent-marca" />
            <span>
              Facturar cada venta automáticamente a consumidor final
              <span className="block text-xs text-apagado">Si el cliente pide factura con sus datos, se hace desde la venta.</span>
            </span>
          </label>
          <Campo etiqueta="Identificar al consumidor final desde" ayuda="RG 5700/2025: hoy $10.000.000. Cambialo si ARCA actualiza el monto.">
            <Input name="identificar_desde" defaultValue={String(identificarDesde).replace('.', ',')} inputMode="decimal" />
          </Campo>
          <Boton type="submit" disabled={enviando}>
            Guardar
          </Boton>
        </>
      )}
    </FormAccion>
  )
}
