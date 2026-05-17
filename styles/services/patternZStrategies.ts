// styles/services/patternZStrategies.ts
//
// Pattern Z per-intent dispatch strategy map. When Pattern Z is enabled in
// Settings, aiService consults this map to decide whether a given action
// dispatches to the aggregator's multi-LLM bus or stays on the single-LLM
// path. 'single' bypasses the bus entirely (used for actions that don't
// make sense to fan out — e.g. image analysis with a model-specific preset).
//
// Defaults below are picked from the locked decisions in
// PATTERN_Z_BUILD_PLAN_2026-05-13.md §7.2. Per-intent overrides are
// deferred to a future phase; the configured Settings strategy
// (patternZStrategy) acts as the fallback for any intent not listed here.

export type Strategy = 'vote' | 'pick-best' | 'synthesize' | 'single';

export const DEFAULT_BUTTON_STRATEGIES: Record<string, Strategy> = {
  'shunt.amplify':        'synthesize',
  'shunt.summarize':      'pick-best',
  'shunt.translate':      'vote',
  'shunt.factcheck':      'pick-best',
  'weaver.outline':       'synthesize',
  'foundry.refine':       'synthesize',
  'oraculum.insights':    'synthesize',
  'imageAnalysis.preset': 'single', // never bus — preset is LM Studio specific
};

/**
 * Pick a strategy for an intent. Lookup order:
 *   1. Operator override (passed in)
 *   2. DEFAULT_BUTTON_STRATEGIES
 *   3. Fall back to the Settings default ('synthesize' if unset)
 *
 * Callers that pass no `defaultFromSettings` get 'synthesize' as the floor;
 * aiService threads its `getPatternZStrategy()` here so the Settings
 * patternZStrategy slider is honored for intents not in the map.
 */
export function strategyFor(
  intent: string,
  defaultFromSettings: Strategy = 'synthesize',
  overrides?: Record<string, Strategy>,
): Strategy {
  return overrides?.[intent] ?? DEFAULT_BUTTON_STRATEGIES[intent] ?? defaultFromSettings;
}
