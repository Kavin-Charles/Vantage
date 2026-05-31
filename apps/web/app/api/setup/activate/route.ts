import { NextResponse, type NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const from = searchParams.get('from') ?? '/';

  // Only allow relative paths — prevent open redirect
  const target = from.startsWith('/') && !from.startsWith('//') ? from : '/';

  const response = NextResponse.redirect(new URL(target, request.url));
  response.cookies.set('vantage_setup_done', '1', {
    path: '/',
    sameSite: 'lax',
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });
  return response;
}
