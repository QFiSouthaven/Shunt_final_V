import { NextResponse } from 'next/server';
import { getIdentity } from '@/lib/auth-headers';
import { getAuditLogs, getPendingOlderThan60sCount } from '@/lib/audit';

export async function GET(request: Request) {
  try {
    const { isAdmin } = await getIdentity();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'completed';

    const entries = await getAuditLogs(status);
    const pendingOlderThan60s = await getPendingOlderThan60sCount();

    return NextResponse.json({ entries, pendingOlderThan60s });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
