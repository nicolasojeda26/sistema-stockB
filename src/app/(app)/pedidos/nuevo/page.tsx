import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { requerirUsuario } from '@/lib/dal'
import { Encabezado } from '@/components/ui'
import { FormPedido } from './form'

export const metadata: Metadata = { title: 'Nuevo pedido' }

export default async function NuevoPedidoPage() {
  const u = await requerirUsuario()
  if (u.rol === 'deposito') redirect('/pedidos')
  const sql = db()
  const [[central], sucursales] = await Promise.all([
    sql<{ id: number; nombre: string }[]>`
      select d.id, s.nombre from depositos d join sucursales s on s.id = d.sucursal_id
      where s.tipo = 'deposito' and s.activa and d.es_principal and d.activo order by s.id limit 1`,
    u.rol === 'admin' ? sql<{ id: number; nombre: string }[]>`select id, nombre from sucursales where activa and tipo <> 'deposito' order by nombre` : [],
  ])
  return (
    <>
      <Encabezado
        titulo="Nuevo pedido al depósito"
        detalle={`Cargá lo que te falta: le llega a ${central?.nombre ?? 'el depósito'} para que lo prepare y te lo mande.`}
      />
      <FormPedido centralId={central?.id ?? null} sucursales={sucursales} usuarioId={u.id} />
    </>
  )
}
