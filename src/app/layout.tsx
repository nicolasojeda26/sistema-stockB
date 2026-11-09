import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import { GeistMono } from 'geist/font/mono'
import '@fontsource-variable/figtree'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'Stock y ventas', template: '%s · Stock y ventas' },
  description: 'Sistema de stock y ventas multisucursal',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = { themeColor: '#111312' }

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="es-AR" data-theme="claro" suppressHydrationWarning className={`${GeistMono.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `try { const saved = localStorage.getItem('sistema-stock-tema') || 'sistema'; const dark = saved === 'oscuro' || (saved === 'sistema' && matchMedia('(prefers-color-scheme: dark)').matches); document.documentElement.dataset.theme = dark ? 'oscuro' : 'claro'; } catch { document.documentElement.dataset.theme = 'claro'; }`,
          }}
        />
        {children}
      </body>
    </html>
  )
}
