// Minimal OpenAI-compatible AI client for the Management Hub.
//
// Server-side only — reads config from process.env (HUB_AI_*) because Next
// route handlers run server-side and cannot read the SPA's localStorage
// across origins. The hub maintains its own config independently.
//
// Single public surface: `generateText({system, user})`. Retries on 429/5xx
// with exponential backoff. AbortController for timeout. No streaming.

const DEFAULT_BASE_URL = 'http://localhost:1234/v1/chat/completions';
const DEFAULT_MODEL = 'local-model';
const DEFAULT_TIMEOUT_MS = 30000;

interface AiConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
  timeoutMs: number;
}

function getAiConfig(): AiConfig {
  return {
    baseUrl: process.env.HUB_AI_BASE_URL || DEFAULT_BASE_URL,
    model: process.env.HUB_AI_MODEL || DEFAULT_MODEL,
    apiKey: process.env.HUB_AI_API_KEY || '',
    timeoutMs: Number(process.env.HUB_AI_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
  };
}

export function isAiConfigured(): boolean {
  return Boolean(process.env.HUB_AI_BASE_URL || true); // base URL has a default
}

export class AiServiceError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'AiServiceError';
    this.status = status;
  }
}

interface GenerateOpts {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}

interface ChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

async function fetchOnce(opts: GenerateOpts, cfg: AiConfig): Promise<{ text: string }> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), cfg.timeoutMs);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cfg.apiKey) headers['Authorization'] = `Bearer ${cfg.apiKey}`;

  const body = {
    model: cfg.model,
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.user },
    ],
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.maxTokens ?? 512,
  };

  try {
    const res = await fetch(cfg.baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new AiServiceError(
        `AI endpoint returned ${res.status}: ${errText.slice(0, 200)}`,
        res.status,
      );
    }

    const json = (await res.json()) as ChatResponse;
    const text = json.choices?.[0]?.message?.content ?? '';
    return { text };
  } finally {
    clearTimeout(t);
  }
}

export async function generateText(opts: GenerateOpts): Promise<{ text: string }> {
  const cfg = getAiConfig();
  const maxAttempts = 3;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fetchOnce(opts, cfg);
    } catch (err) {
      lastErr = err;
      const status = err instanceof AiServiceError ? err.status : undefined;
      const retryable = status === undefined || RETRYABLE_STATUS.has(status);
      if (!retryable || attempt === maxAttempts) break;
      const backoffMs = 500 * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }

  if (lastErr instanceof Error) throw lastErr;
  throw new AiServiceError('AI request failed after retries');
}
