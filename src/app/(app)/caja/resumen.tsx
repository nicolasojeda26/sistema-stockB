import { formatoEntero, formatoPesos } from '@/lib/formato'

const horaAR = (d: Date) => d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Argentina/Buenos_Aires' })
import { MEDIOS, type MedioPago } from '@/lib/venta-calculo'
import type { ResumenCaja } from '@/lib/ventas'
import { Tarjeta, TituloTarjeta } from '@/components/ui'

/** Resumen de una caja: lo vendido por medio y el efectivo que tiene que haber. */
export function ResumenCajaVista({
  resumen: r,
  contado,
  esperadoGuardado,
  movimientos = [],
}: {
  resumen: ResumenCaja
  contado?: number | null
  esperadoGuardado?: number | null
  movimientos?: { id: number; creado: Date; tipo: string; monto: number; motivo: string }[]
}) {
  const esperado = esperadoGuardado ?? r.efectivoEsperado
  const dif = contado === undefined || contado === null ? null : Math.round((contado - esperado) * 100) / 100
  return (
    <Tarjeta>
      <TituloTarjeta acciones={<span className="text-xs text-tinta-suave">
            {formatoEntero(r.ventas)} venta{r.ventas === 1 ? '' : 's'}
            {r.anuladas ? `, ${r.anuladas} anulada${r.anuladas === 1 ? '' : 's'}` : ''}
          </span>}>
        Resumen
      </TituloTarjeta>
      <div className="p-5">
        <p className="text-sm text-tinta-suave">Total vendido{r.devoluciones > 0 ? ` (menos ${formatoPesos(r.devoluciones)} devueltos)` : ''}</p>
        <p className="num text-4xl font-bold tracking-tight">{formatoPesos(r.total)}</p>
        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(Object.keys(MEDIOS) as MedioPago[]).map((m) => (
            <div key={m} className="rounded-lg bg-fondo p-3">
              <dt className="text-xs text-tinta-suave">{MEDIOS[m]}</dt>
              <dd className="num mt-0.5 font-semibold">{formatoPesos(r.porMedio[m])}</dd>
            </div>
          ))}
        </dl>
        {(r.porMedio.cuenta_corriente !== 0 || Object.values(r.cobrosCuenta).some(Boolean)) && (
          <dl className="mt-3 space-y-1.5 text-sm">
            {r.porMedio.cuenta_corriente !== 0 && <Fila texto="Vendido a cuenta corriente (no entró plata)" valor={r.porMedio.cuenta_corriente} />}
            {(Object.keys(MEDIOS) as MedioPago[])
              .filter((m) => r.cobrosCuenta[m])
              .map((m) => (
                <Fila key={m} texto={`Cobros de cuentas corrientes en ${MEDIOS[m].toLowerCase()}`} valor={r.cobrosCuenta[m]} signo="+" />
              ))}
          </dl>
        )}
        <h3 className="mt-6 mb-2 text-sm font-semibold">Efectivo en la caja</h3>
        <dl className="space-y-1.5 text-sm">
          <Fila texto="Al abrir" valor={r.montoInicial} />
          <Fila texto="Ventas en efectivo" valor={Math.round((r.porMedio.efectivo + r.devolucionesEfectivo) * 100) / 100} signo="+" />
          {r.devolucionesEfectivo > 0 && <Fila texto="Devoluciones en efectivo" valor={r.devolucionesEfectivo} signo="−" />}
          {r.cobrosCuenta.efectivo > 0 && <Fila texto="Cobros de cuentas en efectivo" valor={r.cobrosCuenta.efectivo} signo="+" />}
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
        {movimientos.length > 0 && (
          <>
            <h3 className="mt-6 mb-2 text-sm font-semibold">Ingresos y retiros</h3>
            <ul className="divide-y divide-linea rounded-lg border border-linea text-sm">
              {movimientos.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate">{m.motivo}</span>
                    <span className="block text-xs text-apagado">
                      {m.tipo === 'retiro' ? 'Retiro' : 'Ingreso'} a las {horaAR(m.creado)}
                    </span>
                  </span>
                  <span className={`num shrink-0 font-semibold ${m.tipo === 'retiro' ? 'text-error' : 'text-ok'}`}>
                    {m.tipo === 'retiro' ? '−' : '+'} {formatoPesos(Number(m.monto))}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
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
