import type { Metadata } from 'next'
import Link from 'next/link'
import { db } from '@/lib/db'
import { requerirPermiso } from '@/lib/dal'
import { leerAjustes } from '@/lib/ajustes'
import { BotonLink, Encabezado, Input, Tarjeta, TituloTarjeta } from '@/components/ui'
import {
  FormComprobantes,
  ListaEtapas,
  ListaTecnicos,
  NuevaEtapa,
  NuevoPrecio,
  NuevoTecnico,
  PegarPrecios,
  TablaPrecios,
  type EtapaFila,
  type PrecioFila,
  type TecnicoFila,
} from './formularios'

export const metadata: Metadata = { title: 'Configurar área técnica' }

const PESTANAS = [
  { clave: 'estados', texto: 'Estados del taller' },
  { clave: 'precios', texto: 'Lista de precios' },
  { clave: 'tecnicos', texto: 'Técnicos' },
  { clave: 'comprobantes', texto: 'Comprobantes y garantía' },
] as const

export default async function ConfigTallerPage(props: PageProps<'/reparaciones/configuracion'>) {
  await requerirPermiso('reparaciones_config')
  const sp = await props.searchParams
  const ver = PESTANAS.find((p) => p.clave === sp.ver)?.clave ?? 'estados'
  const q = typeof sp.q === 'string' ? sp.q.trim().slice(0, 60) : ''
  const sql = db()

  return (
    <>
      <Encabezado
        titulo="Configurar área técnica"
        detalle="Los estados que se informan al cliente, la lista de precios de reparación, los técnicos y los textos de los comprobantes."
        acciones={
          <BotonLink href="/reparaciones" variante="secundario">
            ← Reparaciones
          </BotonLink>
        }
      />
      <nav className="mb-5 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-linea [scrollbar-width:none]" aria-label="Secciones">
        {PESTANAS.map((p) => (
          <Link
            key={p.clave}
            href={`/reparaciones/configuracion?ver=${p.clave}`}
            aria-current={ver === p.clave ? 'page' : undefined}
            className={`-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium ${ver === p.clave ? 'border-marca text-marca' : 'border-transparent text-tinta-suave hover:text-tinta'}`}
          >
            {p.texto}
          </Link>
        ))}
      </nav>

      {ver === 'estados' && (
        <div className="max-w-3xl space-y-5">
          <Tarjeta>
            <TituloTarjeta>Estados, en el orden del proceso</TituloTarjeta>
            <ListaEtapas
              etapas={await sql<EtapaFila[]>`
                select e.*, (select count(*)::int from reparaciones r where r.etapa_id = e.id and r.estado in ('ingresado', 'en_reparacion', 'listo')) as usos
                from reparacion_etapas e order by e.orden, e.id`}
            />
          </Tarjeta>
          <Tarjeta>
            <NuevaEtapa />
          </Tarjeta>
          <p className="text-sm text-tinta-suave">
            Cada estado se ve en la ficha del equipo, en el enlace de seguimiento del cliente y en el mensaje de WhatsApp. Un estado desactivado deja de
            ofrecerse pero queda en el historial.
          </p>
        </div>
      )}

      {ver === 'tecnicos' && (
        <div className="max-w-2xl space-y-5">
          <Tarjeta>
            <TituloTarjeta>Técnicos</TituloTarjeta>
            <ListaTecnicos
              tecnicos={await sql<TecnicoFila[]>`
                select t.id, t.nombre, t.activo,
                  (select count(*)::int from reparaciones r where r.tecnico_id = t.id and r.listo_en is not null and r.motivo_cierre is null) as reparados
                from tecnicos t order by t.activo desc, lower(t.nombre)`}
            />
          </Tarjeta>
          <Tarjeta>
            <NuevoTecnico />
          </Tarjeta>
          <p className="text-sm text-tinta-suave">Los técnicos no necesitan usuario: quien informa el estado elige de esta lista quién lo reparó.</p>
        </div>
      )}

      {ver === 'precios' &&
        (async () => {
          const [precios, [{ total }], modelos, tipos] = await Promise.all([
            sql<PrecioFila[]>`
              select id, modelo, tipo, precio::float as precio, activo from reparacion_precios
              ${q ? sql`where modelo ilike ${'%' + q + '%'} or tipo ilike ${'%' + q + '%'}` : sql``}
              order by lower(modelo), lower(tipo) limit 500`,
            sql<{ total: number }[]>`select count(*)::int as total from reparacion_precios`,
            sql<{ v: string }[]>`select distinct modelo as v from reparacion_precios order by 1 limit 500`,
            sql<{ v: string }[]>`select distinct tipo as v from reparacion_precios order by 1 limit 200`,
          ])
          return (
            <div className="max-w-4xl space-y-5">
              <Tarjeta>
                <TituloTarjeta>Agregar precio</TituloTarjeta>
                <NuevoPrecio modelos={modelos.map((m) => m.v)} tipos={tipos.map((t) => t.v)} />
                <PegarPrecios />
              </Tarjeta>
              <Tarjeta>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-linea px-5 py-3">
                  <h2 className="font-semibold">
                    Precios cargados <span className="text-sm font-normal text-tinta-suave">({total})</span>
                  </h2>
                  <form className="flex gap-2">
                    <input type="hidden" name="ver" value="precios" />
                    <Input name="q" defaultValue={q} placeholder="Buscar modelo o reparación" aria-label="Buscar precio" className="w-60" />
                  </form>
                </div>
                <TablaPrecios precios={precios} />
              </Tarjeta>
              <p className="text-sm text-tinta-suave">
                Al recibir un equipo, si el modelo y el tipo de reparación coinciden con un precio de esta lista, el presupuesto se completa solo. Se
                puede cambiar a mano igual.
              </p>
            </div>
          )
        })()}

      {ver === 'comprobantes' && (
        <Tarjeta className="max-w-4xl">
          <FormComprobantes ajustes={await leerAjustes()} />
        </Tarjeta>
      )}
    </>
  )
}
