import { NextResponse, type NextRequest } from 'next/server'
import { COOKIE_SESION, leerSesion } from '@/lib/sesion'

// Chequeo rápido: sin sesión válida, al login. La verificación completa
// (usuario activo, rol) la hace cada página y cada acción con lib/dal.
export async function proxy(req: NextRequest) {
  const sesion = await leerSesion(req.cookies.get(COOKIE_SESION)?.value)
  const enLogin = req.nextUrl.pathname === '/login'
  // El seguimiento de reparaciones es público: el cliente entra con su enlace (no se puede adivinar).
  const publica = enLogin || ['/activar', '/logo'].includes(req.nextUrl.pathname) || req.nextUrl.pathname.startsWith('/seguimiento/')
  if (!sesion && !publica) return NextResponse.redirect(new URL('/login', req.url))
  if (sesion && enLogin) {
    // Sesión vencida del lado del servidor: se borra la cookie y se muestra el login.
    if (req.nextUrl.searchParams.has('salir')) {
      const r = NextResponse.next()
      r.cookies.delete(COOKIE_SESION)
      return r
    }
    return NextResponse.redirect(new URL('/', req.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:png|svg|jpg|ico)$).*)'],
}
