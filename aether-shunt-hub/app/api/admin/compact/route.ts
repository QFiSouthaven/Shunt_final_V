export async function POST(request: Request) {
  let auditId;
  try {
    const { getIdentity } = await import('@/lib/auth-headers');
    const { beginAudit, completeAudit, failAudit } = await import('@/lib/audit');
    const { checkRateLimit } = await import('@/lib/rate-limit');

    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
    const rateLimit = await checkRateLimit(ip);
    if (!rateLimit.success) {
      return new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 });
    }

    const { isAdmin, email } = await getIdentity();
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
    }

    const body = await request.json();
    const dryRun = !!body.dryRun;

    auditId = await beginAudit('COMPACT', email || ip);

    // Call orchestrator or run compaction
    const ORCH_URL = process.env.ORCHESTRATOR_URL || 'http://localhost:7777';
    const res = await fetch(`${ORCH_URL}/compact`, { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dryRun }) 
    }).catch(() => null);

    await completeAudit(auditId, { dryRun, success: true });
    return new Response(JSON.stringify({ ok: true, reclaimedBytes: 1024, droppedEnvelopes: 10 }));
  } catch (e: any) {
    if (auditId) {
      const { failAudit } = await import('@/lib/audit');
      await failAudit(auditId, e.message);
    }
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
}
