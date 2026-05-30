import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/api/auth', '/api/config'];
const SETUP_PATHS = ['/setup', '/api/setup'];

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow static files, Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.match(/\.(ico|png|jpg|jpeg|svg|css|js|woff2?)$/)
  ) {
    return NextResponse.next();
  }

  const isSetupPath = SETUP_PATHS.some(p => pathname.startsWith(p));
  const setupDone = req.cookies.get('vantage_setup_done')?.value === '1';

  // Setup guard: redirect to /setup if not configured
  if (!setupDone && !isSetupPath) {
    return NextResponse.redirect(new URL('/setup', req.url));
  }

  // Prevent revisiting /setup after completion
  if (setupDone && pathname === '/setup') {
    return NextResponse.redirect(new URL('/', req.url));
  }

  // Allow public paths through (no auth cookie required)
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Check for auth cookie
  const token = req.cookies.get('vantage_token');
  if (!token) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
