'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { requerirPermiso } from '@/lib/dal'
import { entero, marcado, mensajeError, texto } from '@/lib/errores'
import { centavos, parseNumero } from '@/lib/numeros'
import { nombreVariante, ordenTalle } from '@/lib/articulos'
import type { Resultado } from '@/components/form-accion'

export async function guardarProducto(_: Resultado, f: FormData): Promise<Resultado> {
  const u = await requerirPermiso('productos')
  const id = entero(f, 'id')
  const codigo = texto(f, 'codigo')
  let nombre = texto(f, 'nombre')
  let categoriaId = entero(f, 'categoria_id')
  // Variante de un artículo: el nombre y la categoría salen del artículo + talle + color.
  const [art] = id
    ? await db()<{ articulo_id: number; nombre: string; categoria_id: number | null }[]>`
        select p.articulo_id, a.nombre, a.categoria_id from productos p join articulos a on a.id = p.articulo_id where p.id = ${id}`
    : []
  const talle = texto(f, 'talle') || null
  const color = texto(f, 'color') || null
  if (art) {
    nombre = nombreVariante(art.nombre, color, talle)
    categoriaId = art.categoria_id
  }
  const costo = parseNumero(texto(f, 'costo') || '0')
  const precio = parseNumero(texto(f, 'precio'))
  const especial = (clave: string) => (texto(f, clave) ? parseNumero(texto(f, clave)) : null)
  const precioTransf = especial('precio_transferencia')
  const precioEfect = especial('precio_efectivo')
  const stockMinimo = parseNumero(texto(f, 'stock_minimo') || '0')
  const activo = id ? marcado(f, 'activo') : true

  const errores: Record<string, string> = {}
  if (!codigo) errores.codigo = 'Escaneá o escribí el código.'
  else if (codigo.length > 64) errores.codigo = 'El código es demasiado largo.'
  if (!nombre) errores.nombre = 'Poné el nombre del producto.'
  if (costo === null || costo < 0) errores.costo = 'Costo no válido.'
  if (precio === null || precio < 0) errores.precio = 'Poné el precio de venta.'
  if (texto(f, 'precio_transferencia') && (precioTransf === null || precioTransf < 0)) errores.precio_transferencia = 'Precio no válido.'
  if (texto(f, 'precio_efectivo') && (precioEfect === null || precioEfect < 0)) errores.precio_efectivo = 'Precio no válido.'
  if (stockMinimo === null || stockMinimo < 0 || !Number.isInteger(stockMinimo)) errores.stock_minimo = 'Tiene que ser un número entero.'
  if (Object.keys(errores).length) return { error: 'Revisá los campos marcados.', errores }

  let nuevoId = id
  try {
    nuevoId = await db().begin(async (tx) => {
      await tx`select set_config('app.usuario_id', ${String(u.id)}, true), set_config('app.origen', 'Edición del producto', true)`
      if (id) {
        await tx`
          update productos set codigo = ${codigo}, nombre = ${nombre}, categoria_id = ${categoriaId},
            costo = ${centavos(costo!)}, precio = ${centavos(precio!)}, stock_minimo = ${stockMinimo},
            precio_transferencia = ${precioTransf === null ? null : centavos(precioTransf)}, precio_efectivo = ${precioEfect === null ? null : centavos(precioEfect)},
            activo = ${activo}, actualizado = now()
            ${art ? tx`, talle = ${talle}, color = ${color}, orden_talle = ${ordenTalle(talle)}` : tx``}
          where id = ${id}`
        return id
      }
      const [p] = await tx<{ id: number }[]>`
        insert into productos (codigo, nombre, categoria_id, costo, precio, stock_minimo, precio_transferencia, precio_efectivo)
        values (${codigo}, ${nombre}, ${categoriaId}, ${centavos(costo!)}, ${centavos(precio!)}, ${stockMinimo},
          ${precioTransf === null ? null : centavos(precioTransf)}, ${precioEfect === null ? null : centavos(precioEfect)})
        returning id`
      return p.id
    })
  } catch (e) {
    if ((e as { constraint_name?: string }).constraint_name === 'productos_variante')
      return { error: 'Ya hay otra variante con ese modelo y color.', errores: { talle: 'Repetido' } }
    const msg = mensajeError(e, 'Ya hay otro producto con ese código.')
    return { error: msg, errores: (e as { code?: string }).code === '23505' ? { codigo: msg } : undefined }
  }
  revalidatePath('/productos')
  if (!id) redirect(`/productos/${nuevoId}?creado=1`)
  revalidatePath(`/productos/${id}`)
  return { ok: 'Cambios guardados.' }
}
