import { NextResponse } from 'next/server';
import { beginAudit, completeAudit, failAudit } from '@/lib/audit';
import { checkRateLimit } from '@/lib/rate-limit';
import { z } from 'zod';

export async function POST(request: Request) {
  let auditId;
  try {
    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
    const rateLimit = await checkRateLimit(ip);
    if (!rateLimit.success) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    const body = await request.json();
    const Parsed = z.object({ url: z.string() }).safeParse(body);
    if (!Parsed.success) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const url = Parsed.data.url;
    if ((!url.startsWith('https://') || !url.endsWith('.trycloudflare.com')) && !url.startsWith('http://localhost:7777')) {
      return NextResponse.json({ error: 'Invalid URL. Must be *.trycloudflare.com or http://localhost:7777' }, { status: 400 });
    }

    auditId = await beginAudit('SET_TUNNEL_URL', ip);

    // Save tunnel URL (mock)
    // process.env.TUNNEL_URL = url;
    
    await completeAudit(auditId, { action: 'set_tunnel_url', target: url });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    if (auditId) await failAudit(auditId, error.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
