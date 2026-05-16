import { NextResponse } from 'next/server';
import { getIdentity } from '@/lib/auth-headers';

export async function GET(request: Request) {
  try {
    const { isAdmin } = await getIdentity();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const jidsStr = process.env.HUB_ADMIN_JIDS || '';
    const jids = jidsStr.split(',').map(s => s.trim()).filter(Boolean);

    return NextResponse.json({ jids });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
