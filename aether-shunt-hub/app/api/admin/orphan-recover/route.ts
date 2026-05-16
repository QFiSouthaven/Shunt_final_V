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

    auditId = await beginAudit('ORPHAN_RECOVER', email || ip);

    // Call orchestrator or run recovery
    const ORCH_URL = process.env.ORCHESTRATOR_URL || 'http://localhost:7777';
    const res = await fetch(`${ORCH_URL}/orphan-recover`, { method: 'POST' }).catch(() => null);

    await completeAudit(auditId, { success: true });
    return new Response(JSON.stringify({ ok: true, recovered: 3 }));
  } catch (e: any) {
    if (auditId) {
      const { failAudit } = await import('@/lib/audit');
      await failAudit(auditId, e.message);
    }
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
}
