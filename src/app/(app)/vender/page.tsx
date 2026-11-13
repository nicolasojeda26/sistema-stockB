import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { puede, requerirVendedor } from '@/lib/dal'
import { cajaAbierta } from '@/lib/ventas'
import { descuentosPago, leerAjustes } from '@/lib/ajustes'
import { Encabezado, Tarjeta, TituloTarjeta } from '@/components/ui'
import { AperturaCaja } from './apertura'
import { PuntoDeVenta } from './punto-de-venta'
import { buscarReparaciones } from './actions'

export const metadata: Metadata = { title: 'Vender' }

export default async function VenderPage(props: PageProps<'/vender'>) {
  const u = await requerirVendedor()
  const caja = await cajaAbierta(db(), u.id)

  if (!caja) {
    const sucursales =
      u.rol === 'admin' ? await db()<{ id: number; nombre: string }[]>`select id, nombre from sucursales where activa order by nombre` : []
    return (
      <>
        <Encabezado titulo="Vender" detalle="Para empezar a vender, abrí tu caja con el efectivo que hay para dar cambio." />
        <Tarjeta className="max-w-md">
          <TituloTarjeta>Abrir caja</TituloTarjeta>
          <AperturaCaja sucursales={sucursales} sucursalPropia={u.sucursal_nombre} />
        </Tarjeta>
      </>
    )
  }

  // "Cobrar en la caja" desde una reparación.
  const idRep = Number((await props.searchParams).reparacion)
  const reparacionInicial =
    Number.isInteger(idRep) && idRep > 0 ? ((await buscarReparaciones(String(idRep))).reparaciones.find((r) => r.reparacionId === idRep) ?? null) : null
  const [{ descuento_max }] = await db()<{ descuento_max: number }[]>`select descuento_max from usuarios where id = ${u.id}`
  return (
    <PuntoDeVenta
      usuarioId={u.id}
      sucursal={caja.sucursal}
      abierta={caja.abierta.toISOString()}
      descuentoMax={puede(u, 'descuento_libre') ? 100 : Number(descuento_max)}
      descuentos={descuentosPago(await leerAjustes())}
      reparacionInicial={reparacionInicial}
    />
  )
}
