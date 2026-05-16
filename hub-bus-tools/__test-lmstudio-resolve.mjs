// __test-lmstudio-resolve.mjs
// Unit tests for the model-resolution logic added to lmstudio-bridge.mjs.
// Runner: pure node, no deps. From the repo root:
//   node hub-bus-tools/__test-lmstudio-resolve.mjs
//
// This file is a verification artifact (matches the __check_*.mjs naming
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

function makeFetchStub(handler) {
  return async (url, opts) => handler(url, opts);
}

function captureStderr() {
  const orig = process.stderr.write.bind(process.stderr);
  const buf = [];
  process.stderr.write = (chunk, ...rest) => {
    buf.push(typeof chunk === 'string' ? chunk : String(chunk));
    return true;
  };
  // console.error writes to stderr; also capture via console hook for safety.
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

// Test 1 — auto-resolve happy path -------------------------------------------
// LMSTUDIO_MODEL unset, /v1/models returns two models, expect data[0].id.

async function test_autoResolveHappyPath() {
  delete process.env.LMSTUDIO_MODEL;
  const calls = [];
  const fetchStub = makeFetchStub(async (url) => {
    calls.push(url);
    return {
      ok: true,
      status: 200,
      async json() {
        return { data: [{ id: 'qwen3.5-4b' }, { id: 'another-model' }] };
      },
    };
  });

  // Re-import with cache busting so module-level state is fresh.
  const mod = await import('./lmstudio-bridge.mjs?case=1');
  const got = await mod.resolveModel({ envValue: undefined, fetchImpl: fetchStub });
  const okFetch = calls.length === 1 && /\/v1\/models$/.test(calls[0]);
  record(
    'auto-resolve happy path returns first model id',
    got === 'qwen3.5-4b' && okFetch,
    `got=${got} fetched=${calls[0]}`,
  );
}

// Test 2 — env override path -------------------------------------------------
// LMSTUDIO_MODEL set to a non-legacy value; resolveModel must NOT call fetch.

async function test_envOverride() {
  process.env.LMSTUDIO_MODEL = 'manual-override';
  let fetchCalled = false;
  const fetchStub = makeFetchStub(async () => {
    fetchCalled = true;
    return { ok: true, status: 200, async json() { return { data: [{ id: 'should-not-see' }] }; } };
  });

  const mod = await import('./lmstudio-bridge.mjs?case=2');
  const got = await mod.resolveModel({ envValue: 'manual-override', fetchImpl: fetchStub });
  record(
    'env override returns env value without fetching',
    got === 'manual-override' && fetchCalled === false,
    `got=${got} fetchCalled=${fetchCalled}`,
  );
  delete process.env.LMSTUDIO_MODEL;
}

// Test 3 — legacy default treated as unset -----------------------------------
// LMSTUDIO_MODEL='local-model' must trigger /v1/models lookup.

async function test_legacyDefaultOverride() {
  process.env.LMSTUDIO_MODEL = 'local-model';
  let fetchCalled = false;
  const fetchStub = makeFetchStub(async () => {
    fetchCalled = true;
    return {
      ok: true,
      status: 200,
      async json() { return { data: [{ id: 'qwen3.5-4b' }] }; },
    };
  });
  const mod = await import('./lmstudio-bridge.mjs?case=3');
  const got = await mod.resolveModel({ envValue: 'local-model', fetchImpl: fetchStub });
  record(
    'legacy "local-model" is treated as unset',
    got === 'qwen3.5-4b' && fetchCalled === true,
    `got=${got} fetchCalled=${fetchCalled}`,
  );
  delete process.env.LMSTUDIO_MODEL;
}

// Test 4 — fetch failure fallback --------------------------------------------
// /v1/models throws; resolveModel returns 'local-model' and warns to stderr.

async function test_fetchFailureFallback() {
  delete process.env.LMSTUDIO_MODEL;
  const cap = captureStderr();
  const fetchStub = makeFetchStub(async () => {
    throw new Error('ECONNREFUSED');
  });
  const mod = await import('./lmstudio-bridge.mjs?case=4');
  const got = await mod.resolveModel({ envValue: undefined, fetchImpl: fetchStub });
  const stderr = cap.text();
  cap.restore();
  const warned = /WARN:.*failed to auto-resolve model/.test(stderr);
  record(
    'fetch failure -> fallback "local-model" with WARN',
    got === 'local-model' && warned,
    `got=${got} warned=${warned}`,
  );
}

// Test 5 — 400 model_not_found re-resolve ------------------------------------
// maybeReresolveOnModelNotFound updates RESOLVED_MODEL and warns.

async function test_modelNotFoundReresolve() {
  delete process.env.LMSTUDIO_MODEL;
  const cap = captureStderr();
  const fetchStub = makeFetchStub(async (url) => {
    if (/\/v1\/models$/.test(url)) {
      return {
        ok: true,
        status: 200,
        async json() { return { data: [{ id: 'reloaded-model' }] }; },
      };
    }
    throw new Error('unexpected url ' + url);
  });
  const mod = await import('./lmstudio-bridge.mjs?case=5');
  // Seed a known starting value so we can prove it changed.
  mod._setResolvedModel('stale-model');
  const before = mod._getResolvedModel();
  const did = await mod.maybeReresolveOnModelNotFound(
    400,
    { error: { code: 'model_not_found', message: 'no such model: stale-model' } },
    fetchStub,
  );
  const after = mod._getResolvedModel();
  const stderr = cap.text();
  cap.restore();
  const warned = /WARN:.*model_not_found/.test(stderr);
  record(
    '400 model_not_found triggers re-resolve and updates RESOLVED_MODEL',
    did === true && before === 'stale-model' && after === 'reloaded-model' && warned,
    `did=${did} before=${before} after=${after} warned=${warned}`,
  );
}

// Test 6 — non-matching 400 does NOT re-resolve ------------------------------
// (Defensive: verifies the guard.)

async function test_otherErrorNoReresolve() {
  const fetchStub = makeFetchStub(async () => {
    throw new Error('should not be called');
  });
  const mod = await import('./lmstudio-bridge.mjs?case=6');
  mod._setResolvedModel('keep-me');
  const did = await mod.maybeReresolveOnModelNotFound(
    400,
    { error: { code: 'invalid_request_error', message: 'bad json' } },
    fetchStub,
  );
  record(
    'non-model_not_found 400 does NOT re-resolve',
    did === false && mod._getResolvedModel() === 'keep-me',
    `did=${did} model=${mod._getResolvedModel()}`,
  );
}

// Driver ---------------------------------------------------------------------

(async () => {
  try {
    await test_autoResolveHappyPath();
    await test_envOverride();
    await test_legacyDefaultOverride();
    await test_fetchFailureFallback();
    await test_modelNotFoundReresolve();
    await test_otherErrorNoReresolve();
  } catch (e) {
    console.error('test driver crashed:', e?.stack || e);
    process.exit(2);
  }
  console.log('');
  console.log(`results: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})();
