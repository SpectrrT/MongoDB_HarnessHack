// Model routing tiers. Ids and $/1M-token prices are PLACEHOLDERS: verify tomorrow against
// https://openrouter.ai/api/v1/models (pricing.prompt / pricing.completion are $ per token there).
export const TIERS = Object.freeze({
  large: Object.freeze({
    id: "anthropic/claude-sonnet-4.5",
    inputPerM: 3,
    outputPerM: 15,
    baseLatencyMs: 1400,
    msPerOutputToken: 18,
  }),
  medium: Object.freeze({
    id: "google/gemini-2.5-flash",
    inputPerM: 0.3,
    outputPerM: 2.5,
    baseLatencyMs: 700,
    msPerOutputToken: 8,
  }),
  small: Object.freeze({
    id: "openai/gpt-4.1-nano",
    inputPerM: 0.1,
    outputPerM: 0.4,
    baseLatencyMs: 350,
    msPerOutputToken: 4,
  }),
});

export const modelFor = (tier) => (TIERS[tier] || TIERS.large).id;
export const tierOf = (modelId) =>
  Object.keys(TIERS).find((tier) => TIERS[tier].id === modelId || tier === modelId) || "large";

// The ScriptedModel has no tokenizer: estimate tokens as characters / 4.
export const estimateTokens = (text) => Math.ceil(String(text || "").length / 4);

export function costOf({ inputTokens = 0, outputTokens = 0 }, modelId) {
  const tier = TIERS[tierOf(modelId)];
  return (inputTokens * tier.inputPerM + outputTokens * tier.outputPerM) / 1e6;
}

export function latencyOf({ outputTokens = 0 }, modelId) {
  const tier = TIERS[tierOf(modelId)];
  return tier.baseLatencyMs + outputTokens * tier.msPerOutputToken;
}
