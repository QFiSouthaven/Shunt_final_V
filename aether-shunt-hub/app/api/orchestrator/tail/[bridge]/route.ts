import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';

export async function GET(request: Request, props: { params: Promise<{ bridge: string }> }) {
  try {
    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
    const rateLimit = await checkRateLimit(ip);
    if (!rateLimit.success) {
      return new Response('Too many requests', { status: 429 });
    }

    const { bridge } = await props.params;
    const allowlist = ["all", "lmstudio-bridge", "gemini-bridge", "retry-daemon", "panel-server"];
    if (!allowlist.includes(bridge)) {
       return new Response('Invalid bridge', { status: 400 });
    }

    const ORCH_URL = process.env.ORCHESTRATOR_URL || 'http://localhost:7777';
    const res = await fetch(`${ORCH_URL}/tail/${bridge}`);
    
    return new Response(res.body || new ReadableStream(), {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    // Return dummy stream
    let count = 0;
    const stream = new ReadableStream({
      start(controller) {
        setInterval(() => {
          count++;
          controller.enqueue(new TextEncoder().encode(`data: [sys] bridge mock log ${count}\\n\\n`));
        }, 3000);
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      },
    });
  }
}
