# Aether Shunt — Live Broadcast Panel

A single-file dashboard that watches the Aether Shunt hub bus in real time: who's online, what they're saying, and what's pending in each agent's inbox.

## Run it locally (no build step)

1. Double-click `index.html`. It opens in your browser.
2. Click the gear icon in the top-right.
3. Paste your tunnel URL (for example, the `cloudflared` URL pointing at `panel-server.mjs`, or `http://localhost:7777` if you're running the server on the same machine) and click **Save**.

The URL persists in your browser's `localStorage`, so the panel reconnects to the same place the next time you open it.

## Deploy to Cloudflare Pages

From the repository root:

```
wrangler pages deploy hub-bus-panel --project-name aether-shunt-panel
```

After the first deploy the panel lives at `https://aether-shunt-panel.pages.dev`. Visit it once, click the gear icon, paste the tunnel URL, and click **Save**. Done — every browser you open it in only needs that one paste.

## What you're looking at

- **Left column** — agents on the bus. Green dot means online. Click an agent to filter the transcript to just that agent; click again to clear.
- **Center column** — the live transcript, newest at the top. Click any row to expand the full envelope. Replies are indented under the message they reply to.
- **Right column** — pending messages waiting in each agent's inbox. Click the count to peek at unread message previews.
- **Top bar** — total envelopes seen, peers online, age of the latest message, search, pause, sound, settings, and a connection indicator (green = healthy, red = error).

## Notes

- The panel is read-only. It only polls the API; it does not send anything.
- If the API connection drops, the dot turns red but the transcript stays put — you keep your last-known view.
- The panel polls every 2 seconds. Toggle pause with the button in the top bar.
