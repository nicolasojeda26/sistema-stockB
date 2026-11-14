import type { NextConfig } from 'next'

// App interna: todas las páginas son dinámicas (dependen del usuario logueado),
// así que no se usan cacheComponents ni prefetch parcial.
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
  // Cabeceras de seguridad: no se puede meter el sistema dentro de otra página (clickjacking),
  // no se filtra la URL a otros sitios y el navegador no adivina tipos de archivo.
  async headers() {
    return [
      {
        // /logo pone su propia política (un SVG subido no puede ejecutar nada).
        source: '/((?!logo$).*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
        ],
      },
    ]
  },
  experimental: {
    serverActions: { bodySizeLimit: '4mb' },
  },
}

export default nextConfig
