'use client'

import { useState } from 'react'
import { formatoEntero, formatoPesos } from '@/lib/formato'

type Dia = { dia: string; total: number; ventas: number }

const corto = (iso: string) => {
  const [, m, d] = iso.split('-')
  return `${Number(d)}/${Number(m)}`
}
const compacto = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} M` : n >= 1000 ? `$${Math.round(n / 1000)} mil` : `$${Math.round(n)}`

/** Barras finas de un solo color: lo vendido cada día. Pasando el mouse se ve el detalle. */
export function GraficoDias({ dias }: { dias: Dia[] }) {
  const [activo, setActivo] = useState<number | null>(null)
  if (!dias.length) return null
  if (dias.every((x) => !x.total))
    return <p className="py-14 text-center text-sm text-tinta-suave">No hubo ventas en estas fechas.</p>
  const max = Math.max(...dias.map((d) => d.total), 1)
  // Escala con un tope "redondo" para que las líneas guía caigan en números claros.
  const paso = 10 ** Math.floor(Math.log10(max))
  const tope = Math.ceil(max / paso) * paso
  const W = 720
  const H = 220
  const izq = 56
  const abajo = 24
  const arriba = 12
  const ancho = (W - izq) / dias.length
  const barra = Math.max(2, Math.min(28, ancho - 4))
  const y = (v: number) => arriba + (H - abajo - arriba) * (1 - v / tope)
  const guias = [0, 0.5, 1].map((k) => k * tope)
  const cadaCuanto = Math.ceil(dias.length / 10)
  const d = activo !== null ? dias[activo] : null

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Ventas por día" onMouseLeave={() => setActivo(null)}>
        {guias.map((g) => (
          <g key={g}>
            <line x1={izq} x2={W} y1={y(g)} y2={y(g)} stroke="var(--color-linea)" strokeWidth={1} />
            <text x={izq - 8} y={y(g) + 4} textAnchor="end" fontSize={11} fill="var(--color-apagado)">
              {compacto(g)}
            </text>
          </g>
        ))}
        {dias.map((dia, i) => {
          const x = izq + i * ancho + (ancho - barra) / 2
          const h = Math.max(0, H - abajo - y(dia.total))
          const r = Math.min(4, barra / 2, h)
          return (
            <g key={dia.dia} onMouseEnter={() => setActivo(i)}>
              {/* Zona sensible más grande que la barra */}
              <rect x={izq + i * ancho} y={0} width={ancho} height={H - abajo} fill="transparent" />
              {h > 0 && (
                <path
                  d={`M${x},${H - abajo} V${H - abajo - h + r} Q${x},${H - abajo - h} ${x + r},${H - abajo - h} H${x + barra - r} Q${x + barra},${H - abajo - h} ${x + barra},${H - abajo - h + r} V${H - abajo} Z`}
                  fill="var(--color-marca)"
                  opacity={activo === null || activo === i ? 1 : 0.45}
                />
              )}
              {(i % cadaCuanto === 0 || i === dias.length - 1) && (
                <text x={izq + i * ancho + ancho / 2} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--color-apagado)">
                  {corto(dia.dia)}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      {d && (
        <div
          className="pointer-events-none absolute top-0 rounded-lg border border-linea bg-papel px-3 py-2 text-xs shadow-md"
          style={{ left: `${Math.min(80, Math.max(8, ((izq + (activo! + 0.5) * ancho) / W) * 100))}%`, transform: 'translateX(-50%)' }}
        >
          <p className="font-medium">{corto(d.dia)}</p>
          <p className="num text-tinta">{formatoPesos(d.total)}</p>
          <p className="text-apagado">
            {formatoEntero(d.ventas)} venta{d.ventas === 1 ? '' : 's'}
          </p>
        </div>
      )}
      <details className="mt-2 text-xs text-tinta-suave">
        <summary className="cursor-pointer">Ver como tabla</summary>
        <table className="mt-2 w-full max-w-sm">
          <tbody>
            {dias.map((x) => (
              <tr key={x.dia}>
                <td className="py-0.5">{corto(x.dia)}</td>
                <td className="num text-right">{formatoEntero(x.ventas)}</td>
                <td className="num text-right">{formatoPesos(x.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
