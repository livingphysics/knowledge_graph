import crypto from 'node:crypto';
import { cookies } from 'next/headers';

const COOKIE_NAME = 'kg_auth';

/**
 * For use inside server actions. If SITE_PASSWORD is set, throws unless the
 * caller has a valid `kg_auth` cookie. No-op when SITE_PASSWORD is unset.
 *
 * Needed because the middleware bypasses multipart/form-data requests (Next
 * 15.5.x's middleware has a 10MB body buffer limit and no per-request opt-out
 * config), so server actions handling uploads have to gate themselves.
 */
export async function requireAuth(): Promise<void> {
  const password = process.env.SITE_PASSWORD;
  if (!password) return;
  const expected = crypto.createHash('sha256').update(password).digest('hex');
  const jar = await cookies();
  if (jar.get(COOKIE_NAME)?.value !== expected) {
    throw new Error('Unauthorized');
  }
}
