import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { requerirPermiso } from '@/lib/dal'
import { leerAjustes } from '@/lib/ajustes'
import { BotonLink, Encabezado, Tarjeta } from '@/components/ui'
import { FormReparacion } from './form'

export const metadata: Metadata = { title: 'Recibir un equipo' }

export default async function NuevaReparacionPage() {
  const u = await requerirPermiso('reparaciones')
  const [sucursales, ajustes] = await Promise.all([
    u.rol === 'admin' ? db()<{ id: number; nombre: string }[]>`select id, nombre from sucursales where activa and tipo <> 'deposito' order by nombre` : [],
    leerAjustes(),
  ])
  // Modelos frecuentes (de Ajustes) para sugerir al escribir el equipo.
  const modelos = ajustes.curvas_talles
    .split('\n')
    .flatMap((l) => {
      const [marca, lista] = l.split(':')
      if (!lista || /^\s*único\s*$/i.test(marca)) return []
      return lista.split(',').map((m) => `${marca.trim()} ${m.trim()}`)
    })
    .filter(Boolean)
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
        <FormReparacion sucursales={sucursales} sucursalPropia={u.rol === 'admin' ? null : u.sucursal_nombre} modelos={modelos} />
      </Tarjeta>
    </>
  )
}
