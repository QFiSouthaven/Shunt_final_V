import Link from 'next/link';

export function Navigation() {
  return (
    <nav className="w-64 border-r border-[#2d2d30] p-6 flex flex-col h-full bg-[#0a0a0b] overflow-y-auto shrink-0">
      <div className="flex items-center space-x-3 mb-8">
        <div className="w-8 h-8 border border-amber-500/50 flex items-center justify-center rotate-45 bg-[#161618]">
          <span className="-rotate-45 text-amber-500 font-serif font-bold text-lg">A</span>
        </div>
        <div>
          <h1 className="font-serif text-lg tracking-tight text-white">Aether Shunt</h1>
          <p className="text-[9px] uppercase tracking-[0.2em] text-amber-500/70 font-semibold">Management Hub</p>
        </div>
      </div>

      <h2 className="text-[11px] uppercase tracking-[0.15em] text-[#808082] mb-4">Core Sections</h2>

      <div className="space-y-2 flex-1">
        <Link href="/" className="block p-3 text-sm text-[#808082] hover:text-white hover:bg-[#161618] transition-colors border-l-2 border-transparent">Dashboard</Link>
        <Link href="/transcript" className="block p-3 text-sm text-[#808082] hover:text-white hover:bg-[#161618] transition-colors border-l-2 border-transparent">Live Transcript</Link>
        <Link href="/peers" className="block p-3 text-sm text-[#808082] hover:text-white hover:bg-[#161618] transition-colors border-l-2 border-transparent">Peers &amp; Inboxes</Link>
        <Link href="/bridges" className="block p-3 text-sm text-[#808082] hover:text-white hover:bg-[#161618] transition-colors border-l-2 border-transparent">Bridges</Link>
        <Link href="/rooms" className="block p-3 text-sm text-[#808082] hover:text-white hover:bg-[#161618] transition-colors border-l-2 border-transparent">Rooms</Link>
        <Link href="/dlq" className="block p-3 text-sm text-[#808082] hover:text-white hover:bg-[#161618] transition-colors border-l-2 border-transparent">Dead Letter Queue</Link>
        <Link href="/settings" className="block p-3 text-sm text-[#808082] hover:text-white hover:bg-[#161618] transition-colors border-l-2 border-transparent">Settings</Link>
      </div>

      <div className="mt-8 pt-6 border-t border-[#2d2d30]">
        <p className="text-[9px] uppercase tracking-[0.2em] text-[#505052] font-semibold mb-2">Loopback only</p>
        <p className="text-[10px] text-[#606062] leading-relaxed">127.0.0.1 services. No auth on this UI — trust boundary is the host.</p>
      </div>
    </nav>
  );
}
