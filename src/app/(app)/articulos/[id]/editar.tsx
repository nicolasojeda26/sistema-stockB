'use client'

import { useState, useTransition } from 'react'
import { Aviso, Boton, Campo, Input, Select, Tarjeta, TituloTarjeta } from '@/components/ui'
import { agregarVariantes, guardarArticulo } from '../actions'

export function EditarArticulo({
  articulo,
  categorias,
  talles,
  colores,
}: {
  articulo: { id: number; nombre: string; categoria_id: number | null; marca: string; activo: boolean }
  categorias: { id: number; nombre: string }[]
  talles: string[]
  colores: string[]
}) {
  const [nombre, setNombre] = useState(articulo.nombre)
  const [categoriaId, setCategoriaId] = useState(String(articulo.categoria_id ?? ''))
  const [marca, setMarca] = useState(articulo.marca)
  const [activo, setActivo] = useState(articulo.activo)
  const [precio, setPrecio] = useState('')
  const [costo, setCosto] = useState('')
  const [nuevosTalles, setNuevosTalles] = useState('')
  const [nuevosColores, setNuevosColores] = useState('')
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [guardando, iniciar] = useTransition()

  const guardar = () =>
    iniciar(async () => {
      const r = await guardarArticulo({ id: articulo.id, nombre, categoriaId: Number(categoriaId) || null, marca, activo, precioTodas: precio, costoTodas: costo })
      setErrores(r.errores ?? {})
      setMsg(r.ok ? { tipo: 'ok', texto: r.ok } : { tipo: 'error', texto: r.error ?? 'No se pudo guardar.' })
      if (r.ok) {
        setPrecio('')
        setCosto('')
      }
    })

  const agregar = () =>
    iniciar(async () => {
      const lista = (s: string) => s.split(/[,;]/).map((x) => x.trim()).filter(Boolean)
      const r = await agregarVariantes({ id: articulo.id, talles: lista(nuevosTalles), colores: lista(nuevosColores) })
      setMsg(r.ok ? { tipo: 'ok', texto: r.ok } : { tipo: 'error', texto: r.error ?? 'No se pudo agregar.' })
      if (r.ok) {
        setNuevosTalles('')
        setNuevosColores('')
      }
    })

  return (
    <div className="space-y-5">
      <Tarjeta>
        <TituloTarjeta>Datos del artículo</TituloTarjeta>
        <div className="space-y-4 p-5">
          <Campo etiqueta="Nombre" ayuda="Al cambiarlo se renombran todas las variantes.">
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </Campo>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Categoría">
              <Select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
                <option value="">Sin categoría</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo etiqueta="Marca">
              <Input value={marca} onChange={(e) => setMarca(e.target.value)} />
            </Campo>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Nuevo precio para todas" error={errores.precio} ayuda="Vacío: no cambia">
              <Input inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} />
            </Campo>
            <Campo etiqueta="Nuevo costo para todas" error={errores.costo} ayuda="Vacío: no cambia">
              <Input inputMode="decimal" value={costo} onChange={(e) => setCosto(e.target.value)} />
            </Campo>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} className="h-4 w-4 accent-marca" />
            Activo (si lo desmarcás, se dan de baja todas sus variantes)
          </label>
          <Boton onClick={guardar} disabled={guardando}>
            Guardar cambios
          </Boton>
        </div>
      </Tarjeta>

      <Tarjeta>
        <TituloTarjeta>Agregar modelos o colores</TituloTarjeta>
        <div className="space-y-4 p-5">
          <p className="text-sm text-tinta-suave">
            Hoy tiene {talles.length ? `los modelos ${talles.join(', ')}` : 'modelo único'} y {colores.length ? `los colores ${colores.join(', ')}` : 'color único'}. Se crean
            las combinaciones que falten, con el precio más usado del artículo.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Modelos nuevos" ayuda="Separados por coma">
              <Input value={nuevosTalles} onChange={(e) => setNuevosTalles(e.target.value)} placeholder="Ej.: A16, A26" />
            </Campo>
            <Campo etiqueta="Colores nuevos" ayuda="Separados por coma">
              <Input value={nuevosColores} onChange={(e) => setNuevosColores(e.target.value)} placeholder="Ej.: Bordó" />
            </Campo>
          </div>
          <Boton variante="secundario" onClick={agregar} disabled={guardando || (!nuevosTalles.trim() && !nuevosColores.trim())}>
            Agregar variantes
          </Boton>
        </div>
      </Tarjeta>
      {msg && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}
    </div>
  )
}
