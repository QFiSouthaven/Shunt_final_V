// app/api/proxy/route.ts
//
// Server-side health-check proxy.
//
// The browser can't `fetch('http://localhost:1234/v1/models')` because of
// CORS — most local services (LM Studio, AnythingLLM, NEXUS, etc.) don't
// emit `Access-Control-Allow-Origin` for arbitrary local ports. This Next.js
// route runs server-side (Node fetch, no CORS), forwards the request, and
// returns a normalized response shape the HealthPoller understands.
//
// Restricted to localhost / 127.0.0.1 / 0.0.0.0 to prevent SSRF — the
// cockpit only ever needs to talk to processes on the same machine.
//
// Wire format:
//   GET  /api/proxy?url=<encoded full URL>           — health check
//   POST /api/proxy?url=<encoded full URL>           — forward POST body
//
// Response (always 200, ok flag tells you what happened):
//   { ok: boolean, status: number, body: any, error?: string }

import { NextRequest, NextResponse } from 'next/server';

// Loopback-only. 0.0.0.0 deliberately omitted — it means "all interfaces" on
// Linux/macOS/Windows, not "loopback," and the cockpit's registered services
// all bind to 127.0.0.1 anyway.
//
// ⚠ DO NOT re-add '0.0.0.0' without an inline comment justifying it. If the
// hub-relay Worker deploys and you need remote hosts, follow the Q3 design
// in cockpit README "Scheduled" section (separate ALLOWED_REMOTE_HOST_SUFFIXES
// with exact-suffix match, NOT this set). See COWORK_HANDOFF_2026-05-11.md §7.5 #3.
const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1']);
const TIMEOUT_MS = 5000;

function resolveTarget(url: string | null): { ok: true; target: URL } | { ok: false; error: string; status: number } {
  if (!url) return { ok: false, error: 'missing url param', status: 400 };
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return { ok: false, error: 'invalid url', status: 400 };
  }
  if (!ALLOWED_HOSTS.has(target.hostname)) {
    return {
      ok: false,
      error: `host "${target.hostname}" is not on the localhost allowlist`,
      status: 403,
    };
  }
  return { ok: true, target };
}

async function forward(target: URL, init: RequestInit): Promise<NextResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const t0 = performance.now();

  try {
    const res = await fetch(target.toString(), { ...init, signal: controller.signal });
    clearTimeout(timeout);
    const latencyMs = Math.round(performance.now() - t0);

    const contentType = res.headers.get('content-type') ?? '';
    let body: unknown;
    if (contentType.includes('application/json')) {
      body = await res.json().catch(() => null);
    } else {
      const text = await res.text().catch(() => '');
      // Cap text payload so a giant HTML page can't blow up the response.
      body = text.length > 2048 ? text.slice(0, 2048) + '…' : text;
    }

    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      latencyMs,
      body,
    });
  } catch (err) {
    clearTimeout(timeout);
    const isAbort = err instanceof DOMException && err.name === 'AbortError';
    const message = isAbort ? 'timeout' : err instanceof Error ? err.message : String(err);
    return NextResponse.json({
      ok: false,
      status: 0,
      latencyMs: Math.round(performance.now() - t0),
      body: null,
      error: message,
    });
  }
}

export async function GET(req: NextRequest) {
  const resolved = resolveTarget(req.nextUrl.searchParams.get('url'));
  if (!resolved.ok) {
    return NextResponse.json({ ok: false, status: resolved.status, error: resolved.error }, { status: resolved.status });
  }
  return forward(resolved.target, { method: 'GET' });
}

export async function POST(req: NextRequest) {
  const resolved = resolveTarget(req.nextUrl.searchParams.get('url'));
  if (!resolved.ok) {
    return NextResponse.json({ ok: false, status: resolved.status, error: resolved.error }, { status: resolved.status });
  }
  const body = await req.text().catch(() => '');
  return forward(resolved.target, {
    method: 'POST',
    headers: { 'content-type': req.headers.get('content-type') ?? 'application/json' },
    body: body || undefined,
  });
}
