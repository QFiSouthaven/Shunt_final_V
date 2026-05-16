// components/nexus/A2A.tsx
//
// Agent-to-Agent conversation viewer.
//
// Endpoints:
//   GET  /a2a/conversations                       — { conversations: [...] }
//   GET  /a2a/conversations/{id}/messages         — paginated message list
//   POST /a2a/conversations/{id}/pause   resume   cancel
//   POST /a2a/conversations/{id}/inject  { content, sender }
//
// UI: split layout. Left = conversation list, right = selected conversation's
// message thread with inject form.

import React, { useCallback, useEffect, useState } from 'react';

const NEXUS_BASE_URL =
  (typeof window !== 'undefined' && (window as { __NEXUS_BASE_URL__?: string }).__NEXUS_BASE_URL__) ||
  'http://localhost:8000';

interface ConversationSummary {
  id?: string;
  conversation_id?: string;
  state?: string;
  status?: string;
  participants?: string[];
  topic?: string;
  created_at?: string;
  message_count?: number;
  [k: string]: unknown;
}

interface ConvMessage {
  sender?: string;
  from?: string;
  content?: string;
  text?: string;
  timestamp?: string;
  ts?: string;
  [k: string]: unknown;
}

const stateColor = (s?: string): string => {
  switch ((s ?? '').toLowerCase()) {
    case 'active':
    case 'running':
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-400/40';
    case 'paused':
      return 'bg-amber-500/15 text-amber-300 border-amber-400/40';
    case 'cancelled':
    case 'cancelled':
      return 'bg-rose-500/15 text-rose-300 border-rose-400/40';
    case 'completed':
    case 'finished':
      return 'bg-sky-500/15 text-sky-300 border-sky-400/40';
    default:
      return 'bg-gray-500/15 text-gray-400 border-gray-400/30';
  }
};

const idOf = (c: ConversationSummary) => c.id ?? c.conversation_id ?? '';
const stateOf = (c: ConversationSummary) => c.state ?? c.status ?? '?';

const fmt = (iso?: string) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
};

