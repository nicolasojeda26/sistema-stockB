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
  /** % que se descuenta del precio de lista al pagar con transferencia o en efectivo. */
  descuento_transferencia: string
  descuento_efectivo: string
  /** Texto al pie del comprobante de recepción de reparaciones. */
  condiciones_reparacion: string
  /** Garantía de las reparaciones, en días (se puede cambiar en cada una). */
  garantia_dias: string
  /** Cláusulas de los comprobantes del área técnica (una por renglón). */
  clausulas_ingreso: string
  clausulas_garantia: string
  clausulas_entrega: string
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
  descuento_transferencia: '0',
  descuento_efectivo: '0',
  condiciones_reparacion:
    'El presupuesto puede cambiar al revisar el equipo; se consulta antes de reparar. Pasados 90 días de avisado que está listo, el equipo se considera abandonado. No nos hacemos responsables por la información guardada en el equipo.',
  garantia_dias: '30',
  clausulas_ingreso: "CLÁUSULA 1: El presupuesto puede cambiar al revisar el equipo; se consulta al cliente antes de reparar.\nCLÁUSULA 2: El equipo que experimente daños causados por mal uso, uso negligente, instalación incorrecta o accidentes provocados por manipulación incorrecta no es causal de exigencia de la garantía.\nCLÁUSULA 3: La empresa no se hace responsable por fallas ajenas no declaradas por el cliente al momento de entregar el equipo.\nCLÁUSULA 4: El período de reparación podrá ser de hasta 30 días hábiles, debido a que el dispositivo será sometido a diversas pruebas para lograr su máxima operatividad.\nCLÁUSULA 5: Pasados 90 días de avisado que el equipo está listo, se considera abandonado.\nCLÁUSULA 6: MegaCel+ no se hace responsable por la información guardada en el equipo.",
  clausulas_garantia: "CLÁUSULA 1: El extravío, pérdida o destrucción de este documento emitido por la empresa (MEGA-CEL+), por parte del interesado, será causal de eximir del cumplimiento de la garantía de reparación del equipo o dispositivo electrónico.\nCLÁUSULA 2: La garantía puede llegar a cubrir total o parcialmente el funcionamiento de los repuestos colocados (módulo, táctil, puertos de carga, parlantes, micrófono, alto parlante, puerto ficha de auricular, reemplazo de componentes, botones de power, volumen (+ -), lectoras de chip (SIM) o cualquier otro tipo de reparaciones) detalladas y descriptas en este documento.\nCLÁUSULA 3: El equipo que experimente daños causados por mal uso, uso negligente, instalación incorrecta o accidentales provocados por manipulación incorrecta no es causal de exigencia de la garantía.\nCLÁUSULA 4: La garantía no cubre fallas ajenas no declaradas con anterioridad por el cliente al momento de entrega del producto a la empresa.\nCLÁUSULA 5: El período de reparación podrá ser de hasta 30 días hábiles debido a que el dispositivo será sometido a diversas pruebas para lograr su máxima operatividad.\nCLÁUSULA 6: Si al momento de ejecutar la garantía los repuestos y/o elementos instalados sufren variación de los costos debido a la situación económica, se informará al usuario la diferencia a abonar, mientras que el servicio técnico y la mano de obra se mantendrán a cargo de la empresa.",
  clausulas_entrega: "CLÁUSULA 1: El presente comprobante hace constar que la empresa (MEGA-CEL+) hace entrega del equipo (celular, tablet o cualquier dispositivo electrónico) descripto en el comprobante de número de orden ingresado.\nCLÁUSULA 2: Dejando en conocimiento del retiro en los siguientes casos: A) De no poder localizar la falla. B) De no poder conseguir repuestos en tiempo y forma.\nCLÁUSULA 3: Una vez retirado el dispositivo por el titular, la empresa (MEGA-CEL+) no es responsable ante cualquier tipo de reclamo en general (directa o indirectamente).",
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

/** Descuentos por forma de pago, como números entre 0 y 100. */
export function descuentosPago(a: Pick<Ajustes, 'descuento_transferencia' | 'descuento_efectivo'>) {
  const n = (v: string) => Math.min(100, Math.max(0, Number(String(v).replace(',', '.')) || 0))
  return { transferencia: n(a.descuento_transferencia), efectivo: n(a.descuento_efectivo) }
}
