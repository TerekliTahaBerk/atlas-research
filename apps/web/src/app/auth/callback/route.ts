import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { serverSupabase } from '@/features/identity/server/supabase';
import { recoveryMarker } from '@/features/identity/server/recovery';
import { safeReturnTo } from '@/features/identity/redirect';
export async function GET(request: NextRequest) {
  const origin = process.env.ATLAS_ORIGIN;
  if (!origin)
    return NextResponse.json(
      { error: 'Authentication is not configured.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  const url = request.nextUrl;
  const code = url.searchParams.get('code');
  const failed = () =>
    NextResponse.redirect(new URL('/login?auth=expired', origin));
  if (!code || url.searchParams.has('error')) return failed();
  const client = await serverSupabase(true);
  const { error } = await client.auth.exchangeCodeForSession(code);
  if (error) return failed();
  const { data, error: verified } = await client.auth.getUser();
  if (verified || !data.user?.email_confirmed_at) return failed();
  let next = safeReturnTo(url.searchParams.get('next'), '/onboarding');
  if (url.searchParams.get('flow') === 'recovery') {
    const jar = await cookies();
    jar.set('atlas-recovery', recoveryMarker(data.user.id), {
      httpOnly: true,
      secure: origin.startsWith('https:'),
      sameSite: 'lax',
      path: '/',
      maxAge: 600,
    });
    next = '/update-password';
  }
  const response = NextResponse.redirect(new URL(next, origin));
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
