import { NextResponse } from 'next/server'

export async function middleware() {
  // Auth is verified by the backend API (/api/auth/me) via client-side refresh.
  // Cross-origin cookie auth does not expose backend cookies to frontend middleware.
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
