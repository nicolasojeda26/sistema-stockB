import 'server-only'
import { db } from './db'

export type Ajustes = { nombre_negocio: string; pie_ticket: string; ancho_ticket: '58' | '80' }

const PREDETERMINADOS: Ajustes = { nombre_negocio: 'Mi negocio', pie_ticket: '', ancho_ticket: '80' }

export async function leerAjustes(): Promise<Ajustes> {
  const filas = await db()<{ clave: string; valor: string }[]>`select clave, valor from ajustes`
  const a = { ...PREDETERMINADOS } as Record<string, string>
  for (const f of filas) a[f.clave] = f.valor
  return a as Ajustes
}
