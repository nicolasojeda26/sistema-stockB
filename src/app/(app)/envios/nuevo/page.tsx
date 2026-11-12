import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { requerirPermiso } from '@/lib/dal'
import { depositosPara } from '@/lib/depositos'
import { Encabezado } from '@/components/ui'
import { FormEnvio } from './form'

export const metadata: Metadata = { title: 'Armar envío' }

export default async function NuevoEnvioPage(props: PageProps<'/envios/nuevo'>) {
  const u = await requerirPermiso('envios')
  const pedidoId = Number((await props.searchParams).pedido) || null
  const sql = db()
  const depositos = await depositosPara(u)
  const origenes = depositos.filter((d) => d.propio)
  // Origen sugerido: el depósito central si la usuaria puede usarlo; si no, el suyo.
  const [central] = await sql<{ id: number }[]>`
    select d.id from depositos d join sucursales s on s.id = d.sucursal_id where s.tipo = 'deposito' and d.es_principal and d.activo order by s.id limit 1`
  const origenInicial = origenes.find((d) => d.id === central?.id)?.id ?? origenes[0]?.id ?? null
  let pedido: { id: number; deposito_id: number; sucursal: string; items: { id: number; codigo: string; nombre: string; falta: number }[] } | null = null
  if (pedidoId) {
    const [p] = await sql<{ id: number; deposito_id: number; sucursal: string; estado: string }[]>`
      select p.id, p.deposito_id, s.nombre as sucursal, p.estado from pedidos p join sucursales s on s.id = p.sucursal_id where p.id = ${pedidoId}`
    if (p && (p.estado === 'pendiente' || p.estado === 'parcial')) {
      const items = await sql<{ id: number; codigo: string; nombre: string; falta: number }[]>`
        select pr.id, pr.codigo, pr.nombre, (pi.cantidad - pi.enviada)::int as falta
        from pedido_items pi join productos pr on pr.id = pi.producto_id
        where pi.pedido_id = ${p.id} and pi.enviada < pi.cantidad order by pr.nombre`
      pedido = { id: p.id, deposito_id: p.deposito_id, sucursal: p.sucursal, items }
    }
  }
  return (
    <>
      <Encabezado
        titulo={pedido ? `Armar envío del pedido N.º ${pedido.id}` : 'Armar envío'}
        detalle="Lo que mandás sale de tu stock y queda «en camino» hasta que la sucursal lo cuenta y confirma que llegó."
      />
      <FormEnvio
        origenes={origenes.map(({ id, nombre }) => ({ id, nombre }))}
        destinos={depositos.map(({ id, nombre }) => ({ id, nombre }))}
        origenInicial={origenInicial}
        pedido={pedido}
        usuarioId={u.id}
      />
    </>
  )
}
