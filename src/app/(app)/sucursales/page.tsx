import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { requerirAdmin } from '@/lib/dal'
import { formatoEntero } from '@/lib/formato'
import { Encabezado, Etiqueta, Tarjeta, Vacio } from '@/components/ui'
import { marcarPrincipal } from './actions'
import { EditarDeposito, EditarSucursal, NuevaSucursal, NuevoDeposito } from './formularios'

export const metadata: Metadata = { title: 'Sucursales y depósitos' }

type Deposito = { id: number; nombre: string; sucursal_id: number | null; es_principal: boolean; activo: boolean; unidades: number }
type Sucursal = { id: number; nombre: string; direccion: string | null; activa: boolean; tipo: 'local' | 'online' | 'deposito'; usuarios: number }

export default async function SucursalesPage() {
  await requerirAdmin()
  const [sucursales, depositos] = await Promise.all([
    db()<Sucursal[]>`
      select s.*, (select count(*)::int from usuarios u where u.sucursal_id = s.id and u.activo) as usuarios
      from sucursales s order by s.activa desc, s.nombre`,
    db()<Deposito[]>`
      select d.id, d.nombre, d.sucursal_id, d.es_principal, d.activo,
             coalesce((select sum(cantidad) from stock where deposito_id = d.id), 0)::int as unidades
      from depositos d where not d.es_transito order by d.es_principal desc, d.activo desc, d.nombre`,
  ])
  const centrales = depositos.filter((d) => d.sucursal_id === null)

  return (
    <>
      <Encabezado
        titulo="Sucursales y depósitos"
        detalle="Cada sucursal tiene un depósito principal, del que se descuentan sus ventas. Podés sumar depósitos extra o centrales."
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-5">
          {sucursales.length === 0 && (
            <Tarjeta>
              <Vacio>Todavía no hay sucursales. Creá la primera con el formulario.</Vacio>
            </Tarjeta>
          )}
          {sucursales.map((s) => (
            <Tarjeta key={s.id} className={s.activa ? '' : 'opacity-70'}>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-linea px-5 py-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold">{s.nombre}</h2>
                    {s.tipo !== 'local' && <Etiqueta tono="marca">{s.tipo === 'deposito' ? 'Depósito central' : 'Online'}</Etiqueta>}
                    {!s.activa && <Etiqueta tono="apagado">Inactiva</Etiqueta>}
                  </div>
                  <p className="mt-0.5 text-sm text-tinta-suave">
                    {s.direccion || 'Sin dirección'} · {s.usuarios} persona{s.usuarios === 1 ? '' : 's'}
                  </p>
                </div>
                <EditarSucursal sucursal={s} />
              </div>
              <ListaDepositos depositos={depositos.filter((d) => d.sucursal_id === s.id)} />
              <div className="border-t border-linea px-5 py-3">
                <NuevoDeposito sucursalId={s.id} />
              </div>
            </Tarjeta>
          ))}

          <Tarjeta>
            <div className="border-b border-linea px-5 py-4">
              <h2 className="font-semibold">Depósitos centrales</h2>
              <p className="mt-0.5 text-sm text-tinta-suave">No pertenecen a ninguna sucursal. Desde acá se reparte mercadería.</p>
            </div>
            {centrales.length ? <ListaDepositos depositos={centrales} /> : <Vacio>No hay depósitos centrales.</Vacio>}
            <div className="border-t border-linea px-5 py-3">
              <NuevoDeposito sucursalId={null} />
            </div>
          </Tarjeta>
        </div>

        <div>
          <NuevaSucursal />
        </div>
      </div>
    </>
  )
}

function ListaDepositos({ depositos }: { depositos: Deposito[] }) {
  return (
    <ul className="divide-y divide-linea">
      {depositos.map((d) => (
        <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className={`text-sm ${d.activo ? '' : 'text-apagado line-through'}`}>{d.nombre}</span>
            {d.es_principal && <Etiqueta tono="marca">Principal</Etiqueta>}
            {!d.activo && <Etiqueta tono="apagado">Inactivo</Etiqueta>}
          </div>
          <div className="flex items-center gap-2">
            <span className="num mr-2 text-sm text-tinta-suave">{formatoEntero(d.unidades)} u.</span>
            {!d.es_principal && d.activo && d.sucursal_id !== null && (
              <form action={marcarPrincipal}>
                <input type="hidden" name="id" value={d.id} />
                <button className="rounded-md px-2 py-1 text-xs text-marca hover:bg-marca-clara">Hacer principal</button>
              </form>
            )}
            <EditarDeposito deposito={d} />
          </div>
        </li>
      ))}
    </ul>
  )
}
