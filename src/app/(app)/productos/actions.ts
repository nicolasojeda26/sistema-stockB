'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { requerirAdmin } from '@/lib/dal'
import { entero, marcado, mensajeError, texto } from '@/lib/errores'
import { centavos, parseNumero } from '@/lib/numeros'
import type { Resultado } from '@/components/form-accion'

export async function guardarProducto(_: Resultado, f: FormData): Promise<Resultado> {
  await requerirAdmin()
  const id = entero(f, 'id')
  const codigo = texto(f, 'codigo')
  const nombre = texto(f, 'nombre')
  const categoriaId = entero(f, 'categoria_id')
  const costo = parseNumero(texto(f, 'costo') || '0')
  const precio = parseNumero(texto(f, 'precio'))
  const stockMinimo = parseNumero(texto(f, 'stock_minimo') || '0')
  const activo = id ? marcado(f, 'activo') : true

  const errores: Record<string, string> = {}
  if (!codigo) errores.codigo = 'Escaneá o escribí el código.'
  else if (codigo.length > 64) errores.codigo = 'El código es demasiado largo.'
  if (!nombre) errores.nombre = 'Poné el nombre del producto.'
  if (costo === null || costo < 0) errores.costo = 'Costo no válido.'
  if (precio === null || precio < 0) errores.precio = 'Poné el precio de venta.'
  if (stockMinimo === null || stockMinimo < 0 || !Number.isInteger(stockMinimo)) errores.stock_minimo = 'Tiene que ser un número entero.'
  if (Object.keys(errores).length) return { error: 'Revisá los campos marcados.', errores }

  let nuevoId = id
  try {
    if (id) {
      await db()`
        update productos set codigo = ${codigo}, nombre = ${nombre}, categoria_id = ${categoriaId},
          costo = ${centavos(costo!)}, precio = ${centavos(precio!)}, stock_minimo = ${stockMinimo},
          activo = ${activo}, actualizado = now()
        where id = ${id}`
    } else {
      const [p] = await db()<{ id: number }[]>`
        insert into productos (codigo, nombre, categoria_id, costo, precio, stock_minimo)
        values (${codigo}, ${nombre}, ${categoriaId}, ${centavos(costo!)}, ${centavos(precio!)}, ${stockMinimo})
        returning id`
      nuevoId = p.id
    }
  } catch (e) {
    const msg = mensajeError(e, 'Ya hay otro producto con ese código.')
    return { error: msg, errores: (e as { code?: string }).code === '23505' ? { codigo: msg } : undefined }
  }
  revalidatePath('/productos')
  if (!id) redirect(`/productos/${nuevoId}?creado=1`)
  revalidatePath(`/productos/${id}`)
  return { ok: 'Cambios guardados.' }
}
