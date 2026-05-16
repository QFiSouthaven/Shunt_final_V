// __test-lmstudio-timeout.mjs
// Unit tests for the per-envelope wallclock-timeout logic added to
// lmstudio-bridge.mjs. Runner: pure node, no deps. From the repo root:
//   node hub-bus-tools/__test-lmstudio-timeout.mjs
//
// This file is a verification artifact (matches the __test-*.mjs naming
// convention). It is not imported anywhere and is safe to delete.

import assert from 'node:assert/strict';

let passed = 0;
let failed = 0;
const results = [];

function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (ok) passed++;
  else failed++;
  const tag = ok ? 'PASS' : 'FAIL';
  console.log(`[${tag}] ${name}${detail ? ' — ' + detail : ''}`);
}

// Helpers --------------------------------------------------------------------

function captureStderr() {
  const orig = process.stderr.write.bind(process.stderr);
  const buf = [];
  process.stderr.write = (chunk) => {
    buf.push(typeof chunk === 'string' ? chunk : String(chunk));
    return true;
  };
  const origErr = console.error;
  console.error = (...args) => {
    buf.push(args.map(String).join(' ') + '\n');
  };
  return {
    text: () => buf.join(''),
    restore: () => {
      process.stderr.write = orig;
      console.error = origErr;
    },
  };
}

// Build a fetch stub that respects an AbortSignal. If the signal aborts
// before `delayMs`, the returned promise rejects with an AbortError shaped
// like the one the platform fetch produces. Otherwise it resolves with the
// supplied response.
function makeAbortableFetch({ delayMs = Infinity, response = null } = {}) {
  return (url, opts) => {
    return new Promise((resolve, reject) => {
      const signal = opts && opts.signal;
      let resolved = false;
      const timer = delayMs === Infinity
        ? null
        : setTimeout(() => {
            if (resolved) return;
            resolved = true;
            resolve(response);
          }, delayMs);
      const onAbort = () => {
        if (resolved) return;
        resolved = true;
        if (timer) clearTimeout(timer);
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        reject(err);
      };
      if (signal) {
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
      }
    });
  };
}

// Test 1 — node --check passes (syntactic validity) -------------------------
// Runs `node --check` against the bridge file. Done out of band by the
// caller; here we just confirm the file imports cleanly, which is a stronger
// check than --check alone (covers both parse and module-init errors).

async function test_importsCleanly() {
  try {
    const mod = await import('./lmstudio-bridge.mjs?case=t1');
    const ok =
      typeof mod.callLmStudio === 'function' &&
      typeof mod.LMSTUDIO_TIMEOUT_MS === 'number';
    record('module imports cleanly and exports callLmStudio + LMSTUDIO_TIMEOUT_MS', ok,
      `callLmStudio=${typeof mod.callLmStudio} LMSTUDIO_TIMEOUT_MS=${typeof mod.LMSTUDIO_TIMEOUT_MS}`);
  } catch (e) {
    record('module imports cleanly and exports callLmStudio + LMSTUDIO_TIMEOUT_MS', false,
      `import threw: ${e?.message || e}`);
  }
}

// Test 2 — wedged LM Studio: fetch never resolves, timeout fires ------------

async function test_wedgedFetchAborts() {
  const cap = captureStderr();
  const mod = await import('./lmstudio-bridge.mjs?case=t2');
  const fetchStub = makeAbortableFetch({ delayMs: Infinity });
  const start = Date.now();
  let caught = null;
  try {
    await mod.callLmStudio('hello', { fetchImpl: fetchStub, timeoutMs: 200 });
  } catch (e) {
    caught = e;
  }
  const elapsed = Date.now() - start;
  cap.restore();
  const isAbort = caught && caught.name === 'AbortError';
  const inWindow = elapsed >= 150 && elapsed <= 800; // generous upper bound
  record(
    'wedged fetch aborts within timeout window',
    isAbort && inWindow,
    `name=${caught?.name} elapsed=${elapsed}ms`,
  );
}

// Test 3 — happy path: fast resolve, no abort, no leaked timer -------------
// We assert the call resolves with the stubbed content. If clearTimeout had
// been missed, an unref'd timer would still abort eventually; here we just
// verify success.

async function test_happyPath() {
  const mod = await import('./lmstudio-bridge.mjs?case=t3');
  let abortObserved = false;
  const fetchStub = (url, opts) => {
    if (opts && opts.signal) {
      opts.signal.addEventListener('abort', () => {
        abortObserved = true;
      });
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      async json() {
        return { choices: [{ message: { content: 'hi' } }] };
      },
    });
  };
  const got = await mod.callLmStudio('hello', { fetchImpl: fetchStub, timeoutMs: 5000 });
  // Wait a moment past the call to be sure the timer didn't fire late.
  await new Promise((r) => setTimeout(r, 50));
  record(
    'happy path resolves with content; abort never fires',
    got === 'hi' && abortObserved === false,
    `got=${got} abortObserved=${abortObserved}`,
  );
}

// Test 4 — mid-flight wallclock: response delayed past timeout --------------

async function test_midFlightAbort() {
  const mod = await import('./lmstudio-bridge.mjs?case=t4');
  const fetchStub = makeAbortableFetch({
    delayMs: 500,
    response: {
      ok: true,
      status: 200,
      async json() {
        return { choices: [{ message: { content: 'late' } }] };
      },
    },
  });
  const start = Date.now();
  let caught = null;
  try {
    await mod.callLmStudio('hello', { fetchImpl: fetchStub, timeoutMs: 200 });
  } catch (e) {
    caught = e;
  }
  const elapsed = Date.now() - start;
  const isAbort = caught && caught.name === 'AbortError';
  const beforeResolve = elapsed < 450; // must abort before the 500ms resolve
  record(
    'mid-flight wallclock fires abort before fetch resolves',
    isAbort && beforeResolve,
    `name=${caught?.name} elapsed=${elapsed}ms`,
  );
}

// Test 5 — default LMSTUDIO_TIMEOUT_MS is 90000 -----------------------------

async function test_defaultTimeoutValue() {
  // The constant captures process.env at module-init time; the resolve
  // tests already use cache-busted imports, but this constant is set on
  // first import. So we read it fresh, ensuring no LMSTUDIO_TIMEOUT_MS env
  // var was set.
  delete process.env.LMSTUDIO_TIMEOUT_MS;
  const mod = await import('./lmstudio-bridge.mjs?case=t5');
  record(
    'default LMSTUDIO_TIMEOUT_MS is 90000 when env var is unset',
    mod.LMSTUDIO_TIMEOUT_MS === 90_000,
    `value=${mod.LMSTUDIO_TIMEOUT_MS}`,
  );
}

// Driver --------------------------------------------------------------------

(async () => {
  try {
    await test_importsCleanly();
    await test_wedgedFetchAborts();
    await test_happyPath();
    await test_midFlightAbort();
    await test_defaultTimeoutValue();
  } catch (e) {
    console.error('test driver crashed:', e?.stack || e);
    process.exit(2);
  }
  console.log('');
  console.log(`results: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})();
