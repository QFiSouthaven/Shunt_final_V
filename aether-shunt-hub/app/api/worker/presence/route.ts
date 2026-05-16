import { NextResponse } from 'next/server';
import { workerFetch } from '@/lib/worker-client';

export async function GET() {
  try {
    const res = await workerFetch('/presence');
    if (!res.ok) {
      return NextResponse.json({ error: `Worker status: ${res.status}` }, { status: res.status });
    }
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to access worker' }, { status: 502 });
  }
}
