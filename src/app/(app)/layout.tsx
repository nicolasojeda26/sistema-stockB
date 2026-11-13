import { puede, puedeVender, requerirUsuario } from '@/lib/dal'
import type { Permiso } from '@/lib/permisos'
import { db } from '@/lib/db'
import { estiloMarca, leerAjustes, urlLogo } from '@/lib/ajustes'
import { salir } from '@/app/login/actions'
import { SelectorTema } from '@/components/selector-tema'
import { Navegacion, type ItemNav } from './navegacion'

export default async function AppLayout({ children }: LayoutProps<'/'>) {
  const u = await requerirUsuario()
  const ajustes = await leerAjustes()
  const { nombre_negocio } = ajustes
  const estilo = estiloMarca(ajustes.color_marca)
  const vende = puedeVender(u)
  // Avisos del menú: pedidos sin atender, envíos por recibir y diferencias sin resolver.
  const [avisos] = await db()<{ pedidos: number; por_recibir: number; diferencias: number }[]>`
    select
      (select count(*)::int from pedidos where estado in ('pendiente', 'parcial')
        ${u.rol === 'vendedora' ? db()`and sucursal_id = ${u.sucursal_id}` : db()``}) as pedidos,
      (select count(*)::int from envios e join depositos d on d.id = e.destino_id
        where e.estado = 'en_camino' ${u.rol === 'admin' ? db()`` : db()`and d.sucursal_id = ${u.sucursal_id}`}) as por_recibir,
      ${puede(u, 'diferencias') ? db()`(select count(*)::int from envios where estado = 'con_diferencias' and resuelto_en is null)` : db()`0`} as diferencias`
  const p = (x: Permiso) => puede(u, x)
  const items: ItemNav[] = [
    { href: '/', texto: 'Inicio', icono: 'inicio', exacto: true },
    ...(vende
      ? ([
          { href: '/vender', texto: 'Vender', icono: 'vender' },
          { href: '/caja', texto: 'Caja', icono: 'caja' },
          { href: '/ventas', texto: 'Ventas', icono: 'ventas' },
          { href: '/presupuestos', texto: 'Presupuestos', icono: 'factura' },
        ] as ItemNav[])
      : []),
    ...(!vende && p('anular_ventas') ? [{ href: '/ventas', texto: 'Corregir ventas', icono: 'ventas' } as ItemNav] : []),
    { href: '/productos', texto: 'Productos', icono: 'productos' },
    ...(p('clientes') ? [{ href: '/clientes', texto: 'Clientes', icono: 'clientes' } as ItemNav] : []),
    ...(p('ingreso') ? [{ href: '/mercaderia/ingreso', texto: 'Ingreso de mercadería', icono: 'ingreso' } as ItemNav] : []),
    ...(p('pedidos') || p('envios')
      ? [{ href: '/pedidos', texto: p('envios') ? 'Pedidos de sucursales' : 'Pedidos al depósito', icono: 'pedidos', aviso: p('envios') ? avisos.pedidos : 0 } as ItemNav]
      : []),
    { href: '/envios', texto: 'Envíos', icono: 'envios', aviso: avisos.por_recibir + avisos.diferencias },
    ...(p('transferencias') ? [{ href: '/mercaderia/transferencia', texto: 'Transferencias', icono: 'transferencia' } as ItemNav] : []),
    ...(p('ajustes_stock') ? [{ href: '/mercaderia/ajuste', texto: 'Ajustes de stock', icono: 'ajuste' } as ItemNav] : []),
    { href: '/mercaderia', texto: 'Movimientos', icono: 'movimientos', exacto: true },
    { href: '/etiquetas', texto: 'Etiquetas', icono: 'etiquetas' },
    ...(p('compras') ? [{ href: '/compras', texto: 'Compras', icono: 'compras' } as ItemNav, { href: '/proveedores', texto: 'Proveedores', icono: 'proveedores' } as ItemNav] : []),
    ...(p('gastos') ? [{ href: '/gastos', texto: 'Gastos', icono: 'gastos' } as ItemNav] : vende ? [{ href: '/gastos', texto: 'Gastos de la caja', icono: 'gastos' } as ItemNav] : []),
    ...(p('reportes') ? [{ href: '/reportes', texto: 'Reportes', icono: 'reportes' } as ItemNav, { href: '/comprobantes', texto: 'Comprobantes', icono: 'factura' } as ItemNav] : []),
    ...(p('productos') ? [{ href: '/precios', texto: 'Actualizar precios', icono: 'precios' } as ItemNav, { href: '/categorias', texto: 'Categorías', icono: 'categorias' } as ItemNav] : []),
    ...(p('facturacion') ? [{ href: '/facturacion', texto: 'Facturación ARCA', icono: 'factura' } as ItemNav] : []),
    ...(p('configuracion') ? [{ href: '/sucursales', texto: 'Sucursales y depósitos', icono: 'sucursales' } as ItemNav] : []),
    ...(p('personal') ? [{ href: '/usuarios', texto: 'Personal y permisos', icono: 'usuarios' } as ItemNav] : []),
    ...(p('configuracion') ? [{ href: '/importar', texto: 'Importar desde Dux', icono: 'importar' } as ItemNav, { href: '/ajustes', texto: 'Ajustes del negocio', icono: 'ajustes' } as ItemNav] : []),
    { href: '/solicitudes', texto: 'Ayuda y solicitudes', icono: 'ajustes' },
  ]
  // Títulos de sección: se ponen en el primer ítem de cada grupo que la persona ve.
  const secciones: [string, string[]][] = [
    ['Mercadería', ['/mercaderia/ingreso', '/pedidos', '/envios']],
    ['Compras y gastos', ['/compras', '/gastos']],
    ['Administración', ['/reportes', '/precios']],
    ['Configuración', ['/facturacion', '/sucursales', '/usuarios', '/importar']],
    ['Ayuda', ['/solicitudes']],
  ]
  for (const [titulo, hrefs] of secciones) {
    const primero = items.find((i) => hrefs.includes(i.href))
    if (primero) primero.seccion = titulo
  }

  const pie = (
    <div className="space-y-2 px-3 pb-20 lg:pb-3">
      <SelectorTema />
      <div className="nav-divider nav-user flex items-center gap-3 border-t border-linea p-3 lg:rounded-xl lg:border-0">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-marca-clara text-sm font-bold text-marca" aria-hidden>
          {u.nombre.trim()[0]?.toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{u.nombre}</span>
          <span className="block truncate text-xs text-apagado">{u.rol === 'admin' ? u.rol_nombre : `${u.rol_nombre} · ${u.sucursal_nombre}`}</span>
        </span>
        <form action={salir}>
          <button className="nav-logout rounded-lg px-2 py-1.5 text-xs font-medium text-tinta-suave hover:bg-fondo hover:text-tinta">Salir</button>
        </form>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen lg:flex">
      {estilo && <style>{estilo}</style>}
      <Navegacion items={items} pie={pie} negocio={nombre_negocio} logo={urlLogo(ajustes)} />
      <main className="min-w-0 flex-1 px-4 pt-6 pb-24 sm:px-8 lg:px-10 lg:py-9 print:p-0">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  )
}
