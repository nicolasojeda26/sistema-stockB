import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { puede, requerirUsuario } from '@/lib/dal'
import { formatoFecha } from '@/lib/formato'
import { Aviso, Campo, Encabezado, Input, Select, Tarjeta, Vacio } from '@/components/ui'
import { actualizarSolicitud, crearSolicitud } from './actions'

export const metadata: Metadata = { title: 'Ayuda y solicitudes' }

const TIPOS = { ayuda: 'Ayuda', informe: 'Informe', mejora: 'Mejora' }
const ESTADOS = { pendiente: 'Pendiente', en_curso: 'En curso', resuelta: 'Resuelta' }

export default async function SolicitudesPage() {
  const u = await requerirUsuario()
  const filas = puede(u, 'solicitudes')
    ? await db()<{ id: number; tipo: keyof typeof TIPOS; asunto: string; detalle: string; estado: keyof typeof ESTADOS; respuesta: string | null; creado: Date; usuario: string; sucursal: string | null }[]>`
        select x.*, u.nombre as usuario, s.nombre as sucursal from solicitudes x join usuarios u on u.id = x.usuario_id left join sucursales s on s.id = x.sucursal_id order by case x.estado when 'pendiente' then 0 when 'en_curso' then 1 else 2 end, x.creado desc limit 300`
    : await db()<{ id: number; tipo: keyof typeof TIPOS; asunto: string; detalle: string; estado: keyof typeof ESTADOS; respuesta: string | null; creado: Date; usuario: string; sucursal: string | null }[]>`
        select x.*, u.nombre as usuario, s.nombre as sucursal from solicitudes x join usuarios u on u.id = x.usuario_id left join sucursales s on s.id = x.sucursal_id where x.usuario_id = ${u.id} order by x.creado desc limit 100`

  return <>
    <Encabezado titulo="Ayuda y solicitudes" detalle={puede(u, 'solicitudes') ? 'Gestioná las consultas, pedidos de informes y mejoras del equipo.' : 'Pedí ayuda o solicitá un informe o mejora para el sistema.'} />
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="space-y-3">
        {filas.length === 0 ? <Tarjeta><Vacio>Aún no hay solicitudes.</Vacio></Tarjeta> : filas.map((x) => <Tarjeta key={x.id} className="space-y-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><span className="text-xs font-semibold uppercase tracking-wide text-marca">{TIPOS[x.tipo]}</span><h2 className="mt-1 font-semibold">{x.asunto}</h2></div><span className="rounded-full bg-fondo px-3 py-1 text-xs font-semibold">{ESTADOS[x.estado]}</span></div>
          <p className="whitespace-pre-wrap text-sm text-tinta-suave">{x.detalle}</p>
          <p className="text-xs text-apagado">{formatoFecha(x.creado)} · {x.usuario}{x.sucursal ? ` · ${x.sucursal}` : ''}</p>
          {x.respuesta && <Aviso tipo="info"><span className="font-semibold">Respuesta:</span> {x.respuesta}</Aviso>}
          {puede(u, 'solicitudes') && <form action={actualizarSolicitud} className="grid gap-2 border-t border-linea pt-3 sm:grid-cols-[150px_1fr_auto]">
            <input type="hidden" name="id" value={x.id} />
            <Select name="estado" defaultValue={x.estado} aria-label="Estado"><option value="pendiente">Pendiente</option><option value="en_curso">En curso</option><option value="resuelta">Resuelta</option></Select>
            <Input name="respuesta" defaultValue={x.respuesta ?? ''} placeholder="Respuesta para el equipo" maxLength={2000} aria-label="Respuesta" />
            <button className="h-10 rounded-lg bg-tinta px-4 text-sm font-semibold text-white">Guardar</button>
          </form>}
        </Tarjeta>)}
      </section>
      <Tarjeta className="p-5">
        <h2 className="font-semibold">Nueva solicitud</h2>
        <p className="mt-1 mb-4 text-sm text-tinta-suave">Contanos qué necesitás y administración podrá darle seguimiento.</p>
        <form action={crearSolicitud} className="space-y-4">
          <Campo etiqueta="Tipo"><Select name="tipo"><option value="ayuda">Necesito ayuda</option><option value="informe">Solicitar un informe</option><option value="mejora">Sugerir una mejora</option></Select></Campo>
          <Campo etiqueta="Asunto"><Input name="asunto" required minLength={3} maxLength={120} /></Campo>
          <Campo etiqueta="Detalle"><textarea name="detalle" required minLength={5} maxLength={2000} rows={5} className="w-full rounded-lg border border-linea bg-papel px-3 py-2 text-sm text-tinta focus:border-marca focus:outline-none focus:ring-2 focus:ring-marca/15" /></Campo>
          <button className="h-10 w-full rounded-lg bg-marca px-4 text-sm font-semibold text-white">Enviar solicitud</button>
        </form>
      </Tarjeta>
    </div>
  </>
}
