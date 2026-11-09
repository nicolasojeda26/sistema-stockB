/** Marca del negocio: logo subido en Ajustes o el logotipo en texto ("Mega" + "Cel+" en verde). */
export function Logotipo({ nombre, logo, className = '' }: { nombre: string; logo?: string | null; className?: string }) {
  if (logo)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logo} alt={nombre} className={`h-9 w-auto max-w-[180px] object-contain ${className}`} />
  // La segunda parte (desde la última mayúscula: "Cel+") va en verde, como en el logo de MegaCel+.
  const m = !nombre.endsWith('+') ? null : nombre.match(/^(.+?)([A-ZÁÉÍÓÚÑ][^A-ZÁÉÍÓÚÑ]*\+?)$/)
  return (
    <span className={`font-light tracking-tight text-white ${className}`}>
      {m ? (
        <>
          {m[1]}
          <span className="text-acento">{m[2]}</span>
        </>
      ) : (
        nombre
      )}
    </span>
  )
}
