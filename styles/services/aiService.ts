// services/aiService.ts
//
// OpenAI-compatible unified AI client. Replaces the previous @google/genai integration.
// All callers go through this module. The endpoint, model, and (optional) API key are
// read from localStorage settings (key: 'ai-shunt-settings'); defaults target LM Studio.

import { z } from 'zod';
import { ShuntAction, AiPlanResponse, TokenUsage, ImplementationTask, PromptModuleKey } from '@/types';
import { getPromptForAction, constructModularPrompt, MIA_RESEARCH_LOG } from './prompts';
import { logFrontendError, ErrorSeverity } from '@/utils/errorLogger';
import { withRetries } from './apiUtils';
import { aiPlanResponseSchema } from '@/types/schemas';
import { appEventBus } from '@/lib/eventBus';

// --- Pattern Z bus dispatch -----------------------------------------------
// When patternZEnabled === true in settings, eligible actions dispatch to the
// aggregator's /dispatch endpoint (multi-LLM fanout + reduce) instead of
// calling the single LM Studio endpoint directly. Map of which intents go
// through the bus (and how) lives in patternZStrategies.ts.
//
// The bus path is OPT-IN at the Settings level and FAILS OPEN at the call
// site — if the aggregator is down or returns an error, callers fall back
// to the single-LLM path automatically (warns to console).

import { type Strategy, strategyFor } from './patternZStrategies';

const AGGREGATOR_BASE_URL = 'http://127.0.0.1:7780';

export function isPatternZEnabled(): boolean {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(SETTINGS_STORAGE_KEY) : null;
    if (!raw) return false;
    const s = JSON.parse(raw);
    return s.patternZEnabled === true;
  } catch {
    return false;
  }
}

function getPatternZStrategy(): Strategy {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(SETTINGS_STORAGE_KEY) : null;
    if (!raw) return 'synthesize';
    const s = JSON.parse(raw);
    const v = s.patternZStrategy;
    return v === 'vote' || v === 'pick-best' || v === 'synthesize' ? v : 'synthesize';
  } catch {
    return 'synthesize';
  }
}

function getPatternZTimeoutMs(): number {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(SETTINGS_STORAGE_KEY) : null;
    if (!raw) return 30000;
    const s = JSON.parse(raw);
    return typeof s.patternZTimeoutMs === 'number' && s.patternZTimeoutMs > 0 ? s.patternZTimeoutMs : 30000;
  } catch {
    return 30000;
  }
}

/**
 * POST to aggregator /dispatch. Returns the joint output text and the per-peer
 * source candidates. Throws on HTTP error or `{ok:false}` response.
 */
