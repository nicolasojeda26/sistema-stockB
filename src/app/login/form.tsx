'use client'

import { useActionState, useState } from 'react'
import { Aviso, Boton, Campo, Input } from '@/components/ui'
import { entrar, type EstadoLogin } from './actions'

export function FormLogin() {
  const [estado, accion, enviando] = useActionState<EstadoLogin, FormData>(entrar, {})
  const [ver, setVer] = useState(false)
  return (
    <form action={accion} className="space-y-4 rounded-2xl border border-linea bg-papel p-6 shadow-sm">
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
        <span className="relative block">
          <Input name="password" type={ver ? 'text' : 'password'} autoComplete="current-password" required className="pr-20" />
          <button
            type="button"
            onClick={() => setVer((v) => !v)}
            className="absolute inset-y-1 right-1 rounded-md px-3 text-xs font-semibold text-tinta-suave hover:bg-fondo"
          >
            {ver ? 'Ocultar' : 'Mostrar'}
          </button>
        </span>
      </Campo>
      <Boton type="submit" className="h-11 w-full" disabled={enviando}>
        {enviando ? 'Entrando…' : 'Entrar'}
      </Boton>
    </form>
  )
}
