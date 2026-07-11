import { NextResponse, type NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const from = searchParams.get('from') ?? '/';

  // Only allow relative paths — prevent open redirect
  const target = from.startsWith('/') && !from.startsWith('//') ? from : '/';

  // Relative Location: request.url reflects the container host (localhost:3000)
  // behind the reverse proxy, so an absolute URL would leave the site
  const response = new NextResponse(null, {
    status: 307,
    headers: { Location: target },
  });
  response.cookies.set('vencore_setup_done', '1', {
    path: '/',
    sameSite: 'lax',
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });
  return response;
}
