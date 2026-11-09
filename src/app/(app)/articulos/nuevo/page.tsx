import type { Metadata } from 'next'
import { db } from '@/lib/db'
import { requerirAdmin } from '@/lib/dal'
import { leerAjustes } from '@/lib/ajustes'
import { ordenTalle, parsearCurvas, separarLista } from '@/lib/articulos'
import { Encabezado } from '@/components/ui'
import { FormArticulo } from './form-articulo'

export const metadata: Metadata = { title: 'Nuevo artículo' }

export default async function NuevoArticuloPage() {
  await requerirAdmin()
  const [categorias, ajustes] = await Promise.all([
    db()<{ id: number; nombre: string }[]>`select id, nombre from categorias where activa order by lower(nombre)`,
    leerAjustes(),
  ])
  return (
    <>
      <Encabezado
        titulo="Nuevo producto con variantes"
        detalle="Cargás el producto una sola vez y el sistema crea cada modelo y color con su código y su stock."
      />
      <FormArticulo
        categorias={categorias}
        curvas={parsearCurvas(ajustes.curvas_talles)}
        tallesSugeridos={[...new Set(parsearCurvas(ajustes.curvas_talles).flatMap((c) => c.talles))].sort((a, b) => ordenTalle(a) - ordenTalle(b))}
        colores={separarLista(ajustes.colores_frecuentes)}
      />
    </>
  )
}
