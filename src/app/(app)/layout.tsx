import { requerirUsuario } from '@/lib/dal'
import { leerAjustes } from '@/lib/ajustes'
import { salir } from '@/app/login/actions'
import { Navegacion, type ItemNav } from './navegacion'

export default async function AppLayout({ children }: LayoutProps<'/'>) {
  const u = await requerirUsuario()
  const { nombre_negocio } = await leerAjustes()
  const esAdmin = u.rol === 'admin'
  const items: ItemNav[] = [
    { href: '/', texto: 'Inicio', icono: 'inicio', exacto: true },
    { href: '/vender', texto: 'Vender', icono: 'vender' },
    { href: '/caja', texto: 'Caja', icono: 'caja' },
    { href: '/ventas', texto: 'Ventas', icono: 'ventas' },
    { href: '/productos', texto: 'Productos', icono: 'productos' },
    { href: '/clientes', texto: 'Clientes', icono: 'clientes' },
    { href: '/mercaderia/ingreso', texto: 'Ingreso de mercadería', icono: 'ingreso', seccion: 'Mercadería' },
    { href: '/mercaderia/transferencia', texto: 'Transferencias', icono: 'transferencia' },
    ...(esAdmin ? [{ href: '/mercaderia/ajuste', texto: 'Ajustes de stock', icono: 'ajuste' } as ItemNav] : []),
    { href: '/mercaderia', texto: 'Movimientos', icono: 'movimientos', exacto: true },
    { href: '/etiquetas', texto: 'Etiquetas', icono: 'etiquetas' },
    ...(esAdmin
      ? ([
          { href: '/compras', texto: 'Compras', icono: 'compras', seccion: 'Compras y gastos' },
          { href: '/proveedores', texto: 'Proveedores', icono: 'proveedores' },
          { href: '/gastos', texto: 'Gastos', icono: 'gastos' },
        ] as ItemNav[])
      : ([{ href: '/gastos', texto: 'Gastos de la caja', icono: 'gastos' }] as ItemNav[])),
    ...(esAdmin
      ? ([
          { href: '/reportes', texto: 'Reportes', icono: 'reportes', seccion: 'Administración' },
          { href: '/comprobantes', texto: 'Comprobantes', icono: 'factura' },
          { href: '/precios', texto: 'Actualizar precios', icono: 'precios' },
          { href: '/facturacion', texto: 'Facturación ARCA', icono: 'factura', seccion: 'Configuración' },
          { href: '/categorias', texto: 'Categorías', icono: 'categorias' },
          { href: '/sucursales', texto: 'Sucursales y depósitos', icono: 'sucursales' },
          { href: '/usuarios', texto: 'Usuarios', icono: 'usuarios' },
          { href: '/importar', texto: 'Importar desde Dux', icono: 'importar' },
          { href: '/ajustes', texto: 'Ajustes del negocio', icono: 'ajustes' },
        ] as ItemNav[])
      : []),
  ]

  const pie = (
    <div className="flex items-center gap-3 border-t border-linea p-3 pb-20 lg:pb-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-marca-clara text-sm font-bold text-marca" aria-hidden>
        {u.nombre.trim()[0]?.toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{u.nombre}</span>
        <span className="block truncate text-xs text-apagado">{u.rol === 'admin' ? 'Administradora' : `Vendedora en ${u.sucursal_nombre}`}</span>
      </span>
      <form action={salir}>
        <button className="rounded-lg px-2 py-1.5 text-xs font-medium text-tinta-suave hover:bg-fondo hover:text-tinta">Salir</button>
      </form>
    </div>
  )

  return (
    <div className="min-h-screen lg:flex">
      <Navegacion items={items} pie={pie} negocio={nombre_negocio} />
      <main className="min-w-0 flex-1 px-4 pt-6 pb-24 sm:px-8 lg:py-8 print:p-0">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  )
}
