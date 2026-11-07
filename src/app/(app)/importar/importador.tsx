'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Aviso, Boton, Campo, Etiqueta, Select, Tarjeta, TituloTarjeta, tablaCls as t } from '@/components/ui'
import { CAMPOS, detectarColumnas, encontrarEncabezado, leerPlanilla, type Campo as CampoImport, type Mapeo } from '@/lib/importar'
import { formatoEntero, formatoPesos } from '@/lib/formato'
import { importarLote } from './actions'

const TAM_LOTE = 400

type Hoja = { nombre: string; filas: unknown[][] }
type Total = { creados: number; actualizados: number; omitidos: number; stock: number; categorias: number }

export function Importador({ depositos }: { depositos: { id: number; nombre: string }[] }) {
  const [archivo, setArchivo] = useState<string | null>(null)
  const [hojas, setHojas] = useState<Hoja[]>([])
  const [hojaSel, setHojaSel] = useState(0)
  const [encabezado, setEncabezado] = useState(0)
  const [mapeo, setMapeo] = useState<Mapeo>({})
  const [depositoId, setDepositoId] = useState<string>(depositos[0] ? String(depositos[0].id) : '')
  const [actualizar, setActualizar] = useState(true)
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null)
  const [progreso, setProgreso] = useState<{ hecho: number; total: number } | null>(null)
  const [resultado, setResultado] = useState<{ total: Total; error?: string } | null>(null)

  const filas = useMemo(() => hojas[hojaSel]?.filas ?? [], [hojas, hojaSel])
  const encabezados = filas[encabezado] ?? []
  const lectura = useMemo(() => leerPlanilla(filas, encabezado, mapeo), [filas, encabezado, mapeo])

  function elegirHoja(h: Hoja[], i: number) {
    const enc = encontrarEncabezado(h[i].filas)
    setHojaSel(i)
    setEncabezado(enc)
    setMapeo(detectarColumnas(h[i].filas[enc] ?? []))
  }

  async function leerArchivo(file: File) {
    setErrorArchivo(null)
    setResultado(null)
    try {
      const XLSX = await import('xlsx')
      const libro = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false })
      const h = libro.SheetNames.map((nombre) => ({
        nombre,
        filas: XLSX.utils.sheet_to_json<unknown[]>(libro.Sheets[nombre], { header: 1, raw: true, defval: null, blankrows: true }),
      })).filter((x) => x.filas.length > 0)
      if (!h.length) throw new Error('vacío')
      setArchivo(file.name)
      setHojas(h)
      elegirHoja(h, 0)
    } catch {
      setErrorArchivo('No pude leer ese archivo. Tiene que ser un Excel (.xlsx o .xls) o un .csv.')
      setHojas([])
      setArchivo(null)
    }
  }

  async function importar() {
    const { validas } = lectura
    const total: Total = { creados: 0, actualizados: 0, omitidos: 0, stock: 0, categorias: 0 }
    setProgreso({ hecho: 0, total: validas.length })
    for (let i = 0; i < validas.length; i += TAM_LOTE) {
      const r = await importarLote({
        filas: validas.slice(i, i + TAM_LOTE),
        depositoId: mapeo.stock !== undefined && depositoId ? Number(depositoId) : null,
        actualizarExistentes: actualizar,
      })
      if ('error' in r) {
        setResultado({ total, error: `${r.error} Se guardaron las primeras ${formatoEntero(i)} filas.` })
        setProgreso(null)
        return
      }
      for (const k of Object.keys(total) as (keyof Total)[]) total[k] += r[k]
      setProgreso({ hecho: Math.min(i + TAM_LOTE, validas.length), total: validas.length })
    }
    setProgreso(null)
    setResultado({ total })
  }

  if (resultado && !resultado.error) {
    const r = resultado.total
    return (
      <Tarjeta className="max-w-2xl p-6">
        <h2 className="text-lg font-semibold">Importación terminada</h2>
        <ul className="mt-4 space-y-1.5 text-sm">
          <li>
            <b className="num">{formatoEntero(r.creados)}</b> productos nuevos
          </li>
          <li>
            <b className="num">{formatoEntero(r.actualizados)}</b> productos actualizados
          </li>
          {r.omitidos > 0 && (
            <li>
              <b className="num">{formatoEntero(r.omitidos)}</b> ya existían y se dejaron como estaban
            </li>
          )}
          <li>
            <b className="num">{formatoEntero(r.categorias)}</b> categorías nuevas
          </li>
          <li>
            <b className="num">{formatoEntero(r.stock)}</b> productos con stock cargado
          </li>
        </ul>
        {lectura.errores.length > 0 && (
          <p className="mt-3 text-sm text-alerta">{formatoEntero(lectura.errores.length)} filas no se importaron por tener datos incompletos.</p>
        )}
        <div className="mt-6 flex gap-2">
          <Link href="/productos" className="inline-flex h-10 items-center rounded-lg bg-marca px-4 text-sm font-medium text-white">
            Ver productos
          </Link>
          <Boton
            variante="secundario"
            onClick={() => {
              setResultado(null)
              setHojas([])
              setArchivo(null)
            }}
          >
            Importar otro archivo
          </Boton>
        </div>
      </Tarjeta>
    )
  }

  return (
    <div className="min-w-0 space-y-5">
      <Tarjeta className="p-5">
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-linea px-6 py-8 text-center hover:border-marca/50 hover:bg-marca-clara/30">
          <span className="text-sm font-medium">{archivo ?? 'Elegí el archivo de Dux'}</span>
          <span className="text-xs text-apagado">Excel (.xlsx, .xls) o CSV</span>
          <input
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            className="sr-only"
            onChange={(e) => e.target.files?.[0] && leerArchivo(e.target.files[0])}
          />
        </label>
        {errorArchivo && (
          <div className="mt-3">
            <Aviso tipo="error">{errorArchivo}</Aviso>
          </div>
        )}
      </Tarjeta>

      {hojas.length > 0 && (
        <>
          <Tarjeta>
            <TituloTarjeta>1. Columnas</TituloTarjeta>
            <div className="space-y-4 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                {hojas.length > 1 && (
                  <Campo etiqueta="Hoja">
                    <Select value={hojaSel} onChange={(e) => elegirHoja(hojas, Number(e.target.value))}>
                      {hojas.map((h, i) => (
                        <option key={h.nombre} value={i}>
                          {h.nombre}
                        </option>
                      ))}
                    </Select>
                  </Campo>
                )}
                <Campo etiqueta="Fila de títulos" ayuda="Detectada sola; cambiala si quedó mal.">
                  <Select
                    value={encabezado}
                    onChange={(e) => {
                      const n = Number(e.target.value)
                      setEncabezado(n)
                      setMapeo(detectarColumnas(filas[n] ?? []))
                    }}
                  >
                    {filas.slice(0, 15).map((f, i) => (
                      <option key={i} value={i}>
                        Fila {i + 1}: {(f ?? []).filter(Boolean).slice(0, 4).join(' · ').slice(0, 60)}
                      </option>
                    ))}
                  </Select>
                </Campo>
              </div>
              <p className="text-sm text-tinta-suave">Revisá qué columna del archivo corresponde a cada dato. Las marcadas con * son obligatorias.</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {(Object.keys(CAMPOS) as CampoImport[]).map((c) => (
                  <Campo key={c} etiqueta={`${CAMPOS[c]}${c === 'nombre' ? ' *' : ''}`}>
                    <Select
                      value={mapeo[c] ?? ''}
                      onChange={(e) => setMapeo((m) => ({ ...m, [c]: e.target.value === '' ? undefined : Number(e.target.value) }))}
                    >
                      <option value="">— No usar —</option>
                      {encabezados.map((h, i) => (
                        <option key={i} value={i}>
                          {String(h ?? `Columna ${i + 1}`)}
                        </option>
                      ))}
                    </Select>
                  </Campo>
                ))}
              </div>
              {mapeo.codigo === undefined && mapeo.codigo_alt === undefined && (
                <Aviso tipo="alerta">Elegí la columna del código (de barras o interno): es lo que se escanea al vender.</Aviso>
              )}
              {mapeo.codigo === undefined && mapeo.codigo_alt !== undefined && (
                <Aviso tipo="info">No hay columna de código de barras: se va a usar el código interno.</Aviso>
              )}
            </div>
          </Tarjeta>

          <Tarjeta className="overflow-hidden">
            <TituloTarjeta
              acciones={
                <div className="flex gap-2">
                  <Etiqueta tono="ok">{formatoEntero(lectura.validas.length)} listas</Etiqueta>
                  {lectura.errores.length > 0 && <Etiqueta tono="alerta">{formatoEntero(lectura.errores.length)} con problemas</Etiqueta>}
                </div>
              }
            >
              2. Vista previa
            </TituloTarjeta>
            <div className="overflow-x-auto">
              <table className={t.tabla}>
                <thead>
                  <tr>
                    <th className={t.th}>Fila</th>
                    <th className={t.th}>Código</th>
                    <th className={t.th}>Nombre</th>
                    <th className={t.th}>Categoría</th>
                    <th className={`${t.th} text-right`}>Costo</th>
                    <th className={`${t.th} text-right`}>Precio</th>
                    <th className={`${t.th} text-right`}>Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {lectura.validas.slice(0, 8).map((f) => (
                    <tr key={f.fila}>
                      <td className={`${t.td} num text-apagado`}>{f.fila}</td>
                      <td className={`${t.td} font-mono text-xs`}>{f.codigo}</td>
                      <td className={t.td}>{f.nombre}</td>
                      <td className={`${t.td} text-tinta-suave`}>{f.categoria ?? '—'}</td>
                      <td className={`${t.td} num text-right`}>{f.costo === null ? '—' : formatoPesos(f.costo)}</td>
                      <td className={`${t.td} num text-right`}>{f.precio === null ? '—' : formatoPesos(f.precio)}</td>
                      <td className={`${t.td} num text-right`}>{f.stock === null ? '—' : formatoEntero(f.stock)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {lectura.validas.length > 8 && (
              <p className="px-5 py-3 text-xs text-apagado">…y {formatoEntero(lectura.validas.length - 8)} filas más.</p>
            )}
            {lectura.errores.length > 0 && (
              <details className="border-t border-linea px-5 py-3 text-sm">
                <summary className="cursor-pointer text-alerta">Ver filas que no se van a importar</summary>
                <ul className="mt-2 max-h-48 space-y-0.5 overflow-y-auto text-xs text-tinta-suave">
                  {lectura.errores.slice(0, 200).map((e) => (
                    <li key={`${e.fila}-${e.motivo}`}>
                      Fila {e.fila}: {e.motivo}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </Tarjeta>

          <Tarjeta>
            <TituloTarjeta>3. Confirmar</TituloTarjeta>
            <div className="space-y-4 p-5">
              {mapeo.stock !== undefined ? (
                <Campo etiqueta="¿En qué depósito está ese stock?" ayuda="El stock de ese depósito queda igual al de la planilla.">
                  <Select value={depositoId} onChange={(e) => setDepositoId(e.target.value)} className="max-w-md">
                    <option value="">No cargar stock</option>
                    {depositos.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.nombre}
                      </option>
                    ))}
                  </Select>
                </Campo>
              ) : (
                <p className="text-sm text-tinta-suave">El archivo no tiene columna de stock: se cargan solo los productos.</p>
              )}
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={actualizar} onChange={(e) => setActualizar(e.target.checked)} className="mt-0.5 h-4 w-4 accent-marca" />
                <span>
                  Actualizar los productos que ya existen (mismo código)
                  <span className="block text-xs text-apagado">Si lo desmarcás, solo se agregan los nuevos.</span>
                </span>
              </label>
              {resultado?.error && <Aviso tipo="error">{resultado.error}</Aviso>}
              <Boton
                onClick={importar}
                disabled={!!progreso || lectura.validas.length === 0 || (mapeo.codigo === undefined && mapeo.codigo_alt === undefined)}
              >
                {progreso
                  ? `Importando… ${formatoEntero(progreso.hecho)} de ${formatoEntero(progreso.total)}`
                  : `Importar ${formatoEntero(lectura.validas.length)} productos`}
              </Boton>
            </div>
          </Tarjeta>
        </>
      )}
    </div>
  )
}
