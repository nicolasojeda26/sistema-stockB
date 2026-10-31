'use client'

import { useEffect, useState, useTransition } from 'react'
import { Aviso, Boton, Campo, Input, Select, Tarjeta, TituloTarjeta, tablaCls as t } from '@/components/ui'
import { formatoEntero, formatoPesos } from '@/lib/formato'
import { parseNumero } from '@/lib/numeros'
import { aplicar, previsualizar, type DatosAumento } from './actions'

type Previa = { cantidad: number; ejemplos: { nombre: string; antes: number; despues: number }[] }

export function FormAumento({ categorias }: { categorias: { id: number; nombre: string }[] }) {
  const [categoria, setCategoria] = useState('')
  const [porcentaje, setPorcentaje] = useState('')
  const [redondeo, setRedondeo] = useState('100')
  const [previa, setPrevia] = useState<Previa | null>(null)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [aplicando, iniciar] = useTransition()

  const pct = parseNumero(porcentaje)
  const datos: DatosAumento | null =
    pct === null ? null : { categoriaId: Number(categoria) || null, porcentaje: pct, redondeo: Number(redondeo) as DatosAumento['redondeo'] }
  const clave = JSON.stringify(datos)

  useEffect(() => {
    if (!datos) return
    let vigente = true
    const id = setTimeout(async () => {
      const r = await previsualizar(datos)
      if (vigente && 'cantidad' in r) setPrevia(r as Previa)
    }, 250)
    return () => {
      vigente = false
      clearTimeout(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave])

  const nombreCat = categorias.find((c) => String(c.id) === categoria)?.nombre

  function confirmar() {
    if (!datos || !previa) return
    const texto = `¿Cambiar el precio de ${formatoEntero(previa.cantidad)} productos${nombreCat ? ` de ${nombreCat}` : ''} un ${pct} %?`
    if (!confirm(texto)) return
    iniciar(async () => {
      const r = await aplicar(datos)
      if (r.error) return setMensaje({ tipo: 'error', texto: r.error })
      setMensaje({ tipo: 'ok', texto: `Listo: se actualizaron ${formatoEntero(r.actualizados ?? 0)} precios.` })
      setPorcentaje('')
      setPrevia(null)
    })
  }

  return (
    <Tarjeta>
      <TituloTarjeta>Aumento por porcentaje</TituloTarjeta>
      <div className="space-y-4 p-5">
        {mensaje && <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso>}
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo etiqueta="Productos">
            <Select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              <option value="">Todos</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo etiqueta="Porcentaje" ayuda="Negativo para bajar (ej.: -10)">
            <div className="relative">
              <Input value={porcentaje} onChange={(e) => setPorcentaje(e.target.value)} inputMode="decimal" placeholder="Ej.: 8" className="pr-8" />
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-apagado">%</span>
            </div>
          </Campo>
          <Campo etiqueta="Redondear hacia arriba a">
            <Select value={redondeo} onChange={(e) => setRedondeo(e.target.value)}>
              <option value="0">Sin redondear</option>
              <option value="10">$ 10</option>
              <option value="50">$ 50</option>
              <option value="100">$ 100</option>
              <option value="500">$ 500</option>
              <option value="1000">$ 1.000</option>
            </Select>
          </Campo>
        </div>

        {datos && previa && (
          <>
            <div className="overflow-hidden rounded-lg ring-1 ring-linea">
              <table className={t.tabla}>
                <thead>
                  <tr>
                    <th className={t.th}>Ejemplo</th>
                    <th className={`${t.th} text-right`}>Hoy</th>
                    <th className={`${t.th} text-right`}>Queda</th>
                  </tr>
                </thead>
                <tbody>
                  {previa.ejemplos.map((e, i) => (
                    <tr key={i}>
                      <td className={`${t.td} max-w-52 truncate`}>{e.nombre}</td>
                      <td className={`${t.td} num text-right text-tinta-suave`}>{formatoPesos(e.antes)}</td>
                      <td className={`${t.td} num text-right font-medium`}>{formatoPesos(e.despues)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Boton onClick={confirmar} disabled={aplicando || previa.cantidad === 0}>
              {aplicando ? 'Aplicando…' : `Aplicar a ${formatoEntero(previa.cantidad)} productos`}
            </Boton>
          </>
        )}
      </div>
    </Tarjeta>
  )
}
