import { headers } from 'next/headers';
import { listReactions, toggleReaction } from '@/lib/reactions';
import { getNode } from '@/lib/nodes';

export const dynamic = 'force-dynamic';

async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null;
}

interface ToggleBody {
  slug?: string;
  emoji?: string;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as ToggleBody;
  const slug = body.slug?.trim();
  const emoji = body.emoji?.trim();
  if (!slug || !emoji) {
    return Response.json({ error: 'slug and emoji required' }, { status: 400 });
  }
  if (!getNode(slug)) {
    return Response.json({ error: 'node not found' }, { status: 404 });
  }

  const ip = await clientIp();
  try {
    toggleReaction(slug, emoji, ip);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'toggle failed' },
      { status: 400 }
    );
  }
  return Response.json({ reactions: listReactions(slug, ip) });
}