const A2A: React.FC = () => {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConvMessage[]>([]);
  const [convLoading, setConvLoading] = useState(false);
  const [msgLoading, setMsgLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [injectSender, setInjectSender] = useState('@zack');
  const [injectContent, setInjectContent] = useState('');
  const [injecting, setInjecting] = useState(false);

  const fetchConversations = useCallback(async () => {
    setConvLoading(true);
    setError(null);
    try {
      const res = await fetch(`${NEXUS_BASE_URL}/a2a/conversations`);
      if (!res.ok) {
        setError(`HTTP ${res.status}`);
        setConversations([]);
        return;
      }
      const data = (await res.json()) as { conversations?: ConversationSummary[] };
      setConversations(Array.isArray(data?.conversations) ? data.conversations : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setConversations([]);
    } finally {
      setConvLoading(false);
    }
  }, []);

  const fetchMessages = useCallback(async (id: string) => {
    setMsgLoading(true);
    try {
      const res = await fetch(
        `${NEXUS_BASE_URL}/a2a/conversations/${encodeURIComponent(id)}/messages?limit=200`
      );
      if (!res.ok) {
        setMessages([]);
        return;
      }
      const data = (await res.json()) as { messages?: ConvMessage[] };
      setMessages(Array.isArray(data?.messages) ? data.messages : []);
    } catch {
      setMessages([]);
    } finally {
      setMsgLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    void fetchMessages(selectedId);
  }, [selectedId, fetchMessages]);

  const doAction = useCallback(
    async (id: string, verb: 'pause' | 'resume' | 'cancel') => {
      const res = await fetch(
        `${NEXUS_BASE_URL}/a2a/conversations/${encodeURIComponent(id)}/${verb}`,
        { method: 'POST' }
      );
      if (res.ok) {
        await fetchConversations();
        if (selectedId === id) await fetchMessages(id);
      }
    },
    [fetchConversations, fetchMessages, selectedId]
  );

  const doInject = useCallback(async () => {
    if (!selectedId || !injectContent.trim()) return;
    setInjecting(true);
    try {
      const res = await fetch(
        `${NEXUS_BASE_URL}/a2a/conversations/${encodeURIComponent(selectedId)}/inject`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: injectContent.trim(), sender: injectSender.trim() }),
        }
      );
      if (res.ok) {
        setInjectContent('');
        await fetchMessages(selectedId);
      }
    } finally {
      setInjecting(false);
    }
  }, [selectedId, injectContent, injectSender, fetchMessages]);

  const selectedConv = conversations.find((c) => idOf(c) === selectedId);
  const selectedActive =
    selectedConv && ['active', 'running', 'paused'].includes(stateOf(selectedConv).toLowerCase());

  return (
    <div className="flex flex-col h-full bg-gray-800/30 overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-4 md:px-6 pt-4 pb-3 border-b border-white/10 bg-black/30">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white">A2A · Agent-to-Agent</h2>
            <p className="text-[11px] text-gray-500">
              Multi-agent conversation threads driven by NEXUS. Inspect, pause, inject.
            </p>
          </div>
          <button
            onClick={() => void fetchConversations()}
            className="px-3 py-1.5 rounded-full text-xs font-medium border border-white/10 bg-black/30 text-gray-200 hover:text-white hover:border-white/30 transition-all"
          >
            {convLoading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Split */}
      <div className="flex-grow overflow-hidden flex">
        {/* Conversation list */}
        <div className="w-72 md:w-80 shrink-0 border-r border-white/10 bg-black/20 overflow-y-auto">
          {error && (
            <div className="m-3 rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-xs text-rose-300">
              {error}. Is NEXUS-PRIME running?
            </div>
          )}
          {!error && conversations.length === 0 && !convLoading && (
            <div className="p-4 text-xs text-gray-500">
              No conversations yet. Start one via{' '}
              <code>scripts/a2a_helper.py send</code> in the NEXUS repo.
            </div>
          )}
          <ul className="divide-y divide-white/5">
            {conversations.map((c) => {
              const id = idOf(c);
              const st = stateOf(c);
              const isSel = selectedId === id;
              return (
                <li
                  key={id || Math.random()}
                  onClick={() => setSelectedId(id)}
                  className={`p-3 cursor-pointer transition-all ${
                    isSel ? 'bg-fuchsia-500/10' : 'hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span
                      className={`text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded border ${stateColor(
                        st
                      )}`}
                    >
                      {st}
                    </span>
                    <span className="text-[10px] text-gray-500 font-mono truncate max-w-[50%]">
                      {id.slice(0, 12)}
                    </span>
                  </div>
                  <p className="text-xs text-white truncate">
                    {(c.topic as string) ?? '(no topic)'}
                  </p>
                  {Array.isArray(c.participants) && c.participants.length > 0 && (
                    <p className="text-[10px] text-gray-500 font-mono truncate">
                      {c.participants.join(' ↔ ')}
                    </p>
                  )}
                  {typeof c.message_count === 'number' && (
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      {c.message_count} messages
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {/* Detail pane */}
        <div className="flex-1 flex flex-col bg-gray-900/30 overflow-hidden">
          {!selectedConv ? (
            <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
              Select a conversation on the left.
            </div>
          ) : (
            <>
              {/* Detail header */}
              <div className="flex-shrink-0 px-4 py-3 border-b border-white/10 bg-black/30 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-white truncate">
                    {(selectedConv.topic as string) ?? '(no topic)'}
                  </h3>
                  <p className="text-[10px] text-gray-500 font-mono">
                    id {idOf(selectedConv)} · state {stateOf(selectedConv)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {selectedActive && (
                    <>
                      <button
                        onClick={() => void doAction(idOf(selectedConv), 'pause')}
                        className="px-2 py-1 text-[10px] rounded border border-amber-400/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                      >
                        Pause
                      </button>
                      <button
                        onClick={() => void doAction(idOf(selectedConv), 'resume')}
                        className="px-2 py-1 text-[10px] rounded border border-emerald-400/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                      >
                        Resume
                      </button>
                      <button
                        onClick={() => void doAction(idOf(selectedConv), 'cancel')}
                        className="px-2 py-1 text-[10px] rounded border border-rose-400/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => void fetchMessages(idOf(selectedConv))}
                    className="px-2 py-1 text-[10px] rounded border border-white/10 bg-black/30 text-gray-300 hover:text-white"
                  >
                    {msgLoading ? '…' : 'Refresh'}
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-grow overflow-y-auto p-4 space-y-2">
                {messages.length === 0 && !msgLoading && (
                  <p className="text-sm text-gray-500 italic">No messages yet.</p>
                )}
                {messages.map((m, i) => {
                  const sender = m.sender ?? m.from ?? '?';
                  const content = m.content ?? m.text ?? '';
                  const ts = m.timestamp ?? m.ts;
                  return (
                    <div
                      key={i}
                      className="rounded-lg border border-white/10 bg-black/30 p-3"
                    >
                      <div className="flex items-baseline justify-between mb-1">
                        <span className="text-[11px] font-bold text-fuchsia-300 font-mono">
                          {sender}
                        </span>
                        <span className="text-[10px] text-gray-500 font-mono">{fmt(ts)}</span>
                      </div>
                      <p className="text-[12px] text-gray-200 whitespace-pre-wrap">{String(content)}</p>
                    </div>
                  );
                })}
              </div>

              {/* Inject form */}
              {selectedActive && (
                <div className="flex-shrink-0 p-3 border-t border-white/10 bg-black/40">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={injectSender}
                      onChange={(e) => setInjectSender(e.target.value)}
                      placeholder="@zack"
                      className="w-32 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white font-mono placeholder-gray-500 focus:border-fuchsia-400/60 outline-none"
                      disabled={injecting}
                    />
                    <input
                      type="text"
                      value={injectContent}
                      onChange={(e) => setInjectContent(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void doInject();
                      }}
                      placeholder="Inject a message into the thread…"
                      className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500 focus:border-fuchsia-400/60 outline-none"
                      disabled={injecting}
                    />
                    <button
                      onClick={() => void doInject()}
                      disabled={injecting || !injectContent.trim()}
                      className="px-3 py-2 rounded-lg text-xs font-semibold bg-fuchsia-500/20 border border-fuchsia-400/60 text-fuchsia-100 hover:bg-fuchsia-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                      {injecting ? '…' : 'Inject'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default A2A;
