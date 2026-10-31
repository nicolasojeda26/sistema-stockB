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
  experimental: {
    serverActions: { bodySizeLimit: '4mb' },
  },
}

export default nextConfig
