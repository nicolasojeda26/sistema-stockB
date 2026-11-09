/** Sello y nombre de la marca. Si se subió un logo en Ajustes, se usa ese. */
export function Sello({ logo, className = 'h-9 w-9' }: { logo?: string | null; className?: string }) {
  if (logo)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logo} alt="" className={`${className} rounded-lg object-contain`} />
  // Sin logo: un celular con el "+" de la marca.
  return (
    <svg viewBox="0 0 36 36" className={className} aria-hidden>
      <rect x="8" y="2.5" width="20" height="31" rx="5" fill="var(--color-marca)" />
      <rect x="14.5" y="5.5" width="7" height="1.8" rx="0.9" fill="var(--color-papel)" opacity="0.55" />
      <path d="M18 12.5v11M12.5 18h11" stroke="var(--color-papel)" strokeWidth="3.2" strokeLinecap="round" />
      <circle cx="28" cy="8" r="4.2" fill="var(--color-acento)" stroke="var(--color-papel)" strokeWidth="1.6" />
    </svg>
  )
}

/** "MegaCel+": el "+" final va en el color de acento. */
export function NombreMarca({ nombre, className = '' }: { nombre: string; className?: string }) {
  const mas = nombre.endsWith('+')
  return (
    <span className={className}>
      {mas ? nombre.slice(0, -1) : nombre}
      {mas && <span className="text-acento">+</span>}
    </span>
  )
}
