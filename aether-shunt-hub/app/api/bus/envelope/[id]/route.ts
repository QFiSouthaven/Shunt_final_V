import { NextResponse } from 'next/server';
import { panelFetch } from '@/lib/panel-client';

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const params = await props.params;
    const res = await panelFetch(`/api/envelope/${encodeURIComponent(params.id)}`);
    if (!res.ok) {
      return NextResponse.json({ error: `Panel status: ${res.status}` }, { status: res.status });
    }
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to access panel server' }, { status: 502 });
  }
}
