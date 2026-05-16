import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';

export async function GET(request: Request) {
  try {
    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
    const rateLimit = await checkRateLimit(ip);
    if (!rateLimit.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const ORCH_URL = process.env.ORCHESTRATOR_URL || 'http://localhost:7777';
    const res = await fetch(`${ORCH_URL}/status`);
    if (!res.ok) {
      return NextResponse.json(
        { bridges: [], orchestratorDown: true, reason: `Orchestrator returned ${res.status}` },
        { status: 502 },
      );
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    // Real failure surface — no fake bridge data. The UI must distinguish
    // "orchestrator down" from "orchestrator up but no bridges" or the
    // operator will trust hallucinated state.
    return NextResponse.json(
      { bridges: [], orchestratorDown: true, reason: error?.message ?? 'fetch failed' },
      { status: 502 },
    );
  }
}
