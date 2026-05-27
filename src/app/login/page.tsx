import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { siteTitle } from '@/lib/site';

export const dynamic = 'force-dynamic';

const COOKIE_NAME = 'kg_auth';
const ONE_MONTH = 60 * 60 * 24 * 30;

/** Only accept relative paths starting with a single `/` to prevent open-redirects. */
function safeNext(next: string | undefined | null): string {
  if (next && next.startsWith('/') && !next.startsWith('//')) return next;
  return '/';
}

interface Props {
  searchParams: Promise<{ next?: string; error?: string }>;
}

export default async function LoginPage({ searchParams }: Props) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  const error = sp.error === '1';

  async function login(formData: FormData) {
    'use server';
    const submitted = String(formData.get('password') ?? '');
    const expected = process.env.SITE_PASSWORD;
    const nextParam = safeNext(String(formData.get('next') ?? '/'));

    if (!expected || submitted !== expected) {
      const params = new URLSearchParams({ error: '1' });
      if (nextParam !== '/') params.set('next', nextParam);
      redirect(`/login?${params.toString()}`);
    }

    const value = crypto.createHash('sha256').update(expected).digest('hex');
    const jar = await cookies();
    jar.set(COOKIE_NAME, value, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: ONE_MONTH,
    });
    redirect(nextParam);
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <form action={login} className="w-full max-w-sm flex flex-col gap-3">
        <h1 className="text-2xl font-semibold mb-1">{siteTitle()}</h1>
        <p className="text-sm text-neutral-400 [html.light_&]:text-neutral-600">
          This site is password-protected.
        </p>
        <input type="hidden" name="next" value={next} />
        <input
          type="password"
          name="password"
          required
          autoFocus
          autoComplete="current-password"
          placeholder="Password"
          className="px-3 py-2 rounded bg-neutral-900 [html.light_&]:bg-white border border-neutral-700 [html.light_&]:border-neutral-300 focus:outline-none focus:border-sky-500"
        />
        {error && <div className="text-sm text-red-400">Wrong password.</div>}
        <button
          type="submit"
          className="px-4 py-2 rounded bg-sky-700 hover:bg-sky-600 text-white"
        >
          Unlock
        </button>
      </form>
    </main>
  );
}
