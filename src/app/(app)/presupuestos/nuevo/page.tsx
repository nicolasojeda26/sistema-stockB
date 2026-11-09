import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { requerirUsuario } from '@/lib/dal'
import { Encabezado } from '@/components/ui'
import { FormPresupuesto } from '../form-presupuesto'

export const metadata: Metadata = { title: 'Nuevo presupuesto' }

export default async function NuevoPresupuestoPage() {
  const u = await requerirUsuario()
  const [sucursales, clientes] = await Promise.all([
    u.rol === 'admin'
      ? db()<{ id: number; nombre: string }[]>`select id, nombre from sucursales where activa order by nombre`
      : db()<{ id: number; nombre: string }[]>`select id, nombre from sucursales where activa and id = ${u.sucursal_id}`,
    db()<{ id: number; nombre: string }[]>`select id, nombre from clientes where activo order by lower(nombre) limit 500`,
  ])

  return (
    <>
      <Encabezado titulo="Nuevo presupuesto" detalle="Armá una propuesta para el cliente. Guardarla no modifica el stock ni la caja." />
      <FormPresupuesto sucursales={sucursales} sucursalPropia={u.rol === 'admin' ? null : u.sucursal_id} clientes={clientes} />
    </>
  )
}
