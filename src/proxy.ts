import { NextResponse, type NextRequest } from 'next/server'
import { COOKIE_SESION, leerSesion } from '@/lib/sesion'

// Chequeo rápido: sin sesión válida, al login. La verificación completa
// (usuario activo, rol) la hace cada página y cada acción con lib/dal.
export async function proxy(req: NextRequest) {
  const sesion = await leerSesion(req.cookies.get(COOKIE_SESION)?.value)
  const enLogin = req.nextUrl.pathname === '/login'
  if (!sesion && !enLogin) return NextResponse.redirect(new URL('/login', req.url))
  if (sesion && enLogin) return NextResponse.redirect(new URL('/', req.url))
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:png|svg|jpg|ico)$).*)'],
}
