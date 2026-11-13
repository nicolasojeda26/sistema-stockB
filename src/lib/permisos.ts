/**
 * Catálogo de permisos. Cada rol tiene una lista; "Administración" (rol del sistema) tiene todos.
 * `soloTodas`: permisos que muestran datos de todas las sucursales, así que solo los puede tener
 * un rol que trabaja en "todas las sucursales" (base admin).
 */
export const PERMISOS = [
  { clave: 'vender', grupo: 'Ventas', texto: 'Vender y manejar la caja', detalle: 'Vender, caja, ventas, presupuestos, devoluciones y gastos pagados con la caja.' },
  { clave: 'clientes', grupo: 'Ventas', texto: 'Clientes y cuenta corriente', detalle: 'Ver y cargar clientes, cobrar y vender en cuenta corriente.' },
  { clave: 'credito', grupo: 'Ventas', texto: 'Límites de crédito y saldos', detalle: 'Poner el límite de crédito de un cliente, ajustar saldos y pasar el límite al vender.' },
  { clave: 'anular_ventas', grupo: 'Ventas', texto: 'Anular ventas', detalle: 'Anular una venta completa.' },
  { clave: 'reparaciones', grupo: 'Ventas', texto: 'Reparaciones', detalle: 'Recibir equipos para reparar, actualizar su estado y avisar al cliente.' },
  { clave: 'descuento_libre', grupo: 'Ventas', texto: 'Descuentos sin tope', detalle: 'Hacer cualquier descuento, sin el tope de cada persona.' },

  { clave: 'productos', grupo: 'Mercadería', texto: 'Productos, precios y categorías', detalle: 'Crear y editar productos, cambiar precios y manejar categorías.' },
  { clave: 'ingreso', grupo: 'Mercadería', texto: 'Ingreso de mercadería', detalle: 'Cargar la mercadería que llega en los depósitos de su lugar.' },
  { clave: 'pedidos', grupo: 'Mercadería', texto: 'Pedir mercadería al depósito', detalle: 'Hacer pedidos de su sucursal al depósito.' },
  { clave: 'envios', grupo: 'Mercadería', texto: 'Atender pedidos y mandar envíos', detalle: 'Ver los pedidos de las sucursales y armar envíos desde su depósito.' },
  { clave: 'ajustes_stock', grupo: 'Mercadería', texto: 'Ajustes de stock', detalle: 'Corregir el stock por recuento, rotura o pérdida en los depósitos de su lugar.' },
  { clave: 'transferencias', grupo: 'Mercadería', texto: 'Transferencias directas', detalle: 'Mover stock entre depósitos sin envío.', soloTodas: true },
  { clave: 'diferencias', grupo: 'Mercadería', texto: 'Resolver diferencias de envíos', detalle: 'Decidir qué pasa cuando un envío llega distinto.', soloTodas: true },

  { clave: 'compras', grupo: 'Compras y gastos', texto: 'Compras y proveedores', detalle: 'Cargar compras, pagar y ajustar cuentas de proveedores.', soloTodas: true },
  { clave: 'gastos', grupo: 'Compras y gastos', texto: 'Gastos del negocio', detalle: 'Ver y cargar todos los gastos, y anularlos.', soloTodas: true },

  { clave: 'reportes', grupo: 'Administración', texto: 'Reportes y comprobantes', detalle: 'Reportes, comprobantes emitidos y exportaciones.', soloTodas: true },
  { clave: 'facturacion', grupo: 'Administración', texto: 'Facturación ARCA', detalle: 'Configurar datos fiscales, certificado y puntos de venta.', soloTodas: true },
  { clave: 'configuracion', grupo: 'Administración', texto: 'Sucursales y ajustes del negocio', detalle: 'Sucursales y depósitos, importar desde Dux y ajustes del negocio.', soloTodas: true },
  { clave: 'personal', grupo: 'Administración', texto: 'Personal, roles y permisos', detalle: 'Sumar, mover y dar de baja personal; crear roles y dar permisos.', soloTodas: true },
  { clave: 'solicitudes', grupo: 'Administración', texto: 'Responder solicitudes', detalle: 'Ver y responder las solicitudes de ayuda de todo el personal.', soloTodas: true },
] as const

export type Permiso = (typeof PERMISOS)[number]['clave']
export type Base = 'admin' | 'vendedora' | 'deposito'

export const TODOS: Permiso[] = PERMISOS.map((p) => p.clave)
const CLAVES = new Set<string>(TODOS)
const SOLO_TODAS = new Set<string>(PERMISOS.filter((p) => 'soloTodas' in p && p.soloTodas).map((p) => p.clave))

export const NOMBRE_BASE: Record<Base, string> = {
  admin: 'Todas las sucursales',
  vendedora: 'Un local o ventas online',
  deposito: 'El depósito',
}

/** Permisos que puede tener un rol de esa base. */
export const permitidoEnBase = (p: string, base: Base) => CLAVES.has(p) && (base === 'admin' || !SOLO_TODAS.has(p))

/** Limpia una lista: solo claves conocidas, válidas para la base, sin repetir, en el orden del catálogo. */
export function normalizarPermisos(lista: readonly string[], base: Base): Permiso[] {
  const pedidos = new Set(lista)
  return TODOS.filter((p) => pedidos.has(p) && permitidoEnBase(p, base))
}

/** Permisos efectivos de un rol. El rol del sistema de administración tiene todos. */
export function permisosDeRol(r: { base: Base; sistema: boolean; permisos: readonly string[] }): Permiso[] {
  if (r.sistema && r.base === 'admin') return [...TODOS]
  return normalizarPermisos(r.permisos, r.base)
}

export const tienePermiso = (u: { permisos: readonly string[] }, p: Permiso) => u.permisos.includes(p)

/** Permisos de los roles del sistema tal como vienen de fábrica (migración 015). */
export const PERMISOS_DE_FABRICA: Record<Base, Permiso[]> = {
  admin: [...TODOS],
  vendedora: ['vender', 'pedidos', 'reparaciones'],
  deposito: ['envios', 'ingreso'],
}

/**
 * Para la lógica de negocio (src/lib): usa los permisos de la persona si vienen;
 * si no (scripts, tests), los del rol de fábrica de su base.
 */
export function puedeEn(u: { rol: string; permisos?: readonly string[] }, p: Permiso): boolean {
  if (u.permisos) return u.permisos.includes(p)
  return (PERMISOS_DE_FABRICA[u.rol as Base] ?? []).includes(p)
}
