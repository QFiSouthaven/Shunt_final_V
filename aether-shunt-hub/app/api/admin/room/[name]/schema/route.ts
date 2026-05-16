import { NextResponse } from 'next/server';
import { getIdentity } from '@/lib/auth-headers';
import { workerFetch } from '@/lib/worker-client';
import { beginAudit, completeAudit, failAudit } from '@/lib/audit';
import { wouldSelfBrick } from '@/lib/self-bricking';
import { z } from 'zod';

export async function PUT(request: Request, props: { params: Promise<{ name: string }> }) {
  let auditId;
  try {
    const params = await props.params;
    const { isAdmin, email } = await getIdentity();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
    
    const body = await request.json();
    const SchemaUpdate = z.object({
      policy: z.enum(['strict', 'warn', 'off']),
      zod_json: z.string(),
      updated_by: z.string()
    });
    const parsed = SchemaUpdate.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', details: parsed.error }, { status: 400 });
    }

    const allowedJidsStr = process.env.HUB_ADMIN_JIDS || '';
    const allowedJids = allowedJidsStr.split(',').map(s => s.trim()).filter(Boolean);

    if (!allowedJids.includes(parsed.data.updated_by)) {
      return NextResponse.json({ error: 'updated_by not in HUB_ADMIN_JIDS' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === '1';

    if (parsed.data.policy === 'strict' && !force) {
      if (wouldSelfBrick(parsed.data.zod_json, allowedJids)) {
         return NextResponse.json({ code: 'WOULD_BRICK', error: 'Self-bricking detected' }, { status: 409 });
      }
    }

    auditId = await beginAudit(`UPDATE_ROOM_SCHEMA_${params.name}`, email || ip);

    const res = await workerFetch(`/room/${encodeURIComponent(params.name)}/schema`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed.data)
    });

    if (!res.ok) {
      let errorMessage = `Worker status ${res.status}`;
      try {
        const errData = await res.json();
        errorMessage = errData.error || errorMessage;
      } catch (e) {}

      await failAudit(auditId, errorMessage);
      return NextResponse.json({ error: errorMessage }, { status: res.status });
    }

    await completeAudit(auditId, { room: params.name, policy: parsed.data.policy });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    if (auditId) await failAudit(auditId, error.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
