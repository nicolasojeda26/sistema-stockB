import type { Metadata } from 'next'
import { requerirUsuario } from '@/lib/dal'
import { PERMISOS } from '@/lib/permisos'
import { Encabezado } from '@/components/ui'
import { GuiaCompleta } from './guia'

export const metadata: Metadata = { title: 'Guía del sistema' }

export default async function GuiaPage() {
  const u = await requerirUsuario()
  const mios = PERMISOS.filter((p) => u.permisos.includes(p.clave)).map((p) => p.texto)
  const lugar = u.rol === 'admin' ? 'todas las sucursales' : (u.sucursal_nombre ?? '')

  return (
    <>
      <Encabezado
        titulo="Guía del sistema"
        detalle="Cómo usar cada parte del sistema, paso a paso, con ejemplos reales del día a día. Buscá lo que necesites o recorrela por secciones."
      />
      <GuiaCompleta
        permisos={u.permisos}
        rol={u.rol_nombre}
        lugar={lugar}
        mios={mios}
        descuentos={
          u.permisos.includes('vender') || u.permisos.includes('reparaciones')
            ? u.permisos.includes('descuento_libre')
              ? { productos: 100, reparaciones: 100 }
              : { productos: Number(u.descuento_max), reparaciones: Number(u.descuento_max_reparacion) }
            : null
        }
      />
    </>
  )
}
