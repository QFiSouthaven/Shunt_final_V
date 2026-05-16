
import { z } from 'zod';
import { aiPlanResponseSchema, implementationTaskSchema, tokenUsageSchema } from '@/types/schemas';
import { isAiConfigured, pingAiEndpoint } from '@/styles/services/aiService';

export const runDiagnostics = async (localEndpoint?: string): Promise<string> => {
    const logs: string[] = [];

    const log = (msg: string) => logs.push(msg);
    const pass = (msg: string) => log(`✅ PASSED: ${msg}`);
    const fail = (msg: string, error?: any) => log(`❌ FAILED: ${msg} ${error ? `(${error})` : ''}`);
    const warn = (msg: string) => log(`⚠️ WARNING: ${msg}`);

    log("Running System Diagnostics & Type Integrity Check");
    log("------------------------------------------------");

    // --- 1. Schema Validation Tests ---
    log("[1/3] Verifying Zod Schemas...");

    // Token Usage
    try {
        tokenUsageSchema.parse({
            prompt_tokens: "100", // Test coercion
            total_tokens: 100,
            model: 'local-model'
        });
        pass("TokenUsage Schema (Coercion)");
    } catch (e) {
        fail("TokenUsage Schema", e);
    }

    // AI Plan
    try {
        const result = aiPlanResponseSchema.parse({});
        if (result.clarifyingQuestions.length === 0) {
            pass("AiPlanResponse Schema (Defaults)");
        } else {
            fail("AiPlanResponse Schema (Defaults failed)");
        }
    } catch (e) {
        fail("AiPlanResponse Schema", e);
    }

    // --- 2. AI Health Check ---
    log("\n[2/3] Checking AI Connectivity...");
    if (localEndpoint) {
        try {
            log(`Pinging AI provider at: ${localEndpoint}`);
            const startTime = Date.now();
            // Probe to check if the configured AI endpoint is reachable
            const result = await pingAiEndpoint();
            const latency = Date.now() - startTime;
            if (result.ok) {
                pass(`AI provider is online and responding (${latency}ms)`);
            } else {
                fail("AI provider error", result.message);
            }
        } catch (e: any) {
            const errStr = e.toString().toLowerCase();
            if (errStr.includes('tensor') && errStr.includes('match')) {
                fail("Tensor Dimension Mismatch detected!", "Your local model's embedding dimensions (e.g., 1024 vs 1280) do not match the expected configuration. Please check your model loading parameters in LM Studio/Ollama.");
            } else if (errStr.includes('fetch') || errStr.includes('connect')) {
                fail("AI provider unreachable.", "Is your AI server (LM Studio / Ollama / OpenAI-compatible endpoint) running? Check CORS settings.");
            } else {
                fail("AI provider error", e.message);
            }
        }
    } else {
        warn("AI base URL not configured. Skipping health check.");
    }

    // --- 3. Environment & Config ---
    log("\n[3/3] Checking AI Config...");
    if (isAiConfigured()) {
        pass("AI provider is configured.");
    } else {
        fail("AI provider is NOT configured. Set the base URL in Settings.");
    }

    log("------------------------------------------------");
    log("Diagnostics Complete.");

    return logs.join('\n');
};
