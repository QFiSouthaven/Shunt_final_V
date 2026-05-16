// Stub audit log — real implementation is backed by AUDIT_KV on Cloudflare Pages.
// Local dev returns no-op placeholders so admin routes don't crash.
export async function beginAudit(a: string, b: string) { return "id"; }
export async function completeAudit(id: string, obj: any) {}
export async function failAudit(id: string, msg: string) {}

export type AuditEntry = {
  id: string;
  action: string;
  actor: string;
  startedAt: string;
  completedAt?: string;
  failedAt?: string;
  detail?: unknown;
  error?: string;
};

export async function getAuditLogs(_status?: string): Promise<AuditEntry[]> { return []; }
export async function getPendingOlderThan60sCount(): Promise<number> { return 0; }
