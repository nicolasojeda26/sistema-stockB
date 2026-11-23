'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ATAJOS, CASOS, GLOSARIO, GRUPOS, PREGUNTAS, SECCIONES, puedeVerGuia, type SeccionGuia } from '@/lib/guia'
import { guardarPreferencias, usePreferenciasAyuda } from '@/components/ayuda-pantalla'
import { Tarjeta } from '@/components/ui'

const normal = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

const textoDe = (s: SeccionGuia) => [s.titulo, s.quien, s.resumen, ...(s.pasos ?? []), ...(s.consejos ?? []), ...(s.problemas ?? []).flat()].join(' ')

/** Primera ruta navegable de la sección (sin tramos variables). */
const rutaDe = (s: SeccionGuia) => s.rutas.find((r) => !r.includes('*') && !['/login', '/activar'].includes(r))

const porId = new Map(SECCIONES.map((s) => [s.id, s]))

export function GuiaCompleta({
  permisos,
  rol,
  lugar,
  mios,
  descuentos,
}: {
  permisos: string[]
  rol: string
  lugar: string
  mios: string[]
  descuentos: { productos: number; reparaciones: number } | null
}) {
  const [q, setQ] = useState('')
  const [soloMio, setSoloMio] = useState(true)
  const pref = usePreferenciasAyuda()

  const filtro = useMemo(() => {
    const palabras = normal(q).split(/\s+/).filter(Boolean)
    const pasa = (texto: string) => palabras.every((p) => normal(texto).includes(p))
    const visible = (acceso?: SeccionGuia['acceso']) => !soloMio || puedeVerGuia(acceso, permisos)
    return {
      buscando: palabras.length > 0,
      secciones: SECCIONES.filter((s) => visible(s.acceso) && pasa(textoDe(s))),
      casos: CASOS.filter((c) => visible(c.acceso) && pasa([c.titulo, c.situacion, ...c.pasos].join(' '))),
      preguntas: PREGUNTAS.filter((p) => visible(p.acceso) && pasa(p.p + ' ' + p.r)),
      atajos: ATAJOS.filter(([a, b]) => pasa(a + ' ' + b)),
      glosario: GLOSARIO.filter(([a, b]) => pasa(a + ' ' + b)),
    }
  }, [q, soloMio, permisos])

  const visibles = new Set(filtro.secciones.map((s) => s.id))
  const total = filtro.secciones.length + filtro.casos.length + filtro.preguntas.length + filtro.atajos.length + filtro.glosario.length
  const grupos = GRUPOS.map((g) => [g, filtro.secciones.filter((s) => s.grupo === g)] as const).filter(([, l]) => l.length)

  const indice = (
    <nav aria-label="Índice de la guía" className="space-y-4 text-sm">
      {grupos.map(([g, lista]) => (
        <div key={g}>
          <p className="mb-1 text-xs font-semibold tracking-wide text-apagado uppercase">{g}</p>
          <ul className="space-y-0.5">
            {lista.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="block rounded-md px-2 py-1 text-tinta-suave hover:bg-fondo hover:text-tinta">
                  {s.titulo}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div>
        <p className="mb-1 text-xs font-semibold tracking-wide text-apagado uppercase">Más</p>
        <ul className="space-y-0.5">
          {[
            ['casos', 'Casos de uso', filtro.casos.length],
            ['preguntas', 'Preguntas frecuentes', filtro.preguntas.length],
            ['atajos', 'Atajos y trucos', filtro.atajos.length],
            ['glosario', 'Glosario', filtro.glosario.length],
          ]
            .filter(([, , n]) => n)
            .map(([id, t]) => (
              <li key={id}>
                <a href={`#${id}`} className="block rounded-md px-2 py-1 text-tinta-suave hover:bg-fondo hover:text-tinta">
                  {t}
                </a>
              </li>
            ))}
        </ul>
      </div>
    </nav>
  )

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center print:hidden">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscá: cobrar, cambio, garantía, envío, descuento…"
          aria-label="Buscar en la guía"
          className="h-11 min-w-0 flex-1 rounded-lg border border-linea bg-papel px-3 text-sm focus:border-marca focus:ring-2 focus:ring-marca/15 focus:outline-none"
        />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={soloMio} onChange={(e) => setSoloMio(e.target.checked)} className="h-4 w-4 accent-marca" />
            Solo lo que uso
          </label>
          <button type="button" onClick={() => window.print()} className="h-9 rounded-lg border border-linea bg-papel px-3 font-medium hover:bg-fondo">
            Imprimir
          </button>
        </div>
      </div>

      {!filtro.buscando && (
        <div className="grid gap-4 md:grid-cols-2">
          <Tarjeta className="p-5">
            <p className="text-xs font-semibold tracking-wide text-apagado uppercase">Tu lugar en el sistema</p>
            <p className="mt-1.5 text-lg font-semibold">
              {rol}
              {lugar && <span className="font-normal text-tinta-suave"> · {lugar}</span>}
            </p>
            {descuentos && (
              <p className="mt-1 text-sm text-tinta-suave">
                Descuento máximo: {descuentos.productos >= 100 ? 'sin tope' : `${descuentos.productos} % en productos`}
                {descuentos.productos < 100 && ` y ${descuentos.reparaciones} % en reparaciones`}.
              </p>
            )}
            <p className="mt-3 text-sm font-medium">Podés:</p>
            <ul className="mt-1 grid gap-x-4 gap-y-0.5 text-sm text-tinta-suave sm:grid-cols-2">
              {mios.map((m) => (
                <li key={m} className="flex gap-1.5">
                  <span aria-hidden className="text-marca">✓</span>
                  {m}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-apagado">Si te falta algo para tu trabajo, pedíselo a Administración.</p>
          </Tarjeta>
          <Tarjeta className="space-y-3 p-5 text-sm">
            <p className="text-xs font-semibold tracking-wide text-apagado uppercase">Cómo usar esta guía</p>
            <p className="leading-relaxed">
              Cada pantalla tiene arriba una barra <b>«Cómo se usa esta pantalla»</b> con lo básico. Acá está todo junto: qué hace cada parte, paso a paso,
              qué hacer si algo falla y casos reales.
            </p>
            <label className="flex items-start gap-2 print:hidden">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-marca"
                checked={pref ? !pref.oculta : true}
                disabled={!pref}
                onChange={(e) => guardarPreferencias((p) => ({ ...p, oculta: !e.target.checked }))}
              />
              <span>Mostrar las ayudas en cada pantalla</span>
            </label>
            <button
              type="button"
              onClick={() => guardarPreferencias((p) => ({ ...p, oculta: false, vistas: [] }))}
              className="text-left font-medium text-marca hover:underline print:hidden"
            >
              Volver a mostrar todas las ayudas abiertas, como la primera vez
            </button>
            <p className="text-tinta-suave">
              ¿No encontrás algo? Escribilo en{' '}
              <Link href="/solicitudes" className="font-medium text-marca hover:underline">
                Ayuda y solicitudes
              </Link>
              .
            </p>
          </Tarjeta>
        </div>
      )}

      {total === 0 ? (
        <Tarjeta className="p-8 text-center text-sm text-tinta-suave">
          No encontramos «{q}»{soloMio ? ' en lo que usás' : ''}.{' '}
          {soloMio && (
            <button type="button" onClick={() => setSoloMio(false)} className="font-medium text-marca hover:underline">
              Buscar en toda la guía
            </button>
          )}
          <p className="mt-2">
            Si es una duda, mandala en{' '}
            <Link href="/solicitudes" className="font-medium text-marca hover:underline">
              Ayuda y solicitudes
            </Link>
            .
          </p>
        </Tarjeta>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="hidden lg:sticky lg:top-6 lg:block lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto print:hidden">{indice}</aside>
          <details className="rounded-xl border border-linea bg-papel p-4 lg:hidden print:hidden">
            <summary className="cursor-pointer text-sm font-semibold">Índice</summary>
            <div className="mt-3">{indice}</div>
          </details>

          <div className="min-w-0 space-y-8">
            {grupos.map(([g, lista]) => (
              <section key={g} className="space-y-4">
                <h2 className="text-lg font-semibold tracking-tight">{g}</h2>
                {lista.map((s) => (
                  <Seccion key={s.id} s={s} puedeIr={puedeVerGuia(s.acceso, permisos)} visibles={visibles} />
                ))}
              </section>
            ))}

            {filtro.casos.length > 0 && (
              <section id="casos" className="scroll-mt-6 space-y-4">
                <h2 className="text-lg font-semibold tracking-tight">Casos de uso</h2>
                <p className="-mt-2 text-sm text-tinta-suave">Situaciones reales del negocio, resueltas paso a paso.</p>
                <div className="grid gap-4 xl:grid-cols-2">
                  {filtro.casos.map((c) => (
                    <Tarjeta key={c.id} id={c.id} className="scroll-mt-6 p-5 break-inside-avoid">
                      <h3 className="font-semibold">{c.titulo}</h3>
                      <p className="mt-1 text-sm text-tinta-suave italic">{c.situacion}</p>
                      <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm leading-relaxed marker:font-semibold marker:text-marca">
                        {c.pasos.map((p) => (
                          <li key={p}>{p}</li>
                        ))}
                      </ol>
                    </Tarjeta>
                  ))}
                </div>
              </section>
            )}

            {filtro.preguntas.length > 0 && (
              <section id="preguntas" className="scroll-mt-6 space-y-3">
                <h2 className="text-lg font-semibold tracking-tight">Preguntas frecuentes</h2>
                <Tarjeta className="divide-y divide-linea">
                  {filtro.preguntas.map((p) => (
                    <details key={p.p} className="group px-5 py-3" open={filtro.buscando}>
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-medium">
                        {p.p}
                        <span aria-hidden className="text-xs text-apagado transition-transform group-open:rotate-180">
                          ▾
                        </span>
                      </summary>
                      <p className="mt-2 text-sm leading-relaxed text-tinta-suave">{p.r}</p>
                    </details>
                  ))}
                </Tarjeta>
              </section>
            )}

            {filtro.atajos.length > 0 && (
              <section id="atajos" className="scroll-mt-6 space-y-3">
                <h2 className="text-lg font-semibold tracking-tight">Atajos y trucos</h2>
                <Tarjeta className="divide-y divide-linea">
                  {filtro.atajos.map(([tecla, que]) => (
                    <div key={tecla} className="flex items-baseline gap-4 px-5 py-2.5 text-sm">
                      <kbd className="w-20 shrink-0 rounded-md border border-linea bg-fondo px-2 py-0.5 text-center font-mono text-xs font-semibold">{tecla}</kbd>
                      <span>{que}</span>
                    </div>
                  ))}
                </Tarjeta>
              </section>
            )}

            {filtro.glosario.length > 0 && (
              <section id="glosario" className="scroll-mt-6 space-y-3">
                <h2 className="text-lg font-semibold tracking-tight">Glosario</h2>
                <Tarjeta>
                  <dl className="divide-y divide-linea">
                    {filtro.glosario.map(([termino, def]) => (
                      <div key={termino} className="grid gap-1 px-5 py-2.5 text-sm sm:grid-cols-[180px_1fr] sm:gap-4">
                        <dt className="font-semibold">{termino}</dt>
                        <dd className="text-tinta-suave">{def}</dd>
                      </div>
                    ))}
                  </dl>
                </Tarjeta>
              </section>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Seccion({ s, puedeIr, visibles }: { s: SeccionGuia; puedeIr: boolean; visibles: Set<string> }) {
  const ver = (s.ver ?? []).filter((id) => visibles.has(id))
  const ruta = rutaDe(s)
  return (
    <Tarjeta id={s.id} className="scroll-mt-6 p-5 break-inside-avoid">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-base font-semibold">{s.titulo}</h3>
        {ruta && puedeIr && (
          <Link href={ruta} className="text-sm font-medium text-marca hover:underline print:hidden">
            Ir a la pantalla →
          </Link>
        )}
      </div>
      <p className="mt-0.5 text-xs text-apagado">{s.quien}</p>
      <p className="mt-3 text-sm leading-relaxed">{s.resumen}</p>
      {s.pasos && (
        <>
          <p className="mt-4 text-xs font-semibold tracking-wide text-apagado uppercase">Paso a paso</p>
          <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-sm leading-relaxed marker:font-semibold marker:text-marca">
            {s.pasos.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ol>
        </>
      )}
      {s.consejos && (
        <>
          <p className="mt-4 text-xs font-semibold tracking-wide text-apagado uppercase">Para tener en cuenta</p>
          <ul className="mt-1.5 space-y-1 text-sm leading-relaxed">
            {s.consejos.map((c) => (
              <li key={c} className="flex gap-2">
                <span aria-hidden className="font-bold text-marca">✓</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {s.problemas && (
        <>
          <p className="mt-4 text-xs font-semibold tracking-wide text-apagado uppercase">Si pasa esto</p>
          <dl className="mt-1.5 space-y-1.5 text-sm leading-relaxed">
            {s.problemas.map(([si, entonces]) => (
              <div key={si}>
                <dt className="font-semibold">{si}</dt>
                <dd className="text-tinta-suave">{entonces}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
      {ver.length > 0 && (
        <p className="mt-4 text-sm text-tinta-suave print:hidden">
          Ver también:{' '}
          {ver.map((id, i) => {
            const otra = porId.get(id)
            return otra ? (
              <span key={id}>
                {i > 0 && ' · '}
                <a href={`#${id}`} className="font-medium text-marca hover:underline">
                  {otra.titulo}
                </a>
              </span>
            ) : null
          })}
        </p>
      )}
    </Tarjeta>
  )
}
