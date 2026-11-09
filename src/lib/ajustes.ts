import 'server-only'
import { db } from './db'

export type Ajustes = {
  nombre_negocio: string
  pie_ticket: string
  ancho_ticket: '58' | '80'
  /** Una curva por línea: "Letras: XS, S, M, L". */
  curvas_talles: string
  colores_frecuentes: string
  categorias_gasto: string
  /** Logo subido (data URL). Se sirve en /logo; las pantallas usan `logo_version` para refrescarlo. */
  logo: string
  logo_version: string
  /** Color de marca (#rrggbb). Vacío = el azul de siempre. */
  color_marca: string
}

const PREDETERMINADOS: Ajustes = {
  nombre_negocio: 'Mi negocio',
  pie_ticket: '',
  ancho_ticket: '80',
  curvas_talles:
    'Samsung: A06, A16, A26, A36, A56, S24, S25, S25 Ultra\niPhone: 11, 12, 13, 14, 15, 16, 16 Pro, 16 Pro Max\nMotorola: E14, E15, G05, G15, G35, G55, G75, Edge 50\nXiaomi: Redmi 14C, Redmi A3, Redmi Note 13, Redmi Note 14, Poco X6\nÚnico: Único',
  colores_frecuentes: 'Negro, Transparente, Blanco, Rosa, Lila, Azul, Rojo, Verde',
  categorias_gasto: 'Alquiler, Sueldos, Servicios (luz/agua/internet), Impuestos, Limpieza, Bolsas y packaging, Publicidad, Comisiones de tarjeta, Mantenimiento, Otros',
  logo: '',
  logo_version: '',
  color_marca: '',
}

export async function leerAjustes(): Promise<Ajustes> {
  const filas = await db()<{ clave: string; valor: string }[]>`select clave, valor from ajustes`
  const a = { ...PREDETERMINADOS } as Record<string, string>
  for (const f of filas) a[f.clave] = f.valor
  return a as Ajustes
}

/** Logo para mostrar (URL con versión para que se refresque al cambiarlo), o null. */
export const urlLogo = (a: Pick<Ajustes, 'logo' | 'logo_version'>) => (a.logo ? `/logo?v=${a.logo_version || '1'}` : null)

/** Variables CSS del color de marca elegido en Ajustes. */
export function estiloMarca(color: string): string | null {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return null
  return `:root{--color-marca:${color};--color-marca-oscura:color-mix(in oklab,${color} 78%,black);--color-marca-clara:color-mix(in oklab,${color} 9%,white)}`
}
