import { NextResponse } from 'next/server';
import { getIdentity } from '@/lib/auth-headers';
import { workerFetch } from '@/lib/worker-client';
import { checkRateLimit } from '@/lib/rate-limit';
import { beginAudit, completeAudit, failAudit } from '@/lib/audit';
import { EnvelopeSchema } from '@/lib/envelope-schema';

export async function POST(request: Request) {
  let auditId;
  const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
  
  try {
    const { email } = await getIdentity();
    
    // Rate limit check
    const rateLimit = await checkRateLimit(ip);
    if (!rateLimit.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const body = await request.json();
    const parsed = EnvelopeSchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid envelope schema', details: parsed.error }, { status: 400 });
    }
    
    // Begin audit
    auditId = await beginAudit('SEND_ENVELOPE', email || ip);

    // Forward to worker
    const res = await workerFetch('/send', { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed.data) 
    });
    
    // If worker returns error
    if (!res.ok) {
      // Try to parse error from worker, fallback to status
      let errorMessage = `Worker status: ${res.status}`;
      try {
        const errData = await res.json();
        errorMessage = errData.error || errorMessage;
      } catch (e) {}

      await failAudit(auditId, errorMessage);
      return NextResponse.json({ ok: false, error: errorMessage }, { status: res.status });
    }
    
    // Success flow
    const data = await res.json().catch(() => ({ ok: true, id: 'unknown_id' }));
    
    await completeAudit(auditId, { envelopeId: data.id, to: parsed.data.to, kind: parsed.data.kind });
    return NextResponse.json(data);
    
  } catch (error: any) {
    if (auditId) await failAudit(auditId, error.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
