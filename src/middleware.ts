import { NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME = 'kg_auth';

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function middleware(req: NextRequest) {
  const password = process.env.SITE_PASSWORD;
  // Gate disabled: deploy without SITE_PASSWORD and the site is wide open as before.
  if (!password) return NextResponse.next();

  const path = req.nextUrl.pathname;
  // Always allow the login page itself (otherwise we redirect-loop).
  if (path === '/login' || path.startsWith('/login/')) return NextResponse.next();

  const cookie = req.cookies.get(COOKIE_NAME)?.value ?? '';
  const expected = await sha256Hex(password);
  if (cookie === expected) return NextResponse.next();

  // Programmatic clients (curl, fetch from another tool) get a clean 401.
  if (path.startsWith('/api/')) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // Otherwise redirect to login with a sanitized return URL.
  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = '/login';
  loginUrl.search = `?next=${encodeURIComponent(path + req.nextUrl.search)}`;
  return NextResponse.redirect(loginUrl);
}

// Next already skips middleware for /_next/static and /_next/image. We also
// exempt favicon and the PDF.js worker (which is fetched without our cookie).
//
// IMPORTANT: we also skip middleware for multipart/form-data requests because
// Next 15.5.x's middleware buffers request bodies up to 10MB with no way to
// raise the limit. Server actions that accept file uploads (/new, /n/[…]/edit)
// must call requireAuth() from '@/lib/auth' to compensate.
export const config = {
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon.ico|pdf\\.worker\\.min\\.mjs).*)',
      // Browsers consistently send lowercase here; no case-insensitive flag needed
      // (JS regex doesn't support inline (?i) anyway).
      missing: [{ type: 'header', key: 'content-type', value: 'multipart/form-data.*' }],
    },
  ],
};
