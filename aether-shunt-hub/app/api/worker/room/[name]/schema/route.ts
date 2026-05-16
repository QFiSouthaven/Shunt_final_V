import { NextResponse } from 'next/server';
import { workerFetch } from '@/lib/worker-client';

export async function GET(request: Request, props: { params: Promise<{ name: string }> }) {
  try {
    const params = await props.params;
    const res = await workerFetch(`/room/${encodeURIComponent(params.name)}/schema`);
    if (!res.ok) {
      if (res.status === 404) {
         return NextResponse.json({ code: 'NOT_FOUND', error: 'Not found' }, { status: 404 });
      }
      return NextResponse.json({ error: `Worker status: ${res.status}` }, { status: res.status });
    }
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to access worker' }, { status: 502 });
  }
}