export async function dispatchToBus(opts: {
  intent: string;
  prompt: string;
  strategy?: Strategy;
}): Promise<{ text: string; sources: Array<{ jid: string; reply: string }> }> {
  const strategy: Strategy = opts.strategy ?? strategyFor(opts.intent, getPatternZStrategy());
  // 'single' should never reach here — callers check strategy first.
  if (strategy === 'single') {
    throw new Error(`dispatchToBus called with strategy='single' for intent='${opts.intent}'`);
  }
  const res = await fetch(`${AGGREGATOR_BASE_URL}/dispatch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent: opts.intent,
      prompt: opts.prompt,
      strategy,
      timeout_ms: getPatternZTimeoutMs(),
    }),
  });
  if (!res.ok) throw new Error(`Bus dispatch failed: HTTP ${res.status}`);
  const data: any = await res.json();
  if (!data?.ok) throw new Error(`Bus dispatch error: ${data?.error ?? 'unknown'}`);
  return {
    text: typeof data.joint_output === 'string' ? data.joint_output : '',
    sources: Array.isArray(data.source_candidates) ? data.source_candidates : [],
  };
}

/**
 * Decide bus vs single-LLM at one call site. Returns the bus result if
 * dispatch succeeded; otherwise returns the single-LLM fallback. Logs a warn
 * on bus error but never throws because of bus state — the bus is a
 * best-effort augmentation, not a hard requirement.
 */
async function maybeDispatch(
  intent: string,
  buildPrompt: () => string,
  singleLlmFallback: () => Promise<string>,
): Promise<string> {
  if (!isPatternZEnabled()) return singleLlmFallback();
  const strat = strategyFor(intent, getPatternZStrategy());
  if (strat === 'single') return singleLlmFallback();
  try {
    const { text } = await dispatchToBus({ intent, prompt: buildPrompt(), strategy: strat });
    return text;
  } catch (e) {
    console.warn(`[aiService] Pattern Z dispatch failed (${intent}), falling back to single-LLM:`, e);
    return singleLlmFallback();
  }
}

// --- Cancellation registry ------------------------------------------------
// All in-flight fetch() calls register their AbortController here. The global
// Stop button calls cancelAllGenerations() to abort every running call at
// once. Event 'ai-inflight-changed' notifies the UI when count flips 0<->n
// so the button can show/hide. AbortError does NOT match withRetries' retry
// patterns ("network error" / "fetch failed" / "rate limit"), so cancelling
// will not trigger a silent retry.
const inflightControllers = new Set<AbortController>();
const emitInflightChange = (): void => {
  appEventBus.emit('ai-inflight-changed', { count: inflightControllers.size });
};
export const cancelAllGenerations = (): number => {
  const n = inflightControllers.size;
  for (const c of Array.from(inflightControllers)) {
    try { c.abort(); } catch { /* ignore */ }
  }
  inflightControllers.clear();
  emitInflightChange();
  return n;
};
export const getInflightCount = (): number => inflightControllers.size;

// --- Public content-part shape (mirrors the previously-used `Part` import shape so
// existing callers that build [{text}, {inlineData:{data,mimeType}}] keep working).
export interface TextPart { text: string }
export interface InlineDataPart { inlineData: { data: string; mimeType: string } }
export type ContentPart = TextPart | InlineDataPart;

// --- Settings access -------------------------------------------------------

const SETTINGS_STORAGE_KEY = 'ai-shunt-settings';
const DEFAULT_BASE_URL = 'http://localhost:1234/v1/chat/completions';
const DEFAULT_MODEL = 'local-model';

interface AiConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}

const getAiConfig = (): AiConfig => {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(SETTINGS_STORAGE_KEY) : null;
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      baseUrl: (parsed.aiBaseUrl as string) || DEFAULT_BASE_URL,
      model: (parsed.aiModel as string) || DEFAULT_MODEL,
      apiKey: (parsed.aiApiKey as string) || '',
    };
  } catch {
    return { baseUrl: DEFAULT_BASE_URL, model: DEFAULT_MODEL, apiKey: '' };
  }
};

// --- Auto-detect default model from /v1/models ----------------------------
// When the user hasn't picked a model in Settings (config.model === DEFAULT_MODEL),
// query the OpenAI-compatible /v1/models endpoint and use the first available id.
// LM Studio rejects requests for unknown model ids on /v1/chat/completions, so this
// removes the "first call 404s" friction. Cached per-baseUrl for the session.
const modelCache = new Map<string, string>();   // baseUrl -> resolved model id
let modelProbeInflight: Map<string, Promise<string>> = new Map();

const deriveModelsUrl = (chatCompletionsUrl: string): string => {
  // chatCompletionsUrl ends with /v1/chat/completions; swap to /v1/models
  return chatCompletionsUrl.replace(/\/chat\/completions\/?$/i, '/models');
};

const probeAvailableModel = async (cfg: AiConfig): Promise<string> => {
  const cached = modelCache.get(cfg.baseUrl);
  if (cached) return cached;
  const pending = modelProbeInflight.get(cfg.baseUrl);
  if (pending) return pending;
  const p = (async (): Promise<string> => {
    const url = deriveModelsUrl(cfg.baseUrl);
    const headers: Record<string, string> = {};
    if (cfg.apiKey) headers['Authorization'] = `Bearer ${cfg.apiKey}`;
    try {
      const resp = await fetch(url, { headers });
      if (!resp.ok) return DEFAULT_MODEL;
      const data = await resp.json();
      const first = data?.data?.[0]?.id;
      if (typeof first === 'string' && first) {
        modelCache.set(cfg.baseUrl, first);
        return first;
      }
    } catch { /* fall through */ }
    return DEFAULT_MODEL;
  })();
  modelProbeInflight.set(cfg.baseUrl, p);
  try { return await p; } finally { modelProbeInflight.delete(cfg.baseUrl); }
};

// Resolves the model to use. Order: explicit non-Gemini caller param wins, then
// configured aiModel (if not the default placeholder), then auto-detected from
// /v1/models, then the placeholder string as a last resort.
const resolveModel = async (requested?: string): Promise<string> => {
  if (requested && !/^gemini[-/]/i.test(requested)) return requested;
  const cfg = getAiConfig();
  if (cfg.model && cfg.model !== DEFAULT_MODEL) return cfg.model;
  return probeAvailableModel(cfg);
};

// --- HTTP layer ------------------------------------------------------------

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
  >;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: { content?: string; role?: string };
    finish_reason?: string;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  model?: string;
}

interface ChatRequestOptions {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

class AiServiceError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'AiServiceError';
    this.status = status;
  }
}

const callChatCompletion = async (opts: ChatRequestOptions): Promise<{ text: string; usage: TokenUsage; finishReason?: string }> => {
  const cfg = getAiConfig();
  const modelToUse = await resolveModel(opts.model);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cfg.apiKey) headers['Authorization'] = `Bearer ${cfg.apiKey}`;

  const body: Record<string, unknown> = {
    model: modelToUse,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.7,
    stream: false,
  };
  if (opts.topP !== undefined) body.top_p = opts.topP;
  if (opts.maxTokens !== undefined) body.max_tokens = opts.maxTokens;
  if (opts.jsonMode) body.response_format = { type: 'json_object' };

  const controller = new AbortController();
  inflightControllers.add(controller);
  emitInflightChange();
  try {
    let response: Response;
    try {
      response = await fetch(cfg.baseUrl, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
    } catch (err: any) {
      if (err?.name === 'AbortError' || controller.signal.aborted) {
        throw new AiServiceError('Generation cancelled by user.');
      }
      throw new AiServiceError(`Network error contacting AI endpoint at ${cfg.baseUrl}: ${err?.message ?? err}`);
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      // Some servers reject response_format. Bubble up a typed error so json-mode callers can retry.
      throw new AiServiceError(
        `AI server responded ${response.status}: ${errText || response.statusText}`,
        response.status,
      );
    }

    let data: ChatCompletionResponse;
    try {
      data = await response.json();
    } catch (err: any) {
      throw new AiServiceError(`AI server returned non-JSON body: ${err?.message ?? err}`);
    }

    const text = data.choices?.[0]?.message?.content ?? '';
    const usage: TokenUsage = {
      prompt_tokens: data.usage?.prompt_tokens ?? 0,
      completion_tokens: data.usage?.completion_tokens ?? 0,
      total_tokens: data.usage?.total_tokens ?? 0,
      model: data.model || modelToUse,
    };
    return { text, usage, finishReason: data.choices?.[0]?.finish_reason };
  } finally {
    inflightControllers.delete(controller);
    emitInflightChange();
  }
};

// --- Streaming variant -----------------------------------------------------
// Same registration/cancellation behavior as callChatCompletion, but consumes
// SSE chunks from `stream: true`. onToken fires for each incremental delta.
// Returns the final accumulated text and usage (when the server emits a final
// chunk with `usage`; otherwise zeros).
export const callChatCompletionStream = async (
  opts: ChatRequestOptions,
  onToken: (delta: string) => void,
): Promise<{ text: string; usage: TokenUsage; finishReason?: string }> => {
  const cfg = getAiConfig();
  const modelToUse = await resolveModel(opts.model);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cfg.apiKey) headers['Authorization'] = `Bearer ${cfg.apiKey}`;

  const body: Record<string, unknown> = {
    model: modelToUse,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.7,
    stream: true,
  };
  if (opts.topP !== undefined) body.top_p = opts.topP;
  if (opts.maxTokens !== undefined) body.max_tokens = opts.maxTokens;

  const controller = new AbortController();
  inflightControllers.add(controller);
  emitInflightChange();
  try {
    let response: Response;
    try {
      response = await fetch(cfg.baseUrl, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
    } catch (err: any) {
      if (err?.name === 'AbortError' || controller.signal.aborted) {
        throw new AiServiceError('Generation cancelled by user.');
      }
      throw new AiServiceError(`Network error contacting AI endpoint at ${cfg.baseUrl}: ${err?.message ?? err}`);
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new AiServiceError(`AI server responded ${response.status}: ${errText || response.statusText}`, response.status);
    }
    if (!response.body) throw new AiServiceError('AI server returned no body for streaming request.');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';
    let usage: TokenUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, model: modelToUse };
    let finishReason: string | undefined;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE frames are separated by \n\n; each frame may contain multiple `data:` lines.
      let sepIdx: number;
      while ((sepIdx = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, sepIdx);
        buffer = buffer.slice(sepIdx + 2);
        for (const rawLine of frame.split('\n')) {
          const line = rawLine.trim();
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const parsed = JSON.parse(payload);
            const delta = parsed?.choices?.[0]?.delta?.content;
            if (typeof delta === 'string' && delta.length > 0) {
              fullText += delta;
              onToken(delta);
            }
            const fr = parsed?.choices?.[0]?.finish_reason;
            if (fr) finishReason = fr;
            if (parsed?.usage) {
              usage = {
                prompt_tokens: parsed.usage.prompt_tokens ?? 0,
                completion_tokens: parsed.usage.completion_tokens ?? 0,
                total_tokens: parsed.usage.total_tokens ?? 0,
                model: parsed.model || modelToUse,
              };
            }
          } catch {
            // Tolerate occasional malformed frames — some servers send keep-alive comments.
          }
        }
      }
    }

    return { text: fullText, usage, finishReason };
  } finally {
    inflightControllers.delete(controller);
    emitInflightChange();
  }
};

// --- Helpers ---------------------------------------------------------------

const stripCodeFences = (s: string): string =>
  s.trim().replace(/^```[a-zA-Z0-9_+\-.]*\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

const partsToOpenAiContent = (parts: ContentPart[]): ChatMessage['content'] => {
  return parts.map(p => {
    if ('inlineData' in p) {
      return {
        type: 'image_url' as const,
        image_url: { url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}` },
      };
    }
    return { type: 'text' as const, text: p.text };
  });
};

const buildUserMessage = (prompt: string | ContentPart[]): ChatMessage => {
  if (typeof prompt === 'string') return { role: 'user', content: prompt };
  // Collapse to plain string content when there are no image parts. Many text-only
  // OpenAI-compatible servers (older LM Studio models) reject array-form content even
  // for pure-text payloads.
  const hasImage = prompt.some(p => 'inlineData' in p);
  if (!hasImage) {
    const text = prompt.map(p => ('text' in p ? p.text : '')).join('\n');
    return { role: 'user', content: text };
  }
  return { role: 'user', content: partsToOpenAiContent(prompt) };
};

const generateJson = async <T>(
  systemPrompt: string | null,
  userPrompt: string,
  schema: z.ZodType<T>,
  opts?: { model?: string; temperature?: number; topP?: number; maxTokens?: number }
): Promise<{ data: T; usage: TokenUsage }> => {
  const messages: ChatMessage[] = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: userPrompt });

  // Try json_object first; fall back to plain prompt-and-parse only if the server
  // specifically rejected `response_format` (some endpoints don't support it).
  // Other 400s (bad payload, bad model name, context overflow) bubble up unchanged.
  let result;
  try {
    result = await callChatCompletion({ messages, jsonMode: true, ...opts });
  } catch (err: any) {
    const looksLikeResponseFormatRejection =
      err instanceof AiServiceError &&
      err.status === 400 &&
      /response[_-]?format|json[_-]?object|json[_-]?schema/i.test(err.message);
    if (looksLikeResponseFormatRejection) {
      result = await callChatCompletion({ messages, jsonMode: false, ...opts });
    } else {
      throw err;
    }
  }
  if (result.finishReason === 'length') {
    throw new Error("The AI's response was truncated, resulting in incomplete JSON.");
  }

  const cleaned = stripCodeFences(result.text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err: any) {
    throw new Error(`AI returned invalid JSON: ${err?.message ?? err}`);
  }

  const validation = schema.safeParse(parsed);
  if (!validation.success) {
    console.warn('Zod validation failed:', validation.error);
    throw new Error(`Schema validation failed: ${validation.error.message}`);
  }
  return { data: validation.data, usage: result.usage };
};

// --- Public API (mirrors prior geminiService.ts surface) -------------------

export const performShunt = async (
  text: string,
  action: ShuntAction,
  modelName: string,
  context?: string,
  priority?: string,
  promptInjectionGuardEnabled?: boolean,
): Promise<{ resultText: string; tokenUsage: TokenUsage }> => {
  try {
    // Pattern Z dispatch (Phase 5/6) — when patternZEnabled is on AND this
    // action has a non-'single' strategy, route through the aggregator. The
    // bus path returns a joint text-only output; token usage is unavailable
    // for the aggregator path so we report zero usage rather than fabricate.
    // The intent string mirrors `shunt.<action-slug>` for the strategy map.
    const shuntIntent = `shunt.${action.toLowerCase().replace(/\s+/g, '-')}`;
    if (isPatternZEnabled()) {
      const strat = strategyFor(shuntIntent, getPatternZStrategy());
      if (strat !== 'single') {
        try {
          const { text: joint } = await dispatchToBus({
            intent: shuntIntent,
            prompt: getPromptForAction(text, action, context, priority, promptInjectionGuardEnabled),
            strategy: strat,
          });
          const cleaned =
            action === ShuntAction.FORMAT_JSON ||
            action === ShuntAction.MAKE_ACTIONABLE ||
            action === ShuntAction.GENERATE_VAM_PRESET
              ? stripCodeFences(joint)
              : joint;
          return {
            resultText: cleaned,
            tokenUsage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, model: `bus:${strat}` },
          };
        } catch (e) {
          console.warn(`[aiService] Pattern Z dispatch failed (${shuntIntent}), falling back to single-LLM:`, e);
          // fall through to single-LLM path
        }
      }
    }

    const apiCall = async () => {
      const prompt = getPromptForAction(text, action, context, priority, promptInjectionGuardEnabled);
      const { text: resultText, usage } = await callChatCompletion({
        messages: [{ role: 'user', content: prompt }],
        model: modelName,
      });
      if (
        action === ShuntAction.FORMAT_JSON ||
        action === ShuntAction.MAKE_ACTIONABLE ||
        action === ShuntAction.GENERATE_VAM_PRESET
      ) {
        return { resultText: stripCodeFences(resultText), tokenUsage: usage };
      }
      return { resultText, tokenUsage: usage };
    };
    return await withRetries(apiCall);
  } catch (error) {
    logFrontendError(error, ErrorSeverity.High, { context: 'performShunt AI call' });
    throw error;
  }
};

export const executeModularPrompt = async (
  text: string,
  modules: Set<PromptModuleKey>,
  context?: string,
  priority?: string,
  promptInjectionGuardEnabled?: boolean,
): Promise<{ resultText: string; tokenUsage: TokenUsage }> => {
  const prompt = constructModularPrompt(text, modules, context, priority, promptInjectionGuardEnabled);
  try {
    const apiCall = async () => {
      const { text: resultText, usage } = await callChatCompletion({
        messages: [{ role: 'user', content: prompt }],
        model: undefined,
      });
      return { resultText, tokenUsage: usage };
    };
    return await withRetries(apiCall);
  } catch (error) {
    logFrontendError(error, ErrorSeverity.High, { context: 'executeModularPrompt AI call' });
    throw error;
  }
};

export const gradeOutput = async (output: string, originalPrompt: string): Promise<{ score: number }> => {
  const prompt = `You are a quality assurance AI. Your task is to grade an AI's output based on an original prompt.
Provide a score from -10 (very bad) to +10 (excellent).
Your response MUST be ONLY the score, like this: "Score: 8".

--- ORIGINAL PROMPT ---
${originalPrompt}

--- AI OUTPUT TO GRADE ---
${output}
`;
  try {
    const apiCall = async () => {
      const { text } = await callChatCompletion({
        messages: [{ role: 'user', content: prompt }],
        model: undefined,
        temperature: 0.0,
      });
      const m = text.match(/Score:\s*(-?\d+)/);
      return { score: m ? parseInt(m[1], 10) : 0 };
    };
    return await withRetries(apiCall);
  } catch (error) {
    logFrontendError(error, ErrorSeverity.High, { context: 'gradeOutput AI call' });
    throw error;
  }
};

export const synthesizeDocuments = async (
  combinedContent: string,
  modelName: string,
): Promise<{ resultText: string; tokenUsage: TokenUsage }> => {
  const prompt = `You are an expert research assistant. Your task is to synthesize the following collection of documents into a single, cohesive, and well-structured markdown document.
Identify the main themes, connections, and key takeaways from all the provided texts. The final output should be a summary that integrates all the information logically.

--- DOCUMENTS ---
${combinedContent}
---
`;
  try {
    const apiCall = async () => {
      const { text, usage } = await callChatCompletion({
        messages: [{ role: 'user', content: prompt }],
        model: modelName,
      });
      return { resultText: text, tokenUsage: usage };
    };
    return await withRetries(apiCall);
  } catch (error) {
    logFrontendError(error, ErrorSeverity.High, { context: 'synthesizeDocuments AI call' });
    throw error;
  }
};

export const generateRawText = async (
  prompt: string | ContentPart[],
  modelName?: string,
): Promise<{ resultText: string; tokenUsage: TokenUsage }> => {
  try {
    const apiCall = async () => {
      const { text, usage } = await callChatCompletion({
        messages: [buildUserMessage(prompt)],
        model: modelName,
      });
      return { resultText: text, tokenUsage: usage };
    };
    return await withRetries(apiCall);
  } catch (error) {
    logFrontendError(error, ErrorSeverity.High, { context: 'generateRawText AI call' });
    throw error;
  }
};

export const generateRealTimeCorrection = async (userDraft: string): Promise<string> => {
  if (!userDraft.trim()) return '';
  const systemInstruction = `You are Mia, an expert AI Prompt Engineer and System Instruction Architect.
Mia will act as a OCD Senior Prompt Engineering Specialist that tidy ups other peoples ambiguous Grammer.

Your goal is to analyze the user's draft prompt and rewrite it to be highly effective, adhering to the best practices defined in the provided "System Instruction Mastery" research log.

**Core Principles to Apply:**
1. **PTCF Framework:** Ensure the prompt has a clear Persona, Task, Context, and Format.
2. **Specificity:** Eliminate ambiguity. Be hyper-specific about role and constraints.
3. **Structure:** Use markdown headers or XML tags to structure the prompt.
4. **Positive Constraints:** Say what TO do, not just what to avoid.

**Research Context:**
${MIA_RESEARCH_LOG}

**Instructions:**
- Output ONLY the rewritten, optimized prompt.
- Do not include explanations or conversational filler.
- The output should be ready to copy-paste.`;
  try {
    const apiCall = async () => {
      const { text } = await callChatCompletion({
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: userDraft },
        ],
        model: undefined,
        temperature: 0.3,
      });
      return text.trim();
    };
    return await withRetries(apiCall);
  } catch (error) {
    console.warn('Real-time correction failed', error);
    return '';
  }
};

export const generateOraculumInsights = async (eventsJson: string): Promise<string> => {
  const prompt = `You are Oraculum, a senior data analyst AI. Analyze the following stream of telemetry events from the Aether Shunt application.
Provide a concise, actionable report in Markdown format.

The report should include:
1.  **High-Level Summary:** What is the user's primary activity pattern? Are they exploring, encountering errors, or successfully using features?
2.  **Key Observations:** Identify 2-3 significant patterns or events (e.g., repeated use of a specific action, frequent errors, high token usage).
3.  **Potential User Intent:** Based on the event sequence, what is the user likely trying to achieve?
4.  **Actionable Insight:** Suggest one concrete improvement or intervention. (e.g., "The user is repeatedly using 'Amplify'. Suggest they try the 'Amplify x2' feature for more powerful results.").

**Telemetry Event Stream (JSON):**
---
${eventsJson}
---
`;
  try {
    const apiCall = async () => {
      const { text } = await callChatCompletion({
        messages: [{ role: 'user', content: prompt }],
        model: undefined,
      });
      return text;
    };
    return await withRetries(apiCall);
  } catch (error) {
    logFrontendError(error, ErrorSeverity.High, { context: 'generateOraculumInsights AI call' });
    throw error;
  }
};

export const generateOrchestratorReport = async (prompt: string): Promise<{ resultText: string; tokenUsage: TokenUsage }> => {
  try {
    const apiCall = async () => {
      const { text, usage } = await callChatCompletion({
        messages: [{ role: 'user', content: prompt }],
        model: undefined,
      });
      return { resultText: text, tokenUsage: usage };
    };
    return await withRetries(apiCall);
  } catch (error) {
    logFrontendError(error, ErrorSeverity.High, { context: 'generateOrchestratorReport AI call' });
    throw error;
  }
};

export const generatePerformanceReport = async (metrics: string): Promise<{ resultText: string; tokenUsage: TokenUsage }> => {
  const prompt = `You are an expert Senior Site Reliability Engineer (SRE). Analyze the following performance metrics from a web application and provide a concise, actionable report in Markdown format.

The report should include:
1.  **Overall Health Assessment:** A brief summary (Good, Fair, Poor) and why.
2.  **Key Observations:** Bullet points highlighting significant findings (e.g., high latency in a specific API, low cache hit ratio).
3.  **Potential Bottlenecks:** Identify the most likely performance bottlenecks based on the data.
4.  **Actionable Recommendations:** Suggest 2-3 specific, high-impact actions to improve performance.

**Performance Metrics Snapshot:**
---
${metrics}
---
`;
  try {
    const apiCall = async () => {
      const { text, usage } = await callChatCompletion({
        messages: [{ role: 'user', content: prompt }],
        model: undefined,
      });
      return { resultText: text, tokenUsage: usage };
    };
    return await withRetries(apiCall);
  } catch (error) {
    logFrontendError(error, ErrorSeverity.High, { context: 'generatePerformanceReport AI call' });
    throw error;
  }
};

const aiContextChatSchema = z.object({
  answer: z.string().default(''),
  isContextRelated: z.boolean().default(true),
});

export const getAIChatResponseWithContextFlag = async (
  prompt: string,
): Promise<{ answer: string; isContextRelated: boolean; tokenUsage: TokenUsage }> => {
  const wrappedPrompt = `${prompt}

Respond ONLY with a JSON object of the shape {"answer": string, "isContextRelated": boolean}. The "answer" is the textual answer to the user's question. "isContextRelated" is TRUE if the provided context was used to answer, FALSE if the answer was generated from general knowledge because the context was not relevant.`;
  try {
    const apiCall = async () => {
      const { data, usage } = await generateJson(null, wrappedPrompt, aiContextChatSchema, {
        model: undefined,
      });
      return {
        answer: data.answer || "Sorry, I couldn't generate a proper response.",
        isContextRelated: data.isContextRelated,
        tokenUsage: usage,
      };
    };
    return await withRetries(apiCall);
  } catch (error) {
    logFrontendError(error, ErrorSeverity.High, { context: 'getAIChatResponseWithContextFlag AI call' });
    throw error;
  }
};

export async function generateDevelopmentPlan(goal: string, context: string): Promise<AiPlanResponse> {
  const prompt = `
You are an expert software architect acting as a 'Strategy & Task Formulation' AI. Your role is to assist a user in managing the development of this application, the 'AI Content Shunt'.

You will be given a high-level development goal from the user and the project's context.

Your task is to deconstruct the goal into a clear, actionable development plan based on the schema provided.

**Project Context:**
---
${context}
---

**User's Goal:**
---
${goal}
---

Respond ONLY with a JSON object of this exact shape:
{
  "clarifyingQuestions": string[],
  "architecturalProposal": string,
  "implementationTasks": [{ "filePath": string, "description": string, "details"?: string, "newContent"?: string }],
  "testCases": string[],
  "dataSchema": string
}
- clarifyingQuestions: questions to refine the goal (empty array if none).
- architecturalProposal: brief technical approach referencing existing files and components.
- implementationTasks: list of atomic tasks. Each must include filePath and description; use "details" for step-by-step instructions, do NOT use "newContent" here.
- testCases: simple, verifiable test cases.
- dataSchema: TypeScript interfaces / type definitions for any new data structures.
`;
  try {
    const apiCall = async () => {
      const { data, usage } = await generateJson(null, prompt, aiPlanResponseSchema, {
        model: undefined,
        temperature: 0.1,
        topP: 0.9,
        maxTokens: 4096,
      });
      return {
        clarifyingQuestions: [],
        architecturalProposal: '',
        implementationTasks: [],
        testCases: [],
        dataSchema: '',
        ...data,
        tokenUsage: usage,
      } as AiPlanResponse;
    };
    return await withRetries(apiCall);
  } catch (error) {
    logFrontendError(error, ErrorSeverity.Critical, { context: 'generateDevelopmentPlan AI call' });
    throw error;
  }
}

export const generateProjectTome = async (
  projectContext: string,
  fileTree: string,
  componentDiagram: string,
): Promise<{ resultText: string; tokenUsage: TokenUsage }> => {
  const prompt = `
You are a "Tome Weaver" AI. Your purpose is to create a definitive, all-encompassing "Project Tome" from a provided codebase and pre-generated diagrams. This document should serve as the ultimate source of truth for any developer.

Structure the output in Markdown.

# Project Tome: [Infer a suitable project name from context]

## 1. Executive Summary
A high-level, one-paragraph overview of the application's purpose and its core functionality.

## 2. File Structure Overview
**Analyze and describe the provided file tree diagram.** Explain the purpose of the main directories. After your explanation, embed the provided file tree diagram exactly as it is given.

## 3. Architectural Deep Dive
- **Core Philosophy:** Describe the main architectural patterns.
- **Data Flow:** Explain how data moves through the app.
- **State Management:** Detail the global and local state strategy.

## 4. Component Hierarchy Diagram
**Analyze and describe the component relationships shown in the Mermaid diagram.** After your explanation, embed the provided Mermaid diagram in a mermaid code block.

## 5. Service Layer Breakdown
Describe each major service file and its key responsibilities.

## 6. Key Data Structures
Explain the most important TypeScript types and interfaces.

---
**PROVIDED DIAGRAMS & PROJECT SOURCE:**

### File Tree Diagram:
${fileTree}

### Component Hierarchy (Mermaid):
\`\`\`mermaid
${componentDiagram}
\`\`\`

### Project Source Code:
${projectContext}
---
`;
  try {
    const apiCall = async () => {
      const { text, usage } = await callChatCompletion({
        messages: [{ role: 'user', content: prompt }],
        model: undefined,
      });
      return { resultText: text, tokenUsage: usage };
    };
    return await withRetries(apiCall);
  } catch (error) {
    logFrontendError(error, ErrorSeverity.High, { context: 'generateProjectTome AI call' });
    throw error;
  }
};

// Trigger words that opt into the 3D-artist + Virt-a-Mate-preset technical
// appendix. CLAUDE.md previously flagged analyzeImage as having a hardcoded
// VAM preset prompt that fired on every call. As of 2026-05-17 the appendix
// is keyword-gated so generic image questions get clean responses while the
// 3D/VAM workflow stays available on explicit ask.
const VAM_TRIGGER_RE = /\b(vam|virt-?a-?mate|3d ?(model|preset|character|artist|rig)|topology|pbr|rigging|morphs?|uv ?(map|s)?)\b/i;

export const analyzeImage = async (
  prompt: string,
  image: { base64Data: string; mimeType: string },
): Promise<{ resultText: string; tokenUsage: TokenUsage }> => {
  const wantsTechnical3D = VAM_TRIGGER_RE.test(prompt);

  const technicalAppendix = `

If the image contains a character, creature, or object suitable for a 3D model, add the following two sections to the end of your analysis, formatted exactly in markdown:

**Technical Considerations (for 3D Artists):**
*   **Topology:** Describe the ideal topology for the subject. Emphasize clean, animation-ready quad topology for smooth deformations during rigging and animation.
*   **UVs:** Detail the necessary UV mapping approach. Specify the need for well-organized, non-overlapping UV maps for all distinct parts of the model (e.g., body, head, hair, clothing).
*   **Texture Maps:** List the required texture maps for a PBR workflow. Include Diffuse/Albedo, Normal, Roughness, and Specular maps. Mention the benefit of Subsurface Scattering (SSS) maps for any organic surfaces like skin.
*   **Rigging:** Outline key considerations for rigging. Mention the importance of designing with clear joint placement and weight painting in mind for effective rigging, including the need for facial blend shapes for expressions if applicable.

**Virt-a-Mate Preset (JSON):**
*   **Instructions:** Based on the visual characteristics of the character in the image, generate a complete JSON preset file in the Virt-a-Mate (VAM) format.
*   **Output:** Your output for this section must be a single, well-formed JSON object inside a JSON markdown block. Do not add any explanatory text outside the JSON.
*   **Structure:** The JSON should define the character's appearance and properties, emulating the structure of a VAM preset. Include key sections within the main "storables" array for the "geometry" id: "clothing", "hair", "morphs" (this is critical for face/body shape), "textures" (with placeholder URLs like 'author.pack:/path/to/texture.jpg'), and other relevant "storables" for skin, eyes, and physics.`;

  // Generic mode (default): "expert visual analyst" framing, no 3D/VAM bits.
  // 3D/VAM mode (triggered by keywords in prompt): preserves the original
  // expert-art-director + technical appendix behavior. Either way the user's
  // own prompt comes BEFORE the framing, not buried after it — previously the
  // hardcoded instructions ran first and the user's request was tacked on at
  // the end, which made the model treat the user's question as secondary.
  const framing = wantsTechnical3D
    ? `You are an expert art director and 3D character artist providing a detailed analysis of the attached image. Respond directly and thoroughly to the user's request first.${technicalAppendix}`
    : `You are an expert visual analyst providing a clear, detailed description of the attached image. Respond directly and thoroughly to the user's request. Don't volunteer technical 3D-pipeline details unless the user asks.`;

  const enhancedPrompt = `**User's Request:** ${prompt}\n\n---\n\n${framing}`;
  try {
    const apiCall = async () => {
      const message: ChatMessage = {
        role: 'user',
        content: [
          { type: 'text', text: enhancedPrompt },
          { type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.base64Data}` } },
        ],
      };
      const { text, usage } = await callChatCompletion({
        messages: [message],
        model: undefined,
      });
      return { resultText: text, tokenUsage: usage };
    };
    return await withRetries(apiCall);
  } catch (error) {
    logFrontendError(error, ErrorSeverity.High, { context: 'analyzeImage AI call' });
    throw error;
  }
};

// --- Chat object (mirrors the prior @google/genai Chat surface used by Chat.tsx) ---
export interface AiChatHistoryEntry {
  role: 'user' | 'model';
  parts: { text: string }[];
}

export class AiChat {
  private history: ChatMessage[];
  private systemInstruction?: string;

  constructor(opts?: { history?: AiChatHistoryEntry[]; systemInstruction?: string }) {
    this.systemInstruction = opts?.systemInstruction;
    this.history = (opts?.history ?? []).map(h => ({
      role: h.role === 'model' ? 'assistant' : 'user',
      content: h.parts.map(p => p.text).join('\n'),
    }));
  }

  async sendMessage(input: { message: string }): Promise<{ text: string }> {
    const messages: ChatMessage[] = [];
    if (this.systemInstruction) messages.push({ role: 'system', content: this.systemInstruction });
    messages.push(...this.history);
    messages.push({ role: 'user', content: input.message });
    const { text } = await callChatCompletion({ messages, model: undefined });
    this.history.push({ role: 'user', content: input.message });
    this.history.push({ role: 'assistant', content: text });
    return { text };
  }
}

export const startChat = (history?: AiChatHistoryEntry[]): AiChat => {
  return new AiChat({ history });
};

export const generateApiDocumentation = async (projectContext: string): Promise<{ resultText: string; tokenUsage: TokenUsage }> => {
  const prompt = `
You are an expert technical writer specializing in API documentation. Your task is to analyze the provided source code and generate a comprehensive API reference document in Markdown format.

Scan the code for API service calls (e.g., using \`fetch\`, or within service files like \`aiService.ts\`). For each logical group of endpoints, create a section.

For each endpoint (exported function making an external call), document the following:
- **Endpoint:** The function name (e.g., \`performShunt\`).
- **Description:** What does this function do?
- **Parameters/Request Body:** What data does it accept? Describe the schema or arguments.
- **Response:** What does a successful response look like? Describe the return type or schema.
- **Example Usage:** Provide a brief code snippet showing how to call this function.

Structure the entire output as a clean, readable Markdown document. If no API calls are found, state that clearly.

---
**PROJECT SOURCE CODE:**
${projectContext}
---
`;
  try {
    return await generateRawText(prompt, undefined);
  } catch (error) {
    logFrontendError(error, ErrorSeverity.High, { context: 'generateApiDocumentation AI call' });
    throw error;
  }
};

export const generateQualityReport = async (projectContext: string): Promise<{ resultText: string; tokenUsage: TokenUsage }> => {
  const prompt = `
You are a senior code reviewer AI with an expert eye for code quality, performance, and best practices in React/TypeScript applications. Your task is to conduct a thorough review of the provided source code and generate a "Code Quality & Refactoring Report".

Analyze the code for:
- **Potential Bugs:** Logical errors, race conditions, null pointer issues.
- **Performance Bottlenecks:** Inefficient loops, unnecessary re-renders, large bundle size contributors.
- **Code Smells & Anti-patterns:** Prop drilling, large components, inconsistent coding styles.
- **Refactoring Opportunities:** Areas where code can be simplified, made more reusable (e.g., custom hooks), or modernized.
- **Security Vulnerabilities:** Basic checks for things like XSS if applicable.

Structure your report in Markdown. For each issue or suggestion, provide:
- **File & Location:** The full file path.
- **Issue/Suggestion:** A clear description of the problem or improvement.
- **Rationale:** Why it's an issue and why the change is recommended.
- **Example (Optional):** A small code snippet showing the "before" and "after".

If the code is of high quality, acknowledge that and highlight a few examples of good practices.

---
**PROJECT SOURCE CODE:**
${projectContext}
---
`;
  try {
    return await generateRawText(prompt, undefined);
  } catch (error) {
    logFrontendError(error, ErrorSeverity.High, { context: 'generateQualityReport AI call' });
    throw error;
  }
};

// --- Mia helpers (formerly in miaService.ts) -------------------------------

const MIA_SYSTEM_INSTRUCTION =
  'You are Mia, a friendly and highly intelligent AI assistant embedded in a complex web application for developers. Be helpful and concise. Your primary role is to assist the user with understanding and operating the application.';

export const getMiaChatResponse = async (
  history: AiChatHistoryEntry[],
  newMessage: string,
): Promise<string> => {
  try {
    const apiCall = async () => {
      const chat = new AiChat({ history, systemInstruction: MIA_SYSTEM_INSTRUCTION });
      const { text } = await chat.sendMessage({ message: newMessage });
      return text;
    };
    return await withRetries(apiCall);
  } catch (error) {
    logFrontendError(error, ErrorSeverity.High, { context: 'getMiaChatResponse AI call' });
    throw error;
  }
};

// Streaming variant. onToken fires for each incremental delta as the model emits it.
// Returns the full accumulated text once the stream completes. Same retry behavior
// would have to be opted out of since retrying mid-stream is meaningless — we just
// surface errors directly.
export const getMiaChatResponseStream = async (
  history: AiChatHistoryEntry[],
  newMessage: string,
  onToken: (delta: string) => void,
): Promise<string> => {
  try {
    const messages: ChatMessage[] = [
      { role: 'system', content: MIA_SYSTEM_INSTRUCTION },
      ...history.map(h => ({
        role: (h.role === 'model' ? 'assistant' : 'user') as 'assistant' | 'user',
        content: h.parts.map(p => p.text).join(''),
      })),
      { role: 'user', content: newMessage },
    ];
    const { text } = await callChatCompletionStream({ messages }, onToken);
    return text;
  } catch (error) {
    logFrontendError(error, ErrorSeverity.High, { context: 'getMiaChatResponseStream AI call' });
    throw error;
  }
};

export const getMiaErrorAnalysis = async (errorLog: Record<string, any>): Promise<string> => {
  const prompt = `You are an expert software engineer and helpful AI assistant named Mia. You are embedded within a web application. Your task is to analyze the following error report that was just captured from the application. Your analysis should be clear, concise, and helpful to the developer using the application. Structure your response in Markdown.

1.  **Explain the Error:** In simple terms, what does this error mean?
2.  **Identify the Likely Cause:** Based on the stack trace and provided context, what is the most probable reason for this error? Point to specific files or components if possible.
3.  **Suggest a Solution:** Provide concrete, actionable steps the developer can take to fix the issue. If possible, suggest specific code changes.

Here is the error report:
---
${JSON.stringify(errorLog, null, 2)}
---`;
  try {
    const apiCall = async () => {
      const { text } = await callChatCompletion({
        messages: [{ role: 'user', content: prompt }],
        model: undefined,
      });
      return text;
    };
    return await withRetries(apiCall);
  } catch (error) {
    logFrontendError(error, ErrorSeverity.Critical, { context: 'getMiaErrorAnalysis AI call' });
    throw error;
  }
};

export const generateCodeFixPlan = async (
  errorLog: Record<string, any>,
  projectContext: string,
): Promise<AiPlanResponse> => {
  const prompt = `
You are the **Host Agent**, a master orchestrator AI. Your purpose is to resolve a critical error within the web application by assembling and directing a team of specialist sub-agents.

**Objective:** Initiate a verifiably validated solutions fix. The proposed solution must be rigorously analyzed to ensure it effectively resolves the issue without introducing regressions.

**Your Sub-Agent Team:**
1.  **React Sub-Agent:** Expert in the React 19 ecosystem; analyzes component lifecycle, state management, props, JSX, and event handling.
2.  **TypeScript Sub-Agent:** Specialist in static typing; scrutinizes type definitions, interfaces, Zod schemas, and potential type mismatches.
3.  **DevOps Sub-Agent:** Systems expert; reviews build configurations, dependencies (package.json), environment variables, and backend API contracts.

**Mission:** Given the following error report and project context, perform a collaborative diagnosis and generate a complete, production-quality code fix.

**Execution Protocol:**
1. Internal monologue: Host analysis, simulated sub-agent analyses, final strategy.
2. Generate implementation plan: For each file that needs modification, you MUST provide the ENTIRE NEW COMPLETE file content in 'newContent'. No diffs or partial code.
3. Output strictly as the JSON schema below.

Respond ONLY with a JSON object of this exact shape:
{
  "internalMonologue": string,
  "clarifyingQuestions": string[],
  "architecturalProposal": string,
  "implementationTasks": [{ "filePath": string, "description": string, "details"?: string, "newContent": string }],
  "testCases": string[]
}
clarifyingQuestions/architecturalProposal/testCases may be empty arrays/strings.

---
**Error Report:**
\`\`\`json
${JSON.stringify(errorLog, null, 2)}
\`\`\`
---
**Project Context:**
\`\`\`markdown
${projectContext}
\`\`\`
---
`;
  try {
    const apiCall = async () => {
      const { data, usage } = await generateJson(null, prompt, aiPlanResponseSchema, {
        model: undefined,
      });
      return {
        clarifyingQuestions: [],
        architecturalProposal: '',
        testCases: [],
        ...data,
        tokenUsage: usage,
      } as AiPlanResponse;
    };
    return await withRetries(apiCall);
  } catch (error) {
    logFrontendError(error, ErrorSeverity.Critical, { context: 'generateCodeFixPlan AI call' });
    throw new Error('Failed to generate the code fix. The AI may have returned an invalid response or malformed JSON.');
  }
};

// Test/diagnostic helpers
export const isAiConfigured = (): boolean => {
  const cfg = getAiConfig();
  return Boolean(cfg.baseUrl);
};

export const pingAiEndpoint = async (): Promise<{ ok: boolean; message: string }> => {
  try {
    const { text } = await callChatCompletion({
      messages: [{ role: 'user', content: 'ping' }],
      maxTokens: 8,
      temperature: 0.0,
    });
    return { ok: true, message: text || 'ok' };
  } catch (err: any) {
    return { ok: false, message: err?.message ?? String(err) };
  }
};
