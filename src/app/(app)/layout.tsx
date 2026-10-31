import { requerirUsuario } from '@/lib/dal'
import { salir } from '@/app/login/actions'
import { Navegacion, type ItemNav } from './navegacion'

export default async function AppLayout({ children }: LayoutProps<'/'>) {
  const u = await requerirUsuario()
  const esAdmin = u.rol === 'admin'
  const items: ItemNav[] = [
    { href: '/', texto: 'Inicio', icono: 'inicio', exacto: true },
    { href: '/vender', texto: 'Vender', icono: 'vender' },
    { href: '/caja', texto: 'Caja', icono: 'caja' },
    { href: '/ventas', texto: 'Ventas', icono: 'ventas' },
    { href: '/productos', texto: 'Productos', icono: 'productos' },
    { href: '/mercaderia/ingreso', texto: 'Ingreso de mercadería', icono: 'ingreso', seccion: 'Mercadería' },
    { href: '/mercaderia/transferencia', texto: 'Transferencias', icono: 'transferencia' },
    ...(esAdmin ? [{ href: '/mercaderia/ajuste', texto: 'Ajustes de stock', icono: 'ajuste' } as ItemNav] : []),
    { href: '/mercaderia', texto: 'Movimientos', icono: 'movimientos', exacto: true },
    { href: '/etiquetas', texto: 'Etiquetas', icono: 'etiquetas' },
    ...(esAdmin
      ? ([
          { href: '/precios', texto: 'Actualizar precios', icono: 'precios', seccion: 'Administración' },
          { href: '/categorias', texto: 'Categorías', icono: 'categorias' },
          { href: '/sucursales', texto: 'Sucursales y depósitos', icono: 'sucursales' },
          { href: '/usuarios', texto: 'Usuarios', icono: 'usuarios' },
          { href: '/importar', texto: 'Importar desde Dux', icono: 'importar' },
          { href: '/ajustes', texto: 'Ajustes del negocio', icono: 'ajustes' },
        ] as ItemNav[])
      : []),
  ]

  const pie = (
    <div className="border-t border-white/10 p-4">
      <p className="truncate text-sm font-medium text-white">{u.nombre}</p>
      <p className="truncate text-xs text-white/60">
        {u.rol === 'admin' ? 'Administradora' : `Vendedora · ${u.sucursal_nombre}`}
      </p>
      <form action={salir} className="mt-3">
        <button className="text-xs text-white/70 underline-offset-2 hover:text-white hover:underline">Cerrar sesión</button>
      </form>
    </div>
  )

  return (
    <div className="min-h-screen lg:flex">
      <Navegacion items={items} pie={pie} />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 lg:py-8 print:p-0">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  )
}
