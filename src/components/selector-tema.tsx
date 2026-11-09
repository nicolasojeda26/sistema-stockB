'use client'

import { useEffect, useState } from 'react'

type Tema = 'sistema' | 'claro' | 'oscuro'
const CLAVE = 'sistema-stock-tema'

function aplicarTema(tema: Tema) {
  const oscuro = tema === 'oscuro' || (tema === 'sistema' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = oscuro ? 'oscuro' : 'claro'
}

export function SelectorTema() {
  const [tema, setTema] = useState<Tema>('sistema')

  // El tema guardado se lee recién al montar: en el servidor no hay localStorage.
  useEffect(() => {
    try {
      const guardado = localStorage.getItem(CLAVE)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTema(guardado === 'claro' || guardado === 'oscuro' ? guardado : 'sistema')
    } catch {}
  }, [])

  useEffect(() => {
    aplicarTema(tema)
    if (tema !== 'sistema') return
    const medio = window.matchMedia('(prefers-color-scheme: dark)')
    const alCambiarSistema = () => aplicarTema('sistema')
    medio.addEventListener('change', alCambiarSistema)
    return () => medio.removeEventListener('change', alCambiarSistema)
  }, [tema])

  function cambiarTema(nuevo: Tema) {
    setTema(nuevo)
    try {
      localStorage.setItem(CLAVE, nuevo)
    } catch {}
    aplicarTema(nuevo)
  }

  return (
    <label className="block px-1">
      <span className="mb-1 block text-[10px] font-bold tracking-[.12em] text-apagado">APARIENCIA</span>
      <select
        aria-label="Apariencia"
        value={tema}
        onChange={(e) => cambiarTema(e.target.value as Tema)}
        className="theme-select h-9 w-full rounded-lg border border-linea bg-fondo px-2.5 text-xs font-medium text-tinta outline-none focus:ring-2 focus:ring-marca/40"
      >
        <option value="sistema">Según el sistema</option>
        <option value="claro">Claro</option>
        <option value="oscuro">Oscuro</option>
      </select>
    </label>
  )
}
