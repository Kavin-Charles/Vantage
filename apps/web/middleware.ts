import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/invite', '/api/auth', '/api/config', '/api/invites/accept'];
const SETUP_PATHS = ['/setup', '/api/setup'];

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // INSTALLER_MODE: redirect all non-setup routes to /setup
  if (process.env['INSTALLER_MODE'] === 'true') {
    if (
      pathname.startsWith('/setup') ||
      pathname.startsWith('/api/') ||
      pathname.startsWith('/_next') ||
      pathname.startsWith('/favicon') ||
      pathname.startsWith('/logo') ||
      pathname === '/'
    ) {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL('/setup', req.url));
  }

  // Allow static files, Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.match(/\.(ico|png|jpg|jpeg|svg|css|js|woff2?)$/)
  ) {
    return NextResponse.next();
  }

  // Root page is a server-side router — let it decide setup vs dashboard vs login
  if (pathname === '/') return NextResponse.next();

  const isSetupPath = SETUP_PATHS.some(p => pathname.startsWith(p));
  const isPublicPath = PUBLIC_PATHS.some(p => pathname.startsWith(p));
  const setupDone = req.cookies.get('vencore_setup_done')?.value === '1';

  // Always allow public paths (login, auth, config) regardless of setup state
  if (isPublicPath) return NextResponse.next();

  // Setup guard: redirect to /setup if not configured
  if (!setupDone && !isSetupPath) {
    const setupUrl = new URL('/setup', req.url);
    setupUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(setupUrl);
  }

  // Allow setup and public paths through (no auth cookie required)
  // setup/page.tsx handles the "already configured" redirect server-side
  if (isSetupPath || PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Check for auth cookie
  const token = req.cookies.get('vencore_token');
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
