// Identity resolver for server-side route handlers.
//
// The flow:
//   1. middleware.ts inspects each incoming request, resolves the caller's JID
//      from (in order): `x-auth-email` header, `?jid=` query param, or
//      `HUB_DEV_JID` env var.
//   2. If that JID appears in `HUB_ADMIN_JIDS` (comma-separated env), middleware
//      stamps `x-is-admin: 1` on the forwarded request headers.
//   3. This function reads those header stamps and returns them to admin
//      handlers, which 403 on `isAdmin === false`.
//
// Default-deny. If no identity inputs are provided and HUB_DEV_JID is unset,
// the caller is anonymous and isAdmin is false.
//
// v2 will replace the header-trust model with Cloudflare Access SSO; for
// loopback dev, header-trust + HUB_DEV_JID is the intended mechanism.

import { headers } from 'next/headers';

export interface Identity {
  isAdmin: boolean;
  email: string;
}

export async function getIdentity(): Promise<Identity> {
  const h = await headers();
  const email = h.get('x-auth-email') ?? '';
  const isAdmin = h.get('x-is-admin') === '1';
  return { isAdmin, email };
}
