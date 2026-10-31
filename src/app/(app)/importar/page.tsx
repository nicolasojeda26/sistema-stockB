import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { requerirAdmin } from '@/lib/dal'
import { Encabezado } from '@/components/ui'
import { Importador } from './importador'

export const metadata: Metadata = { title: 'Importar desde Dux' }

export default async function ImportarPage() {
  await requerirAdmin()
  const depositos = await db()<{ id: number; nombre: string }[]>`
    select d.id, coalesce(s.nombre || ' · ', 'Central · ') || d.nombre as nombre
    from depositos d left join sucursales s on s.id = d.sucursal_id
    where d.activo and (s.id is null or s.activa)
    order by s.nombre nulls last, d.es_principal desc, d.nombre`
  return (
    <>
      <Encabezado
        titulo="Importar desde Dux"
        detalle="Subí el Excel de productos exportado de Dux (o cualquier planilla con código, nombre y precio). Primero ves una vista previa; nada se guarda hasta que confirmás."
      />
      <Importador depositos={depositos} />
    </>
  )
}
