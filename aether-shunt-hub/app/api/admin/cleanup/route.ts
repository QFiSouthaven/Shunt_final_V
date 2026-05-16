import { NextResponse } from 'next/server';
import { getIdentity } from '@/lib/auth-headers';
import { beginAudit, completeAudit, failAudit } from '@/lib/audit';
import { checkRateLimit } from '@/lib/rate-limit';
import { z } from 'zod';

export async function POST(request: Request) {
  let auditId;
  try {
    const { isAdmin, email } = await getIdentity();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
    const rateLimit = await checkRateLimit(ip);
    if (!rateLimit.success) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    const body = await request.json();
    const Parsed = z.object({ pattern: z.string() }).safeParse(body);
    if (!Parsed.success) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const pattern = Parsed.data.pattern;
    const allowedPatterns = ['*.tmp', '*.bak'];
    if (!allowedPatterns.includes(pattern)) {
      return NextResponse.json({ error: 'Pattern not allowed' }, { status: 400 });
    }

    auditId = await beginAudit(`CLEANUP_ARTIFACTS_${pattern}`, email || ip);

    // Mock cleanup logic
    
    await completeAudit(auditId, { action: 'cleanup', pattern });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    if (auditId) await failAudit(auditId, error.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
