/** Traduce errores de Postgres a mensajes para la pantalla. */
export function mensajeError(e: unknown, duplicado = 'Ya existe un registro con ese nombre.'): string {
  const code = (e as { code?: string })?.code
  if (code === '23505') return duplicado
  if (code === '23503') return 'No se puede borrar: está en uso.'
  if (code === '23514') return 'Hay un dato con un valor no permitido.'
  console.error(e)
  return 'No se pudo guardar. Probá de nuevo.'
}

export const texto = (f: FormData, k: string) => String(f.get(k) ?? '').trim()
export const entero = (f: FormData, k: string) => {
  const v = texto(f, k)
  return v === '' ? null : Number.parseInt(v, 10)
}
export const marcado = (f: FormData, k: string) => f.get(k) === 'on' || f.get(k) === 'true'
