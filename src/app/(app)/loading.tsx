/** Se muestra mientras carga una pantalla (internet lento en el local). */
export default function Cargando() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Cargando">
      <div className="h-7 w-56 rounded-md bg-linea" />
      <div className="mt-2 h-4 w-80 max-w-full rounded-md bg-linea/70" />
      <div className="mt-6 space-y-3 rounded-xl border border-linea bg-papel p-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-5 rounded-md bg-fondo" style={{ width: `${90 - i * 9}%` }} />
        ))}
      </div>
    </div>
  )
}
