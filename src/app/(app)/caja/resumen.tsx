import { formatoEntero, formatoPesos } from '@/lib/formato'
import { MEDIOS, type MedioPago } from '@/lib/venta-calculo'
import type { ResumenCaja } from '@/lib/ventas'
import { Tarjeta, TituloTarjeta } from '@/components/ui'

/** Resumen de una caja: lo vendido por medio y el efectivo que tiene que haber. */
export function ResumenCajaVista({
  resumen: r,
  contado,
  esperadoGuardado,
}: {
  resumen: ResumenCaja
  contado?: number | null
  esperadoGuardado?: number | null
}) {
  const esperado = esperadoGuardado ?? r.efectivoEsperado
  const dif = contado === undefined || contado === null ? null : Math.round((contado - esperado) * 100) / 100
  return (
    <Tarjeta>
      <TituloTarjeta acciones={<span className="text-xs text-tinta-suave">{formatoEntero(r.ventas)} ventas{r.anuladas ? ` · ${r.anuladas} anuladas` : ''}</span>}>
        Resumen
      </TituloTarjeta>
      <div className="p-5">
        <p className="text-sm text-tinta-suave">Total vendido</p>
        <p className="num text-3xl font-semibold tracking-tight">{formatoPesos(r.total)}</p>
        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(Object.keys(MEDIOS) as MedioPago[]).map((m) => (
            <div key={m} className="rounded-lg bg-fondo p-3">
              <dt className="text-xs text-tinta-suave">{MEDIOS[m]}</dt>
              <dd className="num mt-0.5 font-semibold">{formatoPesos(r.porMedio[m])}</dd>
            </div>
          ))}
        </dl>
        <h3 className="mt-6 mb-2 text-sm font-semibold">Efectivo en la caja</h3>
        <dl className="space-y-1.5 text-sm">
          <Fila texto="Al abrir" valor={r.montoInicial} />
          <Fila texto="Ventas en efectivo" valor={r.porMedio.efectivo} signo="+" />
          {r.ingresos > 0 && <Fila texto="Ingresos" valor={r.ingresos} signo="+" />}
          {r.retiros > 0 && <Fila texto="Retiros" valor={r.retiros} signo="−" />}
          <div className="flex justify-between border-t border-linea pt-2 font-semibold">
            <dt>Tiene que haber</dt>
            <dd className="num" data-testid="esperado">
              {formatoPesos(esperado)}
            </dd>
          </div>
          {contado !== undefined && contado !== null && (
            <>
              <Fila texto="Se contó" valor={contado} />
              <div className={`flex justify-between font-semibold ${dif === 0 ? 'text-ok' : 'text-error'}`}>
                <dt>{dif === 0 ? 'Cerró justo' : dif! > 0 ? 'Sobrante' : 'Faltante'}</dt>
                <dd className="num" data-testid="diferencia">
                  {formatoPesos(Math.abs(dif!))}
                </dd>
              </div>
            </>
          )}
        </dl>
      </div>
    </Tarjeta>
  )
}

function Fila({ texto, valor, signo }: { texto: string; valor: number; signo?: string }) {
  return (
    <div className="flex justify-between text-tinta-suave">
      <dt>{texto}</dt>
      <dd className="num">
        {signo ? `${signo} ` : ''}
        {formatoPesos(valor)}
      </dd>
    </div>
  )
}
