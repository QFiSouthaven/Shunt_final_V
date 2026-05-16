import { panelFetch } from '@/lib/panel-client';

export async function GET(request: Request) {
  try {
    const res = await panelFetch(`/api/stream`, {
      headers: {
        Accept: 'text/event-stream'
      }
    });

    return new Response(res.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    return new Response('Failed to connect to stream', { status: 502 });
  }
}
