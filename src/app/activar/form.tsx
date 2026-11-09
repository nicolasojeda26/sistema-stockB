'use client'

import { useActionState, useState } from 'react'
import { Aviso, Boton, Campo, Input } from '@/components/ui'
import { activar, type EstadoActivar } from '../login/actions'

export function FormActivar() {
  const [estado, accion, enviando] = useActionState<EstadoActivar, FormData>(activar, {})
  const [ver, setVer] = useState(false)
  return (
    <form action={accion} className="space-y-4 rounded-2xl border border-linea bg-papel p-6 shadow-sm">
      {estado.error && <Aviso tipo="error">{estado.error}</Aviso>}
      <Campo etiqueta="Usuario">
        <Input name="usuario" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} defaultValue={estado.usuario} autoFocus required />
      </Campo>
      <Campo etiqueta="Código de acceso" ayuda="Son 8 letras y números, por ejemplo K7QM-3XPA.">
        <Input name="codigo" autoComplete="one-time-code" autoCapitalize="characters" defaultValue={estado.codigo} className="font-mono uppercase" required />
      </Campo>
      <Campo etiqueta="Contraseña nueva" ayuda="Al menos 6 caracteres. No se la pases a nadie.">
        <span className="relative block">
          <Input name="password" type={ver ? 'text' : 'password'} autoComplete="new-password" minLength={6} required className="pr-20" />
          <button type="button" onClick={() => setVer((v) => !v)} className="absolute inset-y-1 right-1 rounded-md px-3 text-xs font-semibold text-tinta-suave hover:bg-fondo">
            {ver ? 'Ocultar' : 'Mostrar'}
          </button>
        </span>
      </Campo>
      <Campo etiqueta="Repetí la contraseña">
        <Input name="password2" type={ver ? 'text' : 'password'} autoComplete="new-password" minLength={6} required />
      </Campo>
      <Boton type="submit" className="h-11 w-full" disabled={enviando}>
        {enviando ? 'Guardando…' : 'Crear contraseña y entrar'}
      </Boton>
    </form>
  )
}
