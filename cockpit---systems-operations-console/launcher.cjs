const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// A simple HTTP server to act as a launcher daemon on localhost
const PORT = 7778;
const processes = new Map();

// Transcript file lives next to the cockpit dir, under hub-bus/transcript.jsonl
const TRANSCRIPT_PATH = path.resolve(__dirname, '..', 'hub-bus', 'transcript.jsonl');

// Backward-chunk tail: read last N lines of a (potentially large) NDJSON file
// without slurping the whole thing. Reads ~64KB blocks from the end until we
// have at least N+1 newlines or hit the start of file.
async function tailLines(filePath, n) {
  let fh;
  try {
    fh = await fs.promises.open(filePath, 'r');
    const { size } = await fh.stat();
    if (size === 0) return [];

    const CHUNK = 64 * 1024;
    let pos = size;
    let buf = Buffer.alloc(0);
    let newlineCount = 0;

    while (pos > 0 && newlineCount <= n) {
      const readSize = Math.min(CHUNK, pos);
      pos -= readSize;
      const chunk = Buffer.alloc(readSize);
      await fh.read(chunk, 0, readSize, pos);
      buf = Buffer.concat([chunk, buf]);
      // Count newlines in the just-read chunk
      for (let i = 0; i < chunk.length; i++) {
        if (chunk[i] === 0x0a) newlineCount++;
      }
    }

    const text = buf.toString('utf8');
    // Split, drop trailing empty (file ends with \n), take last n
    const lines = text.split('\n');
    if (lines.length && lines[lines.length - 1] === '') lines.pop();
    const tail = lines.slice(-n);

    const out = [];
    for (const line of tail) {
      if (!line.trim()) continue;
      try {
        out.push(JSON.parse(line));
      } catch {
        // Malformed line (e.g. partial write at file head if we straddled).
        // Skip silently; we'd rather return n-1 good rows than fail the request.
      }
    }
    return out;
  } finally {
    if (fh) await fh.close().catch(() => {});
  }
}

const server = http.createServer((req, res) => {
  // Setup CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // GET /transcript/tail?n=50 — reverse-read last N envelope summaries.
  // Full envelopes live in hub-bus/inbox/<jid>/*.json; this is preview-only.
  if (req.url && req.url.startsWith('/transcript/tail') && req.method === 'GET') {
    try {
      const u = new URL(req.url, `http://127.0.0.1:${PORT}`);
      const nRaw = parseInt(u.searchParams.get('n') || '50', 10);
      const n = Number.isFinite(nRaw) ? Math.max(1, Math.min(500, nRaw)) : 50;

      if (!fs.existsSync(TRANSCRIPT_PATH)) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ path: TRANSCRIPT_PATH, lines: [], note: 'transcript not found' }));
      }

      tailLines(TRANSCRIPT_PATH, n).then(lines => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ path: TRANSCRIPT_PATH, lines }));
      }).catch(err => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      });
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (req.url === '/status' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
       status: 'ok', 
       running: Array.from(processes.keys()),
       pid: process.pid
    }));
    return;
  }

  if (req.url === '/start' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const { id, cmd } = JSON.parse(body);
        if (!id) {
           res.writeHead(400);
           return res.end(JSON.stringify({ error: 'Missing id' }));
        }

        if (processes.has(id)) {
           res.writeHead(400);
           return res.end(JSON.stringify({ error: 'Already running' }));
        }

        if (!cmd) {
           // We can mock start if no cmd provided, but usually this needs an actual cmd
           console.log(`[DAEMON] Received start for ${id} but no command provided.`);
        } else {
           console.log(`[DAEMON] Spawning ${id}: ${cmd}`);
           
           // Simple split for command and args
           // In production, might want better shell parsing, but we spawn with shell: true
           const child = spawn(cmd, { shell: true, detached: true, stdio: 'ignore' });
           
           processes.set(id, child);

           child.on('error', (err) => {
               console.error(`[DAEMON] Failed to start ${id}: ${err}`);
               processes.delete(id);
           });

           child.on('exit', (code) => {
               console.log(`[DAEMON] ${id} exited with code ${code}`);
               processes.delete(id);
           });
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'started', id }));
      } catch (e) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  if (req.url === '/stop' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const { id } = JSON.parse(body);
        
        if (processes.has(id)) {
           console.log(`[DAEMON] Stopping ${id}`);
           const child = processes.get(id);
           // Attempt graceful kill or fallback
           if (process.platform === 'win32') {
               spawn('taskkill', ['/pid', child.pid, '/f', '/t']);
           } else {
               process.kill(-child.pid); // kill process group if detached
           }
           processes.delete(id);
           res.writeHead(200, { 'Content-Type': 'application/json' });
           res.end(JSON.stringify({ status: 'stopped', id }));
        } else {
           res.writeHead(404);
           res.end(JSON.stringify({ error: 'Not running' }));
        }
      } catch (e) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[DAEMON] Cockpit Launcher Daemon listening on http://127.0.0.1:${PORT}`);
  console.log(`[DAEMON] This allows the web UI to launch local processes.`);
});

// Handle graceful shutdown of daemon and child processes
process.on('SIGINT', () => {
    console.log('[DAEMON] Shutting down. Killing child processes...');
    for (const [id, child] of processes.entries()) {
        try {
            if (process.platform === 'win32') {
                spawn('taskkill', ['/pid', child.pid, '/f', '/t']);
            } else {
                process.kill(-child.pid);
            }
            console.log(`[DAEMON] Killed ${id}`);
        } catch(e) {
            console.error(`[DAEMON] Error killing ${id}: ${e.message}`);
        }
    }
    process.exit(0);
});
