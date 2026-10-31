import type { Metadata, Viewport } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'Stock y ventas', template: '%s · Stock y ventas' },
  description: 'Sistema de stock y ventas multisucursal',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = { themeColor: '#16202e' }

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="es-AR" className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  )
}
