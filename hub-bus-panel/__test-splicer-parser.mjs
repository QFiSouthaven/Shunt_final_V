// Static test for splicer.html parseInput + buildWsUrl.
//
// Extracts the fenced TEST_BLOCK from splicer.html, evaluates it as a CommonJS
// module via vm, and runs the assertions called out in the implementation
// spec. Run with `node __test-splicer-parser.mjs` from this directory.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, 'splicer.html'), 'utf8');

const startMarker = '/* ===== TEST_BLOCK_START =====';
const endMarker = '===== TEST_BLOCK_END ===== */';
const i = html.indexOf(startMarker);
const j = html.indexOf(endMarker);
if (i === -1 || j === -1) {
  console.error('FAIL: TEST_BLOCK markers not found in splicer.html');
  process.exit(1);
}
const src = html.slice(i + startMarker.length, j);

const sandbox = { module: { exports: {} }, crypto: globalThis.crypto, URL };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const { parseInput, buildWsUrl } = sandbox.module.exports;

let passed = 0, failed = 0;
function check(name, cond, info) {
  if (cond) { passed++; console.log('  PASS', name); }
  else { failed++; console.log('  FAIL', name, info ?? ''); }
}

console.log('parseInput cases:');
{
  const r = parseInput('/help', '#main');
  check('/help → cmd:help', r.kind === 'cmd' && r.name === 'help', JSON.stringify(r));
}
{
  const r = parseInput('/to @gemini hi', '#main');
  check('/to @gemini hi → send', r.kind === 'send' && r.to === '@gemini' && r.body === 'hi', JSON.stringify(r));
}
{
  const r = parseInput('/whisper @claude secret', '#main');
  check('/whisper @claude secret → send w/ #whisper-*',
    r.kind === 'send' && r.to === '@claude' && r.body === 'secret' && /^#whisper-/.test(r.room || ''),
    JSON.stringify(r));
}
{
  const r = parseInput('/broadcast hello all', '#main');
  check('/broadcast → send to *',
    r.kind === 'send' && r.to === '*' && r.body === 'hello all' && r.sendKind === 'broadcast',
    JSON.stringify(r));
}
{
  const r = parseInput('plain text', '#main');
  check('plain text → send to default room',
    r.kind === 'send' && r.to === '#main' && r.body === 'plain text',
    JSON.stringify(r));
}
{
  const r = parseInput('/foo', '#main');
  check('/foo → error containing "unknown"',
    r.kind === 'error' && /unknown/i.test(r.message || ''),
    JSON.stringify(r));
}

console.log('buildWsUrl cases:');
{
  const u = buildWsUrl('https://hub-relay.halkive.workers.dev', '#main', '@splicer-abcd', 'TOK');
  check('https → wss://, room URL-encoded, jid URL-encoded',
    u.startsWith('wss://hub-relay.halkive.workers.dev/ws?')
      && u.includes('room=%23main')
      && u.includes('jid=%40splicer-abcd')
      && u.includes('token=TOK'),
    u);
}
{
  const u = buildWsUrl('http://localhost:8787', '#main', '@a', 't');
  check('http → ws://', u.startsWith('ws://localhost:8787/ws?'), u);
}

console.log('summary:', passed, 'passed,', failed, 'failed');
process.exit(failed === 0 ? 0 : 1);
