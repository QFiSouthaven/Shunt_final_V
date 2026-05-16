// proxy.ts — request middleware (Next 16+).
//
// Renamed from middleware.ts on 2026-05-13. Next 16 deprecated the
// `middleware.ts` filename in favor of `proxy.ts`; the auto-shim still
// resolves the old name but emits a startup warning on every dev boot.
// Renaming closes the warning. No behavioral change.
//
// Function name stays `middleware` — Next reads the default/named export
// regardless of the file name. Renaming the export would be an unnecessary
// downstream churn.
//
// v1 trusts the `x-auth-email` header (set from `?jid=` query param or
// HUB_DEV_JID env). Cloudflare Access SSO replaces this in v2.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const reqHeaders = new Headers(request.headers);
  const searchParams = request.nextUrl.searchParams;

  const email =
    reqHeaders.get('x-auth-email') ||
    searchParams.get('jid') ||
    process.env.HUB_DEV_JID ||
    '';

  let isAdmin = false;
  if (email && process.env.HUB_ADMIN_JIDS) {
    const adminJids = process.env.HUB_ADMIN_JIDS.split(',');
    if (adminJids.includes(email)) {
      isAdmin = true;
    }
  }

  reqHeaders.set('x-auth-email', email);
  reqHeaders.set('x-is-admin', isAdmin ? '1' : '0');

  return NextResponse.next({ request: { headers: reqHeaders } });
}
