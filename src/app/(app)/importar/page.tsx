import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { requerirAdmin } from '@/lib/dal'
import { Encabezado } from '@/components/ui'
import { Importador } from './importador'

export const metadata: Metadata = { title: 'Importar desde Dux' }

export default async function ImportarPage() {
  await requerirAdmin()
  const depositos = await db()<{ id: number; nombre: string; clave: string; central: boolean }[]>`
    select d.id, coalesce(s.nombre || ' · ', 'Central · ') || d.nombre as nombre,
      coalesce(s.direccion, '') as clave, (s.id is null or s.tipo = 'deposito') as central
    from depositos d left join sucursales s on s.id = d.sucursal_id
    where d.activo and not d.es_transito and (s.id is null or s.activa)
    order by s.nombre nulls last, d.es_principal desc, d.nombre`
  return (
    <>
      <Encabezado
        titulo="Importar desde Dux"
        detalle="Subí el Excel de Dux: la consulta de stock por depósito, la lista de precios o cualquier planilla con código y nombre. Primero ves una vista previa; nada se guarda hasta que confirmás."
      />
      <Importador depositos={depositos} />
    </>
  )
}
