// components/hub/Hub.tsx
//
// The Hub — front door of Aether Shunt.
//
// v2: Thin wrapper around the Aether Splicer chat panel.
// The Splicer is the real chat function — a WebSocket-based multi-agent bus
// over Cloudflare Worker + Durable Objects (see hub-cloudflare/). The canonical
// chat UI lives in hub-bus-panel-desktop/splicer.html; we serve a synced copy
// from /public/splicer.html and iframe it here.
//
// Why iframe instead of porting to React:
//   * Zero behavior drift — the desktop app and this embedded view run the
//     exact same code.
//   * Splicer is feature-complete (setup view, slash commands, Ctrl+K palette,
//     reconnect with backoff, presence cache). Re-porting in React would be
//     ~1000 lines of new code with no UX gain.
//   * One file to maintain. When you update behavior in
//     hub-bus-panel-desktop/splicer.html, copy it to public/splicer.html. The
//     header in public/splicer.html documents this sync surface.
//
// The Splicer's bearer credential lives in localStorage under
// `aether_splicer_config` (since this iframe has no Electron preload bridge,
// the browser-mode fallback path inside splicer.html is the one that runs).
//
// "Reset Splicer config" wipes that key so you can re-enter Worker URL /
// bearer / JID / room from the Splicer's setup view.

import React, { useCallback, useRef } from 'react';

const SPLICER_CONFIG_KEY = 'aether_splicer_config';
const SPLICER_CMDK_KEY = 'aether_splicer_cmdk_history';

const Hub: React.FC = () => {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const reloadSplicer = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    // Hard reload — re-runs Splicer's init(), re-reads localStorage.
    iframe.src = iframe.src;
  }, []);

  const resetConfig = useCallback(() => {
    if (
      !window.confirm(
        'This will wipe your saved Splicer config (Worker URL, bearer, JID, room) and reset the command palette history. Continue?'
      )
    ) {
      return;
    }
    try {
      localStorage.removeItem(SPLICER_CONFIG_KEY);
      localStorage.removeItem(SPLICER_CMDK_KEY);
    } catch {
      /* ignore */
    }
    reloadSplicer();
  }, [reloadSplicer]);

  return (
    <div className="flex flex-col h-full bg-gray-800/30">
      {/* Thin strip — explains what this is + escape hatch. The Splicer has
          its own topbar with connection status, settings gear, etc., so we
          deliberately keep this bar minimal. */}
      <div className="flex-shrink-0 px-4 md:px-6 pt-3 pb-2 border-b border-white/10 bg-black/30">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold text-white">Hub · Aether Splicer</h2>
            <p className="text-[10px] text-gray-500">
              WebSocket bus over Cloudflare Worker · multi-agent rooms (#main, #whisper-*) · JID-addressed
              · Ctrl+K for the command palette
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={reloadSplicer}
              className="px-3 py-1.5 rounded-full text-[11px] font-medium border border-white/10 bg-black/30 text-gray-300 hover:text-white hover:border-white/30 transition-all"
              title="Hard-reload the Splicer iframe — re-runs its init() and reconnects."
            >
              Reload
            </button>
            <button
              onClick={resetConfig}
              className="px-3 py-1.5 rounded-full text-[11px] font-medium border border-rose-400/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 transition-all"
              title="Wipe saved Worker URL, bearer, JID, room, and command-palette history."
            >
              Reset config
            </button>
          </div>
        </div>
      </div>

      {/* The Splicer itself */}
      <div className="flex-grow relative bg-[#0d1117]">
        <iframe
          ref={iframeRef}
          src="/splicer.html"
          title="Aether Splicer chat panel"
          // Same-origin iframe — the Splicer needs WebSocket + fetch + localStorage,
          // which a sandbox attribute would gate. Leaving the iframe unsandboxed is
          // safe because the content is served from our own origin.
          className="absolute inset-0 w-full h-full border-0"
          allow="clipboard-write; notifications"
        />
      </div>
    </div>
  );
};

export default Hub;
