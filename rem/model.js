// Model interface: chat({ model, messages, tools }) → { toolCall: { name, args } } | { final }, plus usage.
import { createScriptedModel } from "./scripted.js";

export { createScriptedModel };

// OpenAI-style function names cannot contain dots.
const toWire = (name) => name.replace(/\./g, "__");
const fromWire = (name) => name.replace(/__/g, ".");

// TOMORROW: OpenAI-compatible chat completions with tool calling via OpenRouter. Untested tonight.
export function createOpenRouterModel({
  apiKey = process.env.OPENROUTER_API_KEY,
  baseUrl = "https://openrouter.ai/api/v1",
  appName = "REM harness",
} = {}) {
  if (!apiKey) throw new Error("Set OPENROUTER_API_KEY to use OpenRouter.");
  return {
    name: "openrouter",
    async chat({ model, messages, tools = [] }) {
      const wireMessages = messages.map((m) =>
        m.tool_calls
          ? {
              ...m,
              tool_calls: m.tool_calls.map((tc) => ({
                ...tc,
                function: { ...tc.function, name: toWire(tc.function.name) },
              })),
            }
          : m,
      );
      const wireTools = tools.map((t) => ({ ...t, function: { ...t.function, name: toWire(t.function.name) } }));
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
          "X-Title": appName,
        },
        body: JSON.stringify({
          model,
          messages: wireMessages,
          ...(wireTools.length ? { tools: wireTools, tool_choice: "auto" } : {}),
          usage: { include: true },
        }),
      });
      if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
      const data = await res.json();
      const message = data.choices?.[0]?.message || {};
      const usage = {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
        reportedCost: data.usage?.cost ?? null,
      };
      const call = message.tool_calls?.[0];
      if (call)
        return {
          toolCall: { name: fromWire(call.function.name), args: JSON.parse(call.function.arguments || "{}") },
          usage,
          model,
        };
      return { final: message.content || "", usage, model };
    },
  };
}

// Opt-in: REM_MODEL=openrouter plus OPENROUTER_API_KEY. Otherwise the deterministic ScriptedModel.
export function createModel() {
  return process.env.REM_MODEL === "openrouter" && process.env.OPENROUTER_API_KEY
    ? createOpenRouterModel()
    : createScriptedModel();
}
