import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { requerirPermiso } from '@/lib/dal'
import { leerAjustes } from '@/lib/ajustes'
import { BotonLink, Encabezado, Tarjeta } from '@/components/ui'
import { FormReparacion } from './form'

export const metadata: Metadata = { title: 'Recibir un equipo' }

export default async function NuevaReparacionPage(props: PageProps<'/reparaciones/nueva'>) {
  const u = await requerirPermiso('reparaciones')
  const sp = await props.searchParams
  const [sucursales, ajustes, precios] = await Promise.all([
    u.rol === 'admin' ? db()<{ id: number; nombre: string }[]>`select id, nombre from sucursales where activa and tipo <> 'deposito' order by nombre` : [],
    leerAjustes(),
    db()<{ modelo: string; tipo: string; precio: number }[]>`
      select modelo, tipo, precio::float as precio from reparacion_precios where activo order by lower(modelo), lower(tipo) limit 5000`,
  ])
  // Reingreso por garantía: se abre desde la reparación anterior con sus datos.
  const garantiaDe = Number(sp.garantia) || null
  const [anterior] = garantiaDe
    ? await db()<{ id: number; cliente_nombre: string; cliente_telefono: string | null; cliente_dni: string | null; equipo: string; imei: string | null; tipo_reparacion: string | null }[]>`
        select id, cliente_nombre, cliente_telefono, cliente_dni, equipo, imei, tipo_reparacion from reparaciones
        where id = ${garantiaDe} and estado = 'entregado' ${u.rol === 'admin' ? db()`` : db()`and sucursal_id = ${u.sucursal_id}`}`
    : []
  // Modelos frecuentes (de Ajustes) para sugerir al escribir el equipo.
  const modelos = ajustes.curvas_talles
    .split('\n')
    .flatMap((l) => {
      const [marca, lista] = l.split(':')
      if (!lista || /^\s*único\s*$/i.test(marca)) return []
      return lista.split(',').map((m) => `${marca.trim()} ${m.trim()}`)
    })
    .filter(Boolean)
  const todosModelos = [...new Set([...precios.map((p) => p.modelo), ...modelos])]
  return (
    <>
      <Encabezado
        titulo="Recibir un equipo"
        detalle="Cargá el equipo y la falla. Al guardar se imprime el comprobante para el cliente."
        acciones={
          <BotonLink href="/reparaciones" variante="secundario">
            ← Reparaciones
          </BotonLink>
        }
      />
      <Tarjeta className="max-w-3xl">
        <FormReparacion
          sucursales={sucursales}
          sucursalPropia={u.rol === 'admin' ? null : u.sucursal_nombre}
          modelos={todosModelos}
          precios={precios}
          anterior={anterior ?? null}
        />
      </Tarjeta>
    </>
  )
}
