import type { MetadataRoute } from 'next'

/** Permite "instalar" el sistema en la computadora o tablet de la caja, como una app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Stock y ventas',
    short_name: 'Stock',
    description: 'Sistema de stock y ventas',
    start_url: '/',
    display: 'standalone',
    background_color: '#f6f5f1',
    theme_color: '#16202e',
    lang: 'es-AR',
    icons: [
      { src: '/icono-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icono-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
