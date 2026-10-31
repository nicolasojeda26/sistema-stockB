import Link from 'next/link'
import { db } from '@/lib/db'
import { requerirUsuario } from '@/lib/dal'
import { formatoEntero } from '@/lib/formato'
import { Tarjeta } from '@/components/ui'

export default async function InicioPage() {
  const u = await requerirUsuario()
  const sql = db()
  const filtro = u.rol === 'admin' ? sql`` : sql`and s.deposito_id in (select id from depositos where sucursal_id = ${u.sucursal_id})`
  const [r] = await sql<{ productos: number; unidades: number; bajo: number; sucursales: number; usuarios: number }[]>`
    with st as (
      select p.id, p.stock_minimo, coalesce((select sum(s.cantidad) from stock s where s.producto_id = p.id ${filtro}), 0) as cant
      from productos p where p.activo
    )
    select (select count(*)::int from st) as productos,
           (select coalesce(sum(cant), 0)::int from st) as unidades,
           (select count(*)::int from st where cant <= stock_minimo) as bajo,
           (select count(*)::int from sucursales where activa) as sucursales,
           (select count(*)::int from usuarios where activo) as usuarios`

  const primerNombre = u.nombre.split(' ')[0]
  const pasos = [
    { hecho: r.sucursales > 0, texto: 'Crear las sucursales y sus depósitos', href: '/sucursales' },
    { hecho: r.usuarios > 1, texto: 'Crear los usuarios de las chicas', href: '/usuarios' },
    { hecho: r.productos > 0, texto: 'Importar los productos desde Dux', href: '/importar' },
  ]

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Hola, {primerNombre}</h1>
      <p className="mt-1 text-sm text-tinta-suave">{u.rol === 'admin' ? 'Todas las sucursales' : u.sucursal_nombre}</p>

      <Tarjeta className="mt-6 p-5 sm:p-6">
        <form action="/productos" className="flex flex-col gap-3 sm:flex-row">
          <label className="sr-only" htmlFor="consulta">
            Consultar precio
          </label>
          <input
            id="consulta"
            name="q"
            autoFocus
            autoComplete="off"
            placeholder="Escaneá un código para ver precio y stock"
            className="h-14 flex-1 rounded-xl border border-linea bg-fondo px-4 font-mono text-lg placeholder:font-sans placeholder:text-base placeholder:text-apagado focus:border-marca focus:bg-papel focus:outline-none focus:ring-4 focus:ring-marca/10"
          />
          <button className="h-14 rounded-xl bg-marca px-6 font-medium text-white hover:bg-marca-oscura">Consultar</button>
        </form>
      </Tarjeta>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Dato titulo="Productos activos" valor={r.productos} href="/productos" />
        <Dato titulo={u.rol === 'admin' ? 'Unidades en stock' : 'Unidades en tu sucursal'} valor={r.unidades} />
        <Dato titulo="Con stock bajo" valor={r.bajo} href="/productos?estado=stock-bajo" alerta={r.bajo > 0} />
        {u.rol === 'admin' && <Dato titulo="Sucursales" valor={r.sucursales} href="/sucursales" />}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Atajo href="/mercaderia/ingreso" titulo="Ingresar mercadería" detalle="Llegó un pedido" />
        <Atajo href="/mercaderia/transferencia" titulo="Transferir" detalle="Mandar a otra sucursal o depósito" />
        <Atajo href="/etiquetas" titulo="Imprimir etiquetas" detalle="Código de barras y precio" />
      </div>

      {u.rol === 'admin' && pasos.some((p) => !p.hecho) && (
        <Tarjeta className="mt-5 p-5">
          <h2 className="font-semibold">Para empezar</h2>
          <ol className="mt-3 space-y-2">
            {pasos.map((p, i) => (
              <li key={p.href} className="flex items-center gap-3 text-sm">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${p.hecho ? 'bg-ok text-white' : 'bg-fondo text-tinta-suave'}`}
                >
                  {p.hecho ? '✓' : i + 1}
                </span>
                {p.hecho ? (
                  <span className="text-apagado line-through">{p.texto}</span>
                ) : (
                  <Link href={p.href} className="text-marca hover:underline">
                    {p.texto}
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </Tarjeta>
      )}
    </>
  )
}

function Dato({ titulo, valor, href, alerta }: { titulo: string; valor: number; href?: string; alerta?: boolean }) {
  const cuerpo = (
    <Tarjeta className={`h-full p-4 ${href ? 'transition-colors hover:border-marca/40' : ''}`}>
      <p className="text-xs text-tinta-suave">{titulo}</p>
      <p className={`num mt-1 text-2xl font-semibold ${alerta ? 'text-alerta' : ''}`}>{formatoEntero(valor)}</p>
    </Tarjeta>
  )
  return href ? <Link href={href}>{cuerpo}</Link> : cuerpo
}

function Atajo({ href, titulo, detalle }: { href: string; titulo: string; detalle: string }) {
  return (
    <Link href={href} className="group flex items-center justify-between rounded-xl border border-linea bg-papel px-4 py-3 transition-colors hover:border-marca/40">
      <span>
        <span className="block text-sm font-medium group-hover:text-marca">{titulo}</span>
        <span className="block text-xs text-apagado">{detalle}</span>
      </span>
      <span className="text-apagado group-hover:text-marca" aria-hidden>
        →
      </span>
    </Link>
  )
}
