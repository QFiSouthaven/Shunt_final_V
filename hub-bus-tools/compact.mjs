// compact.mjs - Aether Shunt local file-bus compaction/retention tool
// ESM, zero deps. Node 18+.
//
// Prevents unbounded growth of:
//   - inbox/<addr>/.read/ subdirectories (moves old read envelopes into dated archives)
//   - transcript.jsonl (rotates when line count exceeds threshold)
//
// CLI:
//   node compact.mjs                     # compact all inboxes + rotate transcript
//   node compact.mjs --dry-run           # print would-be actions without changing anything
//   node compact.mjs --retention-days=14 # override read-dir retention window
//   node compact.mjs --max-lines=20000   # override transcript rotation threshold
//
// BUS_DIR env var overrides the default bus directory.

import {
  mkdir,
  readdir,
  rename,
  stat,
  open,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_BUS_DIR = 'C:\\Users\\Falki\\shunt-final-v\\hub-bus';
const DEFAULT_RETENTION_DAYS = 7;
const DEFAULT_MAX_LINES = 10000;

/**
 * Format a Date as YYYY-MM-DD using local time.
 */
function formatDateYMD(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Format a Date as YYYYMMDD-HHMMSS using local time. Used for rotated transcript names.
 */
function formatTimestampCompact(date) {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${y}${mo}${d}-${h}${mi}${s}`;
}

async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}

async function pathExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Compact a single agent's .read/ directory.
 * For each file in inbox/<addr>/.read/ whose mtime is older than retentionDays days,
 * move into inbox/<addr>/.read/<YYYY-MM-DD>/<filename>. The dated subdirectory uses
 * the file's mtime date, not today's. Already-dated subdirectories are skipped.
 *
 * @param {string} addr e.g. "@claude"
 * @param {string} busDir absolute path to hub-bus root
 * @param {number} [retentionDays=7]
 * @param {object} [opts]
 * @param {boolean} [opts.dryRun=false]
 * @returns {Promise<{ before: number, moved: number, kept: number }>}
 */
export async function compactReadDir(addr, busDir, retentionDays = DEFAULT_RETENTION_DAYS, opts = {}) {
  const { dryRun = false } = opts;
  const readDir = path.join(busDir, 'inbox', addr, '.read');
  let entries;
  try {
    entries = await readdir(readDir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { before: 0, moved: 0, kept: 0 };
    }
    throw err;
  }

  // Only count files (not subdirs) toward "before".
  const files = entries.filter((e) => e.isFile());
  const before = files.length;

  const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  let moved = 0;
  let kept = 0;

  for (const ent of files) {
    const full = path.join(readDir, ent.name);
    let st;
    try {
      st = await stat(full);
    } catch {
      // File vanished between readdir and stat — count as kept (best-effort, ignore).
      kept += 1;
      continue;
    }
    const mtimeMs = st.mtimeMs;
    if (mtimeMs >= cutoffMs) {
      kept += 1;
      continue;
    }
    // File is older than cutoff; archive into a dated subdirectory of .read/
    const dateLabel = formatDateYMD(new Date(mtimeMs));
    const archiveDir = path.join(readDir, dateLabel);
    const dest = path.join(archiveDir, ent.name);
    if (dryRun) {
      moved += 1;
      // eslint-disable-next-line no-console
      console.log(`[compact:dry] would move ${full} -> ${dest}`);
      continue;
    }
    await ensureDir(archiveDir);
    await rename(full, dest);
    moved += 1;
  }

  return { before, moved, kept };
}

/**
 * Count newline-delimited lines in a file. Returns 0 for missing files.
 */
async function countLines(filePath) {
  let fh;
  try {
    fh = await open(filePath, 'r');
  } catch (err) {
    if (err.code === 'ENOENT') return 0;
    throw err;
  }
  try {
    let count = 0;
    let lastByte = -1;
    const buf = Buffer.allocUnsafe(64 * 1024);
    while (true) {
      const { bytesRead } = await fh.read(buf, 0, buf.length, null);
      if (bytesRead === 0) break;
      for (let i = 0; i < bytesRead; i++) {
        if (buf[i] === 0x0a) count += 1;
        lastByte = buf[i];
      }
    }
    // If the file's final byte isn't a newline but the file has content, count the
    // trailing partial line.
    if (lastByte !== -1 && lastByte !== 0x0a) {
      count += 1;
    }
    return count;
  } finally {
    await fh.close();
  }
}

/**
 * Rotate transcript.jsonl when line count exceeds maxLines.
 * Atomically renames the existing file to transcript-<YYYYMMDD-HHMMSS>.jsonl and
 * creates a fresh empty transcript.jsonl. No-op if line count <= maxLines.
 *
 * @param {string} busDir
 * @param {number} [maxLines=10000]
 * @param {object} [opts]
 * @param {boolean} [opts.dryRun=false]
 * @returns {Promise<{ rotated: boolean, newPath?: string, lineCount: number }>}
 */
export async function rotateTranscript(busDir, maxLines = DEFAULT_MAX_LINES, opts = {}) {
  const { dryRun = false } = opts;
  const transcript = path.join(busDir, 'transcript.jsonl');
  const lineCount = await countLines(transcript);
  if (lineCount <= maxLines) {
    return { rotated: false, lineCount };
  }
  const stamp = formatTimestampCompact(new Date());
  const rotatedPath = path.join(busDir, `transcript-${stamp}.jsonl`);
  if (dryRun) {
    // eslint-disable-next-line no-console
    console.log(`[compact:dry] would rotate ${transcript} -> ${rotatedPath} (lines=${lineCount})`);
    return { rotated: true, newPath: rotatedPath, lineCount };
  }
  await rename(transcript, rotatedPath);
  // Re-create empty transcript.jsonl so future appenders see it.
  await writeFile(transcript, '', { encoding: 'utf8' });
  return { rotated: true, newPath: rotatedPath, lineCount };
}

/**
 * Run compactReadDir for every agent dir in inbox/ (skipping @dlq if present),
 * then rotateTranscript. Prints progress to stdout.
 *
 * @param {string} busDir
 * @param {object} [opts]
 * @param {number} [opts.retentionDays=7]
 * @param {number} [opts.maxLines=10000]
 * @param {boolean} [opts.dryRun=false]
 * @returns {Promise<{ perAddr: Array<{addr:string, before:number, moved:number, kept:number}>, totals: {before:number, moved:number, kept:number}, transcript: {rotated:boolean, newPath?:string, lineCount:number} }>}
 */
export async function compactAll(busDir, opts = {}) {
  const {
    retentionDays = DEFAULT_RETENTION_DAYS,
    maxLines = DEFAULT_MAX_LINES,
    dryRun = false,
  } = opts;

  const inboxRoot = path.join(busDir, 'inbox');
  let entries;
  try {
    entries = await readdir(inboxRoot, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') {
      // eslint-disable-next-line no-console
      console.log(`[compact] inbox dir not found: ${inboxRoot}`);
      return {
        perAddr: [],
        totals: { before: 0, moved: 0, kept: 0 },
        transcript: { rotated: false, lineCount: 0 },
      };
    }
    throw err;
  }

  const addrs = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((n) => n !== '@dlq')
    .sort();

  const perAddr = [];
  let totalBefore = 0;
  let totalMoved = 0;
  let totalKept = 0;

  for (const addr of addrs) {
    const result = await compactReadDir(addr, busDir, retentionDays, { dryRun });
    perAddr.push({ addr, ...result });
    totalBefore += result.before;
    totalMoved += result.moved;
    totalKept += result.kept;
    const padded = addr.padEnd(14, ' ');
    // eslint-disable-next-line no-console
    console.log(
      `[compact]${dryRun ? '[dry]' : ''} ${padded} before=${result.before} moved=${result.moved} kept=${result.kept}`,
    );
  }

  // eslint-disable-next-line no-console
  console.log(
    `[compact]${dryRun ? '[dry]' : ''} TOTAL          before=${totalBefore} moved=${totalMoved} kept=${totalKept}`,
  );

  const transcriptResult = await rotateTranscript(busDir, maxLines, { dryRun });
  if (transcriptResult.rotated) {
    // eslint-disable-next-line no-console
    console.log(
      `[compact]${dryRun ? '[dry]' : ''} transcript rotated lines=${transcriptResult.lineCount} -> ${transcriptResult.newPath}`,
    );
  } else {
    // eslint-disable-next-line no-console
    console.log(
      `[compact]${dryRun ? '[dry]' : ''} transcript ok lines=${transcriptResult.lineCount} (<= ${maxLines})`,
    );
  }

  return {
    perAddr,
    totals: { before: totalBefore, moved: totalMoved, kept: totalKept },
    transcript: transcriptResult,
  };
}

/**
 * Parse argv flags: --dry-run, --retention-days=N, --max-lines=N.
 */
function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    if (a === '--dry-run') out.dryRun = true;
    else if (a.startsWith('--retention-days=')) {
      const n = Number(a.slice('--retention-days='.length));
      if (Number.isFinite(n) && n >= 0) out.retentionDays = n;
    } else if (a.startsWith('--max-lines=')) {
      const n = Number(a.slice('--max-lines='.length));
      if (Number.isFinite(n) && n >= 0) out.maxLines = n;
    }
  }
  return out;
}

// CLI entry: only run when invoked as a script (not when imported as a module).
const __filename = fileURLToPath(import.meta.url);
const invokedAsScript =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (invokedAsScript) {
  const busDir = process.env.BUS_DIR || DEFAULT_BUS_DIR;
  const argOpts = parseArgs(process.argv.slice(2));
  compactAll(busDir, argOpts).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[compact] FATAL', err);
    process.exit(1);
  });
}
