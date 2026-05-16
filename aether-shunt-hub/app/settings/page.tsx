import { FirstRunWizard } from "@/components/section8/FirstRunWizard";
import { TunnelURLConfig } from "@/components/section8/TunnelURLConfig";
import { FeatureFlagToggles } from "@/components/section8/FeatureFlagToggles";
import { EmbeddedHandbook } from "@/components/section8/EmbeddedHandbook";
import { RecoveryInstructions } from "@/components/section8/RecoveryInstructions";
import { ConnectionDiagnostics } from "@/components/section8/ConnectionDiagnostics";
import { CleanupActions } from "@/components/section8/CleanupActions";
import { getIdentity } from "@/lib/auth-headers";
import { Settings } from "lucide-react";
import fs from "fs";
import path from "path";

export default async function SettingsPage() {
  const onboardingComplete = process.env.ONBOARDING_COMPLETE === "1" || !!process.env.WORKER_SECRET;
  
  if (!onboardingComplete) {
    return (
      <div className="p-6 flex flex-col min-h-screen overflow-hidden">
        <FirstRunWizard />
      </div>
    );
  }

  const identity = await getIdentity();
  
  let handbookContent = "";
  try {
    handbookContent = fs.readFileSync(path.join(process.cwd(), "HANDBOOK.md"), "utf-8");
  } catch {
    handbookContent = "";
  }

  const initialTunnel = process.env.TUNNEL_URL || "";

  return (
    <div className="p-6 flex flex-col min-h-screen">
      <div className="shrink-0 mb-6">
        <h2 className="text-xl font-bold font-mono text-white tracking-wide flex items-center gap-2">
          <Settings className="h-5 w-5 text-slate-400" />
          SYSTEM CONFIGURATION
        </h2>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 w-full max-w-6xl pb-12">
         {/* Left Col */}
         <div className="space-y-6">
            <TunnelURLConfig initialUrl={initialTunnel} />
            <FeatureFlagToggles defaults={{ dualWrite: false, sound: false, theme: 'dark' }} />
            <ConnectionDiagnostics />
            {identity?.isAdmin && (
              <CleanupActions />
            )}
         </div>

         {/* Right Col */}
         <div className="space-y-6">
            <RecoveryInstructions />
            <EmbeddedHandbook content={handbookContent} />
         </div>
      </div>
    </div>
  );
}
