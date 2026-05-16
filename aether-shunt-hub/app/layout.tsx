import type {Metadata} from 'next';
import './globals.css';
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { Navigation } from "@/components/layout/Navigation";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: 'Aether Shunt — Management Hub',
  description: 'Hub-bus operations console: bridges, DLQ, peers, transcript, admin.',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <body suppressHydrationWarning className="bg-[#0a0a0b] text-slate-300">
        <div className="flex h-screen w-screen overflow-hidden">
          <Navigation />
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </body>
    </html>
  );
}
