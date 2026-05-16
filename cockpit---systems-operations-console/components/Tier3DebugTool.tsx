'use client';

import React, { useEffect, useMemo, useState, useRef } from 'react';
import { eventBus, SystemEvent } from '@/lib/eventBus';
import { useHealth } from './HealthPoller';
import { TerminalIcon, AlertCircleIcon, PlayIcon, RefreshIcon } from '@/components/icons';
import { useTranscriptTail, TranscriptRow } from '@/hooks/use-transcript-tail';

function EventStream() {
  const [events, setEvents] = useState<SystemEvent[]>(() => {
    if (typeof window === 'undefined') return [];
    return eventBus.getHistory();
  });
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = eventBus.subscribe((e) => {
      setEvents(prev => [...prev, e]);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  return (
    <div className="flex flex-col h-[400px] bg-[#d5d3cb] border-2 border-[#b8b6af] shadow-inner rounded-sm overflow-hidden font-mono text-[10px] tracking-widest uppercase text-[#33312e] relative">
      <div className="absolute inset-x-0 inset-y-0 pointer-events-none z-10 shadow-[inner_0_2px_6px_rgba(0,0,0,0.1)]"></div>
      <div className="bg-[#c2c0b8] px-4 py-2 border-b-2 border-b-[#a2a098] flex items-center justify-between text-[#4a4843] font-bold shadow-sm relative z-20">
        <span className="flex items-center gap-2"><TerminalIcon className="w-4 h-4"/> EVENT_STREAM</span>
        <span>{events.length} EVENTS</span>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2 relative z-20">
         {events.map(ev => {
            const date = new Date(ev.timestamp);
            const timeStr = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
            const levelColor = ev.level === 'error' ? 'text-[#dc2626]' : ev.level === 'warn' ? 'text-[#b45309]' : 'text-[#16a34a]';
            
            return (
              <div key={ev.id} className="flex flex-col gap-1 border-b border-[#c2c0b8] pb-2 last:border-0 hover:bg-[#e4e2d9]/50">
                 <div className="flex items-start gap-4">
                    <span className="text-[#8c8a85] shrink-0">[{timeStr}]</span>
                    <span className={`shrink-0 w-24 font-bold ${levelColor}`}>[{ev.systemId}]</span>
                    <span className="text-[#33312e] break-all max-w-[500px]">{ev.message}</span>
                 </div>
                 {ev.data && (
                   <div className="grid grid-cols-[auto_1fr] gap-4">
                      <div className="w-24 shrink-0 col-start-2"></div>
                      <pre className="text-[#6c6a65] bg-[#cccaa] bg-opacity-30 border border-[#b8b6af] p-2 text-[10px] overflow-x-auto whitespace-pre-wrap rounded-sm shadow-inner">
                        {JSON.stringify(ev.data, null, 2)}
                      </pre>
                   </div>
                 )}
              </div>
            );
         })}
         {events.length === 0 && <div className="text-[#8c8a85] text-center py-8 font-bold">NO_EVENTS_YET</div>}
      </div>
    </div>
  );
}

function EndpointTester() {
  const { systems } = useHealth();
  const [method, setMethod] = useState('GET');
  const [url, setUrl] = useState('');
  const [body, setBody] = useState('');
  
  const handleTest = async () => {
     if (!url) return;
     eventBus.emit('tester', 'info', `Testing ${method} ${url}`);
     try {
        const opts: RequestInit = { method };
        if (method !== 'GET' && method !== 'HEAD' && body) {
           opts.body = body;
           opts.headers = { 'Content-Type': 'application/json' };
        }
        
        const res = await fetch(url, opts);
        const text = await res.text();
        let parsed = text;
        try { parsed = JSON.parse(text); } catch(e) {}
        
        eventBus.emit('tester', res.ok ? 'info' : 'warn', `Response ${res.status}`, parsed);
     } catch (e: any) {
        eventBus.emit('tester', 'error', `Fetch failed: ${e.message}`);
     }
  };

  return (
    <div className="bg-[#d5d3cb] border-2 border-[#b8b6af] rounded-sm p-5 flex flex-col gap-4 font-mono text-[10px] uppercase tracking-widest text-[#33312e] shadow-inner relative">
       <div className="flex items-center gap-2 text-[#4a4843] border-b-2 border-b-[#a2a098] pb-2 font-bold mb-1">
         <PlayIcon className="w-4 h-4"/> ENDPOINT_TESTER
       </div>
       <div className="flex gap-2">
          <select value={method} onChange={e => setMethod(e.target.value)} className="bg-[#eeece3] border-2 border-t-[#b8b6af] border-l-[#b8b6af] border-b-white border-r-white text-[#33312e] px-2 py-1 outline-none shadow-inner font-bold">
             {['GET','POST','PUT','DELETE','PATCH'].map(m => <option key={m}>{m}</option>)}
          </select>
          <input 
             value={url} onChange={e => setUrl(e.target.value)} 
             placeholder="http://localhost:..." 
             className="flex-1 bg-[#eeece3] border-2 border-t-[#b8b6af] border-l-[#b8b6af] border-b-white border-r-white text-[#33312e] px-3 py-1 outline-none placeholder-[#8c8a85] shadow-inner"
          />
          <button onClick={handleTest} className="bg-[#c2c0b8] text-[#33312e] hover:bg-[#a2a098] active:bg-[#e4e2d9] px-4 py-1 font-bold border-2 border-t-white border-l-white border-b-[#a2a098] border-r-[#a2a098] transition-colors shadow-sm active:shadow-inner">SEND</button>
       </div>
       {(method !== 'GET' && method !== 'HEAD') && (
          <textarea 
             value={body} onChange={e => setBody(e.target.value)}
             placeholder="{...}"
             className="w-full h-24 bg-[#eeece3] border-2 border-t-[#b8b6af] border-l-[#b8b6af] border-b-white border-r-white text-[#33312e] p-3 outline-none resize-none font-mono text-[10px] placeholder-[#8c8a85] shadow-inner leading-relaxed"
          />
       )}
       <div className="flex gap-2 flex-wrap text-[#6c6a65] mt-1 font-bold">
          QUICK_FILL:
          {systems.filter(s => s.url).map(s => (
             <button key={s.id} onClick={() => { setUrl(s.url + (s.healthPath||'')); setMethod('GET'); }} className="hover:text-[#33312e] underline decoration-[#a2a098] underline-offset-2 transition-colors">
               {s.name}
             </button>
          ))}
       </div>
    </div>
  );
}

function TranscriptTail() {
  const { rows, loading, error, daemonDown, refresh } = useTranscriptTail(50, 3000);
  const [fromFilter, setFromFilter] = useState('');
  const [toFilter, setToFilter] = useState('');
  const [search, setSearch] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const jids = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) {
      if (r.from) s.add(String(r.from));
      if (r.to) s.add(String(r.to));
    }
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter(r => {
      if (fromFilter && String(r.from || '') !== fromFilter) return false;
      if (toFilter && String(r.to || '') !== toFilter) return false;
      if (q && !String(r.body || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, fromFilter, toFilter, search]);

  // Scroll-bottom-on-update: new tail data → pin to bottom.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filtered]);

  const fmtTs = (ts: TranscriptRow['ts']): string => {
    if (!ts) return '--:--:--';
    const d = typeof ts === 'number' ? new Date(ts) : new Date(String(ts));
    if (isNaN(d.getTime())) return String(ts).slice(0, 8);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-[400px] bg-[#d5d3cb] border-2 border-[#b8b6af] shadow-inner rounded-sm overflow-hidden font-mono text-[10px] tracking-widest uppercase text-[#33312e] relative">
      <div className="bg-[#c2c0b8] px-4 py-2 border-b-2 border-b-[#a2a098] flex items-center justify-between text-[#4a4843] font-bold shadow-sm relative z-20">
        <span className="flex items-center gap-2"><TerminalIcon className="w-4 h-4"/> TRANSCRIPT_TAIL</span>
        <span className="flex items-center gap-2">
          <span>{filtered.length}/{rows.length}</span>
          <button
            onClick={refresh}
            disabled={loading}
            className="bg-[#dfddd4] hover:bg-[#e4e2d9] active:bg-[#c2c0b8] border border-[#a2a098] px-2 py-0.5 disabled:opacity-50 flex items-center gap-1"
            title="Refresh"
          >
            <RefreshIcon className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </span>
      </div>
      <div className="bg-[#cccac2] px-3 py-2 border-b border-[#a2a098] grid grid-cols-3 gap-2 text-[#33312e] relative z-20">
        <select
          value={fromFilter}
          onChange={e => setFromFilter(e.target.value)}
          className="bg-[#eeece3] border border-[#a2a098] px-1 py-0.5 outline-none font-bold"
        >
          <option value="">FROM:ANY</option>
          {jids.map(j => <option key={`f-${j}`} value={j}>{j}</option>)}
        </select>
        <select
          value={toFilter}
          onChange={e => setToFilter(e.target.value)}
          className="bg-[#eeece3] border border-[#a2a098] px-1 py-0.5 outline-none font-bold"
        >
          <option value="">TO:ANY</option>
          {jids.map(j => <option key={`t-${j}`} value={j}>{j}</option>)}
        </select>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="SEARCH_BODY"
          className="bg-[#eeece3] border border-[#a2a098] px-2 py-0.5 outline-none placeholder-[#8c8a85]"
        />
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-1 relative z-20">
        {daemonDown && (
          <div className="text-[#b45309] font-bold py-2">DAEMON_OFFLINE — start `npm run daemon` on :7778</div>
        )}
        {!daemonDown && error && (
          <div className="text-[#dc2626] font-bold py-2">ERR: {error}</div>
        )}
        {!daemonDown && !error && filtered.length === 0 && (
          <div className="text-[#8c8a85] text-center py-8 font-bold">
            {rows.length === 0 ? 'NO_TRANSCRIPT_ROWS' : 'NO_MATCHES'}
          </div>
        )}
        {filtered.map((r, i) => (
          <div key={(r.id as string) || `${i}-${r.ts}`} className="flex flex-col gap-0.5 border-b border-[#c2c0b8] pb-1 last:border-0 hover:bg-[#e4e2d9]/50">
            <div className="flex items-start gap-2">
              <span className="text-[#8c8a85] shrink-0">[{fmtTs(r.ts)}]</span>
              <span className="text-[#16a34a] font-bold shrink-0">[{String(r.from || '?')}]</span>
              <span className="text-[#8c8a85] shrink-0">{'->'}</span>
              <span className="text-[#1d4ed8] font-bold shrink-0">[{String(r.to || '?')}]</span>
              <span className="text-[#6c6a65] shrink-0">({String(r.kind || '?')})</span>
            </div>
            <div className="pl-4 text-[#33312e] whitespace-pre-wrap break-words normal-case tracking-normal">
              {String(r.body || '').slice(0, 400) || <span className="text-[#8c8a85] italic">empty</span>}
            </div>
          </div>
        ))}
      </div>
      <div className="bg-[#c2c0b8] px-3 py-1 border-t border-[#a2a098] text-[9px] text-[#6c6a65] font-bold relative z-20">
        TRUNCATED_PREVIEW * FULL_ENVELOPES_AT_HUB-BUS/INBOX/&lt;JID&gt;/*.JSON
      </div>
    </div>
  );
}

export function Tier3DebugTool() {
  return (
    <section className="bg-[#dfddd4] border-2 border-t-white border-l-white border-b-[#b8b6af] border-r-[#b8b6af] p-6 md:p-8 relative shadow-lg rounded-sm">
      {/* Decorative screws */}
      <div className="absolute top-3 left-3 w-3 h-3 rounded-full bg-[#c2c0b8] shadow-inner border border-[#a2a098] flex items-center justify-center"><div className="w-full h-[1px] bg-[#8c8a85] rotate-45"></div></div>
      <div className="absolute top-3 right-3 w-3 h-3 rounded-full bg-[#c2c0b8] shadow-inner border border-[#a2a098] flex items-center justify-center"><div className="w-full h-[1px] bg-[#8c8a85] -rotate-45"></div></div>
      <div className="absolute bottom-3 left-3 w-3 h-3 rounded-full bg-[#c2c0b8] shadow-inner border border-[#a2a098] flex items-center justify-center"><div className="w-full h-[1px] bg-[#8c8a85] rotate-12"></div></div>
      <div className="absolute bottom-3 right-3 w-3 h-3 rounded-full bg-[#c2c0b8] shadow-inner border border-[#a2a098] flex items-center justify-center"><div className="w-full h-[1px] bg-[#8c8a85] -rotate-12"></div></div>

      <div className="flex items-center gap-3 mb-8 border-b-2 border-[#c2c0b8] border-t-white pb-4 pt-2 relative z-20">
        <div className="w-8 h-8 rounded-sm bg-[#c2c0b8] border-t-2 border-l-2 border-t-white border-l-white border-b-2 border-r-2 border-[#a2a098] flex items-center justify-center shadow-sm">
          <AlertCircleIcon className="w-5 h-5 text-[#4a4843]" />
        </div>
        <h2 className="text-[16px] font-bold tracking-widest text-[#33312e] uppercase">PERIPHERAL DIAGNOSTICS</h2>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start relative z-20">
         <EventStream />
         <div className="flex flex-col gap-6">
            <EndpointTester />
            <TranscriptTail />
         </div>
      </div>
    </section>
  );
}
