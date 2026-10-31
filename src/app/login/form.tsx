'use client'

import { useActionState } from 'react'
import { Aviso, Boton, Campo, Input } from '@/components/ui'
import { entrar, type EstadoLogin } from './actions'

export function FormLogin() {
  const [estado, accion, enviando] = useActionState<EstadoLogin, FormData>(entrar, {})
  return (
    <form action={accion} className="space-y-4 rounded-xl border border-linea bg-papel p-6">
      {estado.error && <Aviso tipo="error">{estado.error}</Aviso>}
      <Campo etiqueta="Usuario">
        <Input
          name="usuario"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          defaultValue={estado.usuario}
          autoFocus
          required
        />
      </Campo>
      <Campo etiqueta="Contraseña">
        <Input name="password" type="password" autoComplete="current-password" required />
      </Campo>
      <Boton type="submit" className="w-full" disabled={enviando}>
        {enviando ? 'Entrando…' : 'Entrar'}
      </Boton>
    </form>
  )
}
