// app/settings/actions.ts
"use server";

import { redirect } from 'next/navigation';
import { beginAudit, completeAudit, failAudit } from '@/lib/audit';

export async function saveWizardSettings(formData: FormData) {
  const workerUrl = formData.get("workerUrl") as string;
  const secret = formData.get("secret") as string;
  const cfAccount = formData.get("cfAccount") as string;
  const adminJids = formData.get("adminJids") as string;

  const auditId = await beginAudit("BOOTSTRAP_WIZARD", "bootstrap");

  process.env.WORKER_URL = workerUrl;
  if (secret) process.env.WORKER_SECRET = secret;
  process.env.CF_ACCOUNT = cfAccount;
  process.env.HUB_ADMIN_JIDS = adminJids;
  process.env.ONBOARDING_COMPLETE = "1";

  await completeAudit(auditId, {
    action: "configured",
    workerUrl,
    cfAccount,
    adminJids,
    secret: "<redacted>"
  });

  redirect("/");
}
