'use client'

import { startTransition, useActionState, useEffect, useRef, type FormEvent, type ReactNode } from 'react'
import { Aviso } from './ui'

export type Resultado = { error?: string; ok?: string; errores?: Record<string, string> }
type Accion = (prev: Resultado, form: FormData) => Promise<Resultado>

/**
 * Formulario conectado a una acción del servidor: muestra el error o el
 * mensaje de éxito y, si se pide, se vacía al guardar bien.
 */
export function FormAccion({
  accion,
  children,
  className,
  limpiarAlGuardar = false,
  alGuardar,
}: {
  accion: Accion
  children: (estado: Resultado, enviando: boolean) => ReactNode
  className?: string
  limpiarAlGuardar?: boolean
  alGuardar?: () => void
}) {
  const [estado, formAccion, enviando] = useActionState(accion, {})
  const ref = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (estado.ok) {
      if (limpiarAlGuardar) ref.current?.reset()
      alGuardar?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado])
  return (
    // Se envía a mano (y no con action=) para que React no vacíe el
    // formulario cuando hay un error: así no se pierde lo que se escribió.
    <form
      ref={ref}
      className={className}
      onSubmit={(e: FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        const datos = new FormData(e.currentTarget)
        startTransition(() => formAccion(datos))
      }}
    >
      {estado.error && (
        <div className="mb-3">
          <Aviso tipo="error">{estado.error}</Aviso>
        </div>
      )}
      {estado.ok && (
        <div className="mb-3">
          <Aviso tipo="ok">{estado.ok}</Aviso>
        </div>
      )}
      {children(estado, enviando)}
    </form>
  )
}
