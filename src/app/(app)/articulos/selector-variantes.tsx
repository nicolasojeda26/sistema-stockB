'use client'

import { useState } from 'react'

/** Chips para elegir talles o colores: tocás para sumar o sacar, y podés escribir otros. */
export function SelectorChips({
  titulo,
  sugeridos,
  elegidos,
  setElegidos,
  placeholder,
  grupos,
}: {
  titulo: string
  sugeridos: string[]
  elegidos: string[]
  setElegidos: (v: string[]) => void
  placeholder: string
  /** Curvas de talles: un botón elige la curva entera. */
  grupos?: { nombre: string; talles: string[] }[]
}) {
  const [nuevo, setNuevo] = useState('')
  const tiene = (v: string) => elegidos.some((e) => e.toLowerCase() === v.toLowerCase())
  const alternar = (v: string) => setElegidos(tiene(v) ? elegidos.filter((e) => e.toLowerCase() !== v.toLowerCase()) : [...elegidos, v])
  const agregar = () => {
    const extras = nuevo
      .split(/[,;]/)
      .map((x) => x.trim().replace(/\s+/g, ' '))
      .filter((x) => x && !tiene(x))
    if (extras.length) setElegidos([...elegidos, ...extras])
    setNuevo('')
  }
  const opciones = [...sugeridos, ...elegidos.filter((e) => !sugeridos.some((s) => s.toLowerCase() === e.toLowerCase()))]

  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">{titulo}</legend>
      {grupos && grupos.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {grupos.map((g) => (
            <button
              key={g.nombre}
              type="button"
              onClick={() => setElegidos(g.talles)}
              className="rounded-md border border-dashed border-linea px-2.5 py-1 text-xs font-medium text-tinta-suave hover:border-marca hover:text-marca"
            >
              Lista {g.nombre || g.talles.join('-')}
            </button>
          ))}
          {elegidos.length > 0 && (
            <button type="button" onClick={() => setElegidos([])} className="px-2 py-1 text-xs text-apagado hover:text-error">
              Limpiar
            </button>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {opciones.map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={tiene(v)}
            onClick={() => alternar(v)}
            className={`h-9 min-w-11 rounded-lg border px-3 text-sm font-semibold transition-colors ${
              tiene(v) ? 'border-marca bg-marca text-white' : 'border-linea bg-papel text-tinta-suave hover:border-marca/50'
            }`}
          >
            {v}
          </button>
        ))}
      </div>
      <div className="mt-2 flex max-w-sm gap-2">
        <input
          value={nuevo}
          onChange={(e) => setNuevo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              agregar()
            }
          }}
          placeholder={placeholder}
          aria-label={`Agregar ${titulo.toLowerCase()}`}
          className="h-9 min-w-0 flex-1 rounded-lg border border-linea bg-papel px-3 text-sm focus:border-marca focus:outline-none"
        />
        <button type="button" onClick={agregar} className="h-9 rounded-lg border border-linea px-3 text-sm font-medium hover:bg-fondo">
          Agregar
        </button>
      </div>
    </fieldset>
  )
}
