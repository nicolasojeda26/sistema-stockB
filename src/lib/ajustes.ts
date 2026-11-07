import 'server-only'
import { db } from './db'

export type Ajustes = {
  nombre_negocio: string
  pie_ticket: string
  ancho_ticket: '58' | '80'
  /** Una curva por línea: "Letras: XS, S, M, L". */
  curvas_talles: string
  colores_frecuentes: string
}

const PREDETERMINADOS: Ajustes = {
  nombre_negocio: 'Mi negocio',
  pie_ticket: '',
  ancho_ticket: '80',
  curvas_talles: 'Letras: XS, S, M, L, XL, XXL\nNúmeros: 36, 38, 40, 42, 44, 46, 48\nÚnico: Único',
  colores_frecuentes: 'Negro, Blanco, Gris, Azul, Beige',
}

export async function leerAjustes(): Promise<Ajustes> {
  const filas = await db()<{ clave: string; valor: string }[]>`select clave, valor from ajustes`
  const a = { ...PREDETERMINADOS } as Record<string, string>
  for (const f of filas) a[f.clave] = f.valor
  return a as Ajustes
}
