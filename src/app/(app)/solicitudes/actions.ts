'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requerirUsuario } from '@/lib/dal'

export async function crearSolicitud(formData: FormData) {
  const u = await requerirUsuario()
  const d = z.object({
    tipo: z.enum(['ayuda', 'informe', 'mejora']),
    asunto: z.string().trim().min(3).max(120),
    detalle: z.string().trim().min(5).max(2000),
  }).safeParse({ tipo: formData.get('tipo'), asunto: formData.get('asunto'), detalle: formData.get('detalle') })
  if (!d.success) return
  await db()`insert into solicitudes (usuario_id, sucursal_id, tipo, asunto, detalle) values (${u.id}, ${u.sucursal_id}, ${d.data.tipo}, ${d.data.asunto}, ${d.data.detalle})`
  revalidatePath('/solicitudes')
}

export async function actualizarSolicitud(formData: FormData) {
  await requerirUsuario().then((u) => { if (u.rol !== 'admin') throw new Error('Solo administración puede gestionar solicitudes.') })
  const d = z.object({
    id: z.coerce.number().int().positive(),
    estado: z.enum(['pendiente', 'en_curso', 'resuelta']),
    respuesta: z.string().trim().max(2000),
  }).safeParse({ id: formData.get('id'), estado: formData.get('estado'), respuesta: formData.get('respuesta') })
  if (!d.success) return
  await db()`update solicitudes set estado = ${d.data.estado}, respuesta = ${d.data.respuesta || null}, actualizado = now() where id = ${d.data.id}`
  revalidatePath('/solicitudes')
}
