import Link from 'next/link'
import { db } from '@/lib/db'
import { puede, puedeVender, requerirUsuario } from '@/lib/dal'
import { formatoEntero, formatoPesos } from '@/lib/formato'
import { cajaAbierta, resumenCaja } from '@/lib/ventas'
import { Etiqueta, Tarjeta, TituloTarjeta, Vacio } from '@/components/ui'
import { Icono } from './navegacion'

const hora = (d: Date) => d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Argentina/Buenos_Aires' })

export default async function InicioPage() {
  const u = await requerirUsuario()
  const sql = db()
  const esAdmin = u.rol === 'admin'
  const vende = puedeVender(u)
  const hoy = sql`v.creado >= (now() at time zone 'America/Argentina/Buenos_Aires')::date::timestamp at time zone 'America/Argentina/Buenos_Aires'`
  const deSucursal = esAdmin ? sql`` : sql`and s.id = ${u.sucursal_id}`

  const [conteos, porSucursal, reponer, abiertas, caja] = await Promise.all([
    sql<{ productos: number; sucursales: number; usuarios: number }[]>`
      select (select count(*)::int from productos where activo) as productos,
             (select count(*)::int from sucursales where activa) as sucursales,
             (select count(*)::int from usuarios where activo) as usuarios`,
    sql<{ id: number; nombre: string; ventas: number; total: number }[]>`
      select s.id, s.nombre, count(v.id)::int as ventas, coalesce(sum(v.total), 0) as total
      from sucursales s left join ventas v on v.sucursal_id = s.id and v.estado = 'completada' and ${hoy}
      where s.activa ${deSucursal}
      group by s.id order by total desc, s.nombre`,
    // Lo que quedó en el mínimo o menos en el local de cada sucursal.
    sql<{ id: number; nombre: string; sucursal: string; cantidad: number; stock_minimo: number }[]>`
      select p.id, p.nombre, s.nombre as sucursal, coalesce(st.cantidad, 0)::int as cantidad, p.stock_minimo
      from productos p
      cross join sucursales s
      join depositos d on d.sucursal_id = s.id and d.es_principal and d.activo
      left join stock st on st.producto_id = p.id and st.deposito_id = d.id
      where p.activo and s.activa ${deSucursal} and p.stock_minimo > 0 and coalesce(st.cantidad, 0) <= p.stock_minimo
      order by coalesce(st.cantidad, 0) - p.stock_minimo, p.nombre
      limit 8`,
    esAdmin
      ? sql<{ id: number; usuario: string; sucursal: string; abierta: Date }[]>`
          select c.id, us.nombre as usuario, s.nombre as sucursal, c.abierta
          from cajas c join usuarios us on us.id = c.usuario_id join sucursales s on s.id = c.sucursal_id
          where c.cerrada is null order by c.abierta`
      : [],
    cajaAbierta(sql, u.id),
  ])
  const r = conteos[0]
  const [{ pedidosAbiertos, porRecibir }] = await sql<{ pedidosAbiertos: number; porRecibir: number }[]>`
    select (select count(*)::int from pedidos where estado in ('pendiente', 'parcial')) as "pedidosAbiertos",
      (select count(*)::int from envios e join depositos d on d.id = e.destino_id
        where e.estado = 'en_camino' ${esAdmin ? sql`` : sql`and d.sucursal_id = ${u.sucursal_id}`}) as "porRecibir"`
  const resumen = caja ? await resumenCaja(sql, caja.id) : null
  const totalHoy = porSucursal.reduce((a, s) => a + Number(s.total), 0)
  const ventasHoy = porSucursal.reduce((a, s) => a + s.ventas, 0)
  const primerNombre = u.nombre.split(' ')[0]
  const fechaLarga = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Argentina/Buenos_Aires' })
  const pasos = [
    { hecho: r.sucursales > 0, texto: 'Crear las sucursales y sus depósitos', href: '/sucursales' },
    { hecho: r.usuarios > 1, texto: 'Sumar al personal de cada sucursal', href: '/usuarios' },
    { hecho: r.productos > 0, texto: 'Importar los productos desde Dux', href: '/importar' },
  ]
  // Cajas abiertas desde antes de hoy: probablemente alguien se olvidó de cerrarlas.
  const inicioHoy = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }) + 'T00:00:00-03:00')

  return (
    <>
      <section className="relative isolate overflow-hidden rounded-2xl bg-negro px-5 py-6 text-white shadow-[0_12px_32px_rgb(17_19_18/0.16)] sm:px-7 sm:py-7">
        <div className="pointer-events-none absolute -right-8 -top-24 -z-10 h-64 w-64 rounded-full border border-white/10" />
        <div className="pointer-events-none absolute -right-1 -top-16 -z-10 h-48 w-48 rounded-full border border-white/10" />
        <p className="text-[10px] font-bold tracking-[.18em] text-acento">OPERACIÓN DIARIA <span className="mx-1.5 text-white/30">/</span> {fechaLarga}</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-.035em] sm:text-[2.25rem]">Hola, {primerNombre}</h1>
        <p className="mt-1.5 text-sm text-white/70">{esAdmin ? 'Un vistazo a la operación de todas tus sucursales.' : `Resumen de hoy en ${u.sucursal_nombre}.`}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-white/90"><span className="h-1.5 w-1.5 rounded-full bg-acento" />{formatoEntero(r.productos)} productos activos</span>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-white/90">{formatoEntero(esAdmin ? r.sucursales : 1)} {esAdmin ? 'sucursales' : 'sucursal'}</span>
        </div>
      </section>

      {porRecibir > 0 && !esAdmin && (
        <Link
          href="/envios"
          className="mt-5 flex items-center justify-between gap-4 rounded-xl border border-alerta/30 bg-alerta-claro px-5 py-4 hover:border-alerta/60"
        >
          <span>
            <span className="block font-semibold text-alerta">
              Tenés {porRecibir} envío{porRecibir === 1 ? '' : 's'} en camino
            </span>
            <span className="block text-sm text-tinta-suave">Cuando llegue, contalo y confirmá la recepción para que entre al stock.</span>
          </span>
          <Icono nombre="envios" className="h-7 w-7 shrink-0 text-alerta" />
        </Link>
      )}

      {vende && !esAdmin && !caja && (
        <Link
          href="/vender"
          className="mt-5 flex items-center justify-between gap-4 rounded-xl bg-marca px-5 py-4 text-white shadow-sm hover:bg-marca-oscura"
        >
          <span>
            <span className="block font-semibold">Abrí tu caja para empezar a vender</span>
            <span className="block text-sm text-white/80">Contá el efectivo para dar cambio y cargalo.</span>
          </span>
          <Icono nombre="caja" className="h-7 w-7 shrink-0" />
        </Link>
      )}

      <Tarjeta className="mt-5 p-4 sm:p-5">
        <p className="mb-3 text-[10px] font-bold tracking-[.15em] text-apagado">CONSULTA RÁPIDA DE PRODUCTOS</p>
        <form action="/productos" className="flex flex-col gap-3 sm:flex-row">
          <label className="sr-only" htmlFor="consulta">
            Consultar precio
          </label>
          <input
            id="consulta"
            name="q"
            autoFocus
            autoComplete="off"
            placeholder="Escaneá o escribí para ver precio y stock"
            className="h-14 flex-1 rounded-xl border border-linea bg-fondo px-4 text-lg placeholder:text-base placeholder:text-apagado focus:border-marca focus:bg-papel focus:outline-none focus:ring-4 focus:ring-marca/10"
          />
          <button className="h-14 rounded-xl bg-marca px-6 font-semibold text-white hover:bg-marca-oscura">Consultar</button>
        </form>
      </Tarjeta>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {vende && <Atajo icono="vender" href="/vender" titulo="Vender" detalle={caja ? `Tu caja está abierta desde las ${hora(caja.abierta)}` : 'Abrir la caja y cobrar'} />}
        {puede(u, 'ingreso') && <Atajo icono="ingreso" href="/mercaderia/ingreso" titulo="Ingresar mercadería" detalle="Llegó un pedido" />}
        {puede(u, 'envios') ? (
          <Atajo icono="pedidos" href="/pedidos" titulo="Pedidos" detalle={pedidosAbiertos ? `${pedidosAbiertos} para preparar` : 'Sin pedidos pendientes'} />
        ) : puede(u, 'pedidos') ? (
          <Atajo icono="pedidos" href="/pedidos/nuevo" titulo="Pedir al depósito" detalle="Lo que te falta en la sucursal" />
        ) : null}
        <Atajo icono="envios" href="/envios" titulo="Envíos" detalle={porRecibir ? `${porRecibir} en camino para recibir` : 'Armar o recibir mercadería'} />
        <Atajo icono="etiquetas" href="/etiquetas" titulo="Imprimir etiquetas" detalle="Código de barras y precio" />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        {vende && (
        <Tarjeta>
          <TituloTarjeta acciones={<Link href="/ventas" className="text-xs font-semibold text-marca hover:underline">Ver ventas →</Link>}>Ventas de hoy</TituloTarjeta>
          <div className="p-5">
            <p className="text-sm text-tinta-suave">{esAdmin ? 'Vendido hoy en todas las sucursales' : `Vendido hoy en ${u.sucursal_nombre}`}</p>
            <p className="num mt-2 text-4xl font-bold tracking-[-.04em] text-marca" data-testid="vendido-hoy">
              {formatoPesos(Math.round(totalHoy * 100) / 100)}
            </p>
            <p className="text-sm text-apagado">
              {formatoEntero(ventasHoy)} venta{ventasHoy === 1 ? '' : 's'}
            </p>
            {esAdmin && porSucursal.length > 1 && (
              <ul className="mt-4 space-y-2">
                {porSucursal.map((s) => {
                  const pct = totalHoy > 0 ? (Number(s.total) / totalHoy) * 100 : 0
                  return (
                    <li key={s.id} className="text-sm">
                      <div className="flex justify-between">
                        <span>{s.nombre}</span>
                        <span className="num">{formatoPesos(Number(s.total))}</span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-fondo">
                        <div className="h-1.5 rounded-full bg-marca" style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
            {resumen && (
              <div className="mt-4 rounded-lg bg-fondo p-3 text-sm">
                <div className="flex justify-between">
                  <span>Tu caja ({caja!.sucursal})</span>
                  <span className="num font-medium">{formatoPesos(resumen.total)}</span>
                </div>
                <div className="flex justify-between text-tinta-suave">
                  <span>Efectivo que tiene que haber</span>
                  <span className="num">{formatoPesos(resumen.efectivoEsperado)}</span>
                </div>
              </div>
            )}
          </div>
        </Tarjeta>
        )}

        <Tarjeta className="overflow-hidden">
          <TituloTarjeta acciones={<Link href="/productos?estado=stock-bajo" className="text-xs text-marca hover:underline">Ver todos</Link>}>
            Para reponer
          </TituloTarjeta>
          {reponer.length === 0 ? (
            <Vacio>Nada por debajo del stock mínimo.</Vacio>
          ) : (
            <ul className="divide-y divide-linea">
              {reponer.map((p, i) => (
                <li key={`${p.id}-${i}`} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                  <span className="min-w-0">
                    <Link href={`/productos/${p.id}`} className="block truncate hover:text-marca hover:underline">
                      {p.nombre}
                    </Link>
                    {esAdmin && <span className="text-xs text-apagado">{p.sucursal}</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-xs text-apagado">mín. {p.stock_minimo}</span>
                    <Etiqueta tono="alerta">{formatoEntero(p.cantidad)}</Etiqueta>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
      </div>

      {esAdmin && vende && abiertas.length > 0 && (
        <Tarjeta className="mt-5">
          <TituloTarjeta>Cajas abiertas</TituloTarjeta>
          <ul className="divide-y divide-linea">
            {abiertas.map((c) => {
              const vieja = c.abierta < inicioHoy
              return (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-sm">
                  <Link href={`/caja/${c.id}`} className="hover:text-marca hover:underline">
                    {c.usuario} <span className="text-tinta-suave">en {c.sucursal}</span>
                  </Link>
                  <span className="flex items-center gap-2 text-tinta-suave">
                    {vieja ? <Etiqueta tono="alerta">Abierta desde el {c.abierta.toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}</Etiqueta> : `desde las ${hora(c.abierta)}`}
                  </span>
                </li>
              )
            })}
          </ul>
        </Tarjeta>
      )}

      {puede(u, 'configuracion') && pasos.some((p) => !p.hecho) && (
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

function Atajo({ href, titulo, detalle, icono }: { href: string; titulo: string; detalle: string; icono: Parameters<typeof Icono>[0]['nombre'] }) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-linea bg-papel px-4 py-3 shadow-[0_1px_2px_rgb(27_34_48/0.04)] transition-colors hover:border-marca/40"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-marca-clara text-marca">
        <Icono nombre={icono} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold group-hover:text-marca">{titulo}</span>
        <span className="block text-xs text-tinta-suave">{detalle}</span>
      </span>
    </Link>
  )
}
