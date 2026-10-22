import { randomBytes } from 'node:crypto';
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
export async function proxy(request: NextRequest) {
  if (process.env.ATLAS_MODE !== 'live') return NextResponse.next();
  const nonce = randomBytes(16).toString('base64');
  const requestHeaders = new Headers(request.headers);
  const provider = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
    : '';
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${process.env.NODE_ENV === 'development' ? "'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    `connect-src 'self' ${provider} ${process.env.NODE_ENV === 'development' ? 'ws://127.0.0.1:3102' : ''}`,
    "font-src 'self'",
    "img-src 'self' data: blob:",
    "frame-src 'self'",
    "frame-ancestors 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', policy);
  let response = NextResponse.next({ request: { headers: requestHeaders } });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    return new NextResponse('Authentication unavailable', { status: 503 });
  const client = createServerClient(url, key, {
    cookieOptions: {
      path: '/',
      sameSite: 'lax',
      secure: process.env.ATLAS_ORIGIN?.startsWith('https://') === true,
    },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (values) => {
        for (const { name, value } of values) request.cookies.set(name, value);
        requestHeaders.set('cookie', request.headers.get('cookie') ?? '');
        response = NextResponse.next({ request: { headers: requestHeaders } });
        for (const { name, value, options } of values)
          response.cookies.set(name, value, options);
      },
    },
  });
  // Refresh cookies only. Pages/services independently verify identity and scope.
  await client.auth.getUser();
  response.headers.set('Content-Security-Policy', policy);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|woff2?)$).*)',
  ],
};
