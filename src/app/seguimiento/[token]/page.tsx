import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { leerAjustes, urlLogo } from '@/lib/ajustes'
import { formatoPesos } from '@/lib/formato'
import { estadoVisible, leerReparacion, numeroReparacion } from '@/lib/reparaciones'

export const metadata: Metadata = { title: 'Seguimiento de tu reparación', robots: { index: false, follow: false } }

const fechaHora = (d: Date) =>
  new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d)

/** Página pública para el cliente: el estado de su equipo, sin datos de otros ni importes internos. */
export default async function SeguimientoPage(props: PageProps<'/seguimiento/[token]'>) {
  const token = (await props.params).token
  if (!/^[\w-]{16,64}$/.test(token)) notFound()
  const sql = db()
  const [r, ajustes] = await Promise.all([leerReparacion(sql, { token }), leerAjustes()])
  if (!r) notFound()
  // Solo los pasos del taller (no las notas internas).
  const pasos = await sql<{ creado: Date; texto: string }[]>`
    select ev.creado, coalesce(e.nombre, case ev.estado
        when 'ingresado' then 'Ingreso a sucursal' when 'en_reparacion' then 'En reparación' when 'listo' then 'Listo para retirar'
        when 'sin_reparacion' then 'Sin reparación: listo para retirar' when 'entregado' then 'Entregado' when 'cancelado' then 'Cancelado' else ev.estado end) as texto
    from reparacion_eventos ev left join reparacion_etapas e on e.id = ev.etapa_id
    where ev.reparacion_id = ${r.id} and ev.estado <> 'nota'
    order by ev.creado, ev.id`
  const logo = urlLogo(ajustes)
  const listo = r.estado === 'listo' || r.estado === 'sin_reparacion'
  const visibles = pasos.filter((p, i) => i === 0 || p.texto !== pasos[i - 1].texto)

  return (
    <main className="min-h-screen bg-fondo px-4 py-8">
      <div className="mx-auto max-w-md space-y-5">
        <header className="text-center">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt={ajustes.nombre_negocio} className="mx-auto h-12 w-auto object-contain" />
          ) : (
            <p className="text-2xl font-bold">{ajustes.nombre_negocio}</p>
          )}
          <p className="mt-1 text-sm text-tinta-suave">Servicio técnico</p>
        </header>
        <section className="rounded-2xl border border-linea bg-papel p-5 shadow-sm">
          <p className="text-xs font-semibold tracking-wide text-apagado uppercase">Reparación {numeroReparacion(r.id)}</p>
          <h1 className="mt-1 text-xl font-bold">{r.equipo}</h1>
          <p className="text-sm text-tinta-suave">Hola {r.cliente_nombre.split(' ')[0]}, este es el estado de tu equipo.</p>
          <div className={`mt-4 rounded-xl px-4 py-3 ${listo ? 'bg-ok-claro text-ok' : r.estado === 'entregado' ? 'bg-fondo text-tinta' : 'bg-marca-clara text-marca-oscura'}`}>
            <p className="text-xs font-medium uppercase">Estado actual</p>
            <p className="text-lg font-bold">{estadoVisible(r)}</p>
            {listo && (
              <p className="mt-1 text-sm">
                Podés retirarlo en {r.sucursal}
                {r.sucursal_direccion && r.sucursal_direccion !== r.sucursal ? ` (${r.sucursal_direccion})` : ''}
                {r.estado === 'listo' && r.precio ? `. Total: ${formatoPesos(r.precio)}` : ''}.
              </p>
            )}
          </div>
          {r.estado !== 'entregado' && r.estado !== 'cancelado' && !listo && r.prometido && (
            <p className="mt-3 text-sm text-tinta-suave">Fecha estimada: {r.prometido}</p>
          )}
        </section>
        <section className="rounded-2xl border border-linea bg-papel p-5 shadow-sm">
          <h2 className="mb-3 font-semibold">Historial</h2>
          <ol className="relative space-y-4 border-l-2 border-linea pl-5">
            {visibles.map((p, i) => (
              <li key={i} className="relative">
                <span className={`absolute top-1 -left-[27px] h-3 w-3 rounded-full ${i === visibles.length - 1 ? 'bg-marca' : 'bg-linea'}`} />
                <p className={`text-sm ${i === visibles.length - 1 ? 'font-semibold' : ''}`}>{p.texto}</p>
                <p className="text-xs text-apagado">{fechaHora(p.creado)}</p>
              </li>
            ))}
          </ol>
        </section>
        <p className="text-center text-xs text-apagado">
          Ingresó el {fechaHora(r.creado)} en {r.sucursal}. Ante cualquier duda, comunicate con la sucursal con tu número de orden.
        </p>
      </div>
    </main>
  )
}
