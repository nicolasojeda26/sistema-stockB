'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requerirAdmin } from '@/lib/dal'
import { texto } from '@/lib/errores'
import { parseNumero } from '@/lib/numeros'
import { cifrar, descifrar, generarClaveYPedido, leerCertificado } from '@/lib/arca/certificado'
import { cuitValido } from '@/lib/arca/comprobantes'
import { leerConfig } from '@/lib/arca/facturacion'
import { autenticar, estadoServidor, type Ambiente } from '@/lib/arca/servicios'
import type { Resultado } from '@/components/form-accion'

const listo = (ok: string): Resultado => {
  revalidatePath('/facturacion')
  return { ok }
}

export async function guardarDatos(_: Resultado, f: FormData): Promise<Resultado> {
  await requerirAdmin()
  const cuit = texto(f, 'cuit').replace(/\D/g, '')
  const condicion = texto(f, 'condicion_iva')
  const inicio = texto(f, 'inicio_actividades')
  if (!cuitValido(cuit)) return { error: 'El CUIT no es válido.' }
  if (!texto(f, 'razon_social')) return { error: 'Poné la razón social.' }
  if (!['RI', 'MT', 'EX'].includes(condicion)) return { error: 'Elegí la condición frente al IVA.' }
  if (inicio && !/^\d{4}-\d{2}-\d{2}$/.test(inicio)) return { error: 'Fecha de inicio de actividades no válida.' }
  await db()`
    update config_fiscal set cuit = ${cuit}, razon_social = ${texto(f, 'razon_social')}, condicion_iva = ${condicion},
      inicio_actividades = ${inicio || null}, domicilio = ${texto(f, 'domicilio') || null}, iibb = ${texto(f, 'iibb') || null}
    where id = 1`
  return listo('Datos fiscales guardados.')
}

export async function guardarModo(_: Resultado, f: FormData): Promise<Resultado> {
  await requerirAdmin()
  const modo = texto(f, 'modo')
  if (!['desactivada', 'simulacion', 'homologacion', 'produccion'].includes(modo)) return { error: 'Modo no válido.' }
  const desde = parseNumero(texto(f, 'identificar_desde'))
  if (desde === null || desde <= 0) return { error: 'El monto para identificar al cliente no es válido.' }
  const c = await leerConfig(db())
  if ((modo === 'homologacion' || modo === 'produccion') && !c.certificado) return { error: 'Primero cargá el certificado de ARCA.' }
  await db()`
    update config_fiscal set modo = ${modo}, facturar_automatico = ${f.get('facturar_automatico') === 'on'}, identificar_desde = ${desde}
    where id = 1`
  return listo('Guardado.')
}

export async function guardarPuntos(_: Resultado, f: FormData): Promise<Resultado> {
  await requerirAdmin()
  const sucursales = await db()<{ id: number }[]>`select id from sucursales`
  const valores = sucursales.map((s) => ({ id: s.id, pv: texto(f, `pv_${s.id}`) }))
  for (const v of valores) if (v.pv && !/^\d{1,5}$/.test(v.pv)) return { error: 'Los puntos de venta son números (ej.: 3).' }
  const usados = valores.filter((v) => v.pv).map((v) => Number(v.pv))
  if (new Set(usados).size !== usados.length) return { error: 'Cada sucursal tiene que tener un punto de venta distinto.' }
  await db().begin(async (tx) => {
    await tx`update sucursales set punto_venta = null`
    for (const v of valores) if (v.pv) await tx`update sucursales set punto_venta = ${Number(v.pv)} where id = ${v.id}`
  })
  return listo('Puntos de venta guardados.')
}

export async function generarPedido(): Promise<{ csr?: string; error?: string }> {
  await requerirAdmin()
  const c = await leerConfig(db())
  if (!c.cuit || !c.razon_social) return { error: 'Primero guardá el CUIT y la razón social.' }
  const { clavePem, csrPem } = generarClaveYPedido({ cuit: c.cuit, razonSocial: c.razon_social, alias: 'sistemastock' })
  await db()`update config_fiscal set clave_privada = ${cifrar(clavePem)}, pedido_certificado = ${csrPem}, certificado = null, certificado_vence = null,
    modo = case when modo in ('homologacion', 'produccion') then 'desactivada' else modo end where id = 1`
  await db()`delete from arca_credenciales`
  revalidatePath('/facturacion')
  return { csr: csrPem }
}

export async function cargarCertificado(pem: string): Promise<{ ok?: string; error?: string }> {
  await requerirAdmin()
  const c = await leerConfig(db())
  if (!c.clave_privada) return { error: 'Primero generá la clave y el pedido de certificado.' }
  try {
    const info = leerCertificado(pem.trim(), descifrar(c.clave_privada))
    if (info.cuit && c.cuit && info.cuit !== c.cuit.replace(/\D/g, '')) return { error: `El certificado es del CUIT ${info.cuit}, no del configurado.` }
    if (info.hasta < new Date()) return { error: 'El certificado está vencido.' }
    await db()`update config_fiscal set certificado = ${pem.trim()}, certificado_vence = ${info.hasta} where id = 1`
    await db()`delete from arca_credenciales`
  } catch (e) {
    return { error: (e as Error).message }
  }
  revalidatePath('/facturacion')
  return { ok: 'Certificado cargado.' }
}

export async function probarConexion(ambiente: Ambiente): Promise<{ pasos: { texto: string; ok: boolean }[] }> {
  await requerirAdmin()
  const pasos: { texto: string; ok: boolean }[] = []
  try {
    const e = await estadoServidor(ambiente)
    pasos.push({ texto: `Servidores de ARCA (${ambiente}): ${e.app === 'OK' && e.db === 'OK' && e.auth === 'OK' ? 'funcionando' : JSON.stringify(e)}`, ok: e.app === 'OK' })
  } catch (e) {
    pasos.push({ texto: `No se pudo llegar a ARCA: ${(e as Error).message}`, ok: false })
    return { pasos }
  }
  const c = await leerConfig(db())
  if (!c.certificado || !c.clave_privada) {
    pasos.push({ texto: 'Falta cargar el certificado para probar el acceso.', ok: false })
    return { pasos }
  }
  try {
    const cred = await autenticar(ambiente, c.certificado, descifrar(c.clave_privada))
    await db()`
      insert into arca_credenciales (ambiente, servicio, token, sign, vence) values (${ambiente}, 'wsfe', ${cred.token}, ${cred.sign}, ${cred.vence})
      on conflict (ambiente, servicio) do update set token = excluded.token, sign = excluded.sign, vence = excluded.vence`
    pasos.push({ texto: 'El certificado fue aceptado: el sistema ya puede facturar.', ok: true })
  } catch (e) {
    const msg = (e as Error).message
    pasos.push({ texto: /ya hay un acceso vigente/.test(msg) ? 'El certificado funciona (ARCA ya tenía un acceso vigente).' : msg, ok: /ya hay un acceso vigente/.test(msg) })
  }
  return { pasos }
}
