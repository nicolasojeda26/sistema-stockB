import { db } from '@/lib/db'

// El logo que se sube en Ajustes. Público: también se ve en la pantalla de entrada.
export async function GET() {
  const [f] = await db()<{ valor: string }[]>`select valor from ajustes where clave = 'logo'`
  const m = f?.valor.match(/^data:(image\/(?:png|jpeg|webp|svg\+xml));base64,(.+)$/)
  if (!m) return new Response('Sin logo', { status: 404 })
  return new Response(Buffer.from(m[2], 'base64'), {
    headers: {
      'content-type': m[1],
      'cache-control': 'public, max-age=86400',
      // Un SVG subido no puede ejecutar nada.
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'",
      'x-content-type-options': 'nosniff',
    },
  })
}
