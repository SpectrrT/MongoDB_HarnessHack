import fs from 'node:fs/promises';
import path from 'node:path';

// One generation per checkpoint. The provider never receives local tools or runs effects.
export function sleepOpenRouterExecutor({ dataDir, model = process.env.OFFLOAD_MODEL || 'openai/gpt-4.1-mini',
  apiKey = process.env.OPENROUTER_API_KEY, fetcher = fetch } = {}) {
  const executor = async ({ task, prompt, maxOutputTokens, signal }) => {
    let key = apiKey;
    if (!key && dataDir) {
      try { key = JSON.parse(await fs.readFile(path.join(dataDir, 'openrouter', task.workspace + '.json'), 'utf8')).key; }
      catch (e) { if (e.code !== 'ENOENT') throw e; }
    }
    if (!key) throw Error('Connect OpenRouter or configure the worker API key.');
    const response = await fetcher('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST', signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, 'X-OpenRouter-Title': 'Offload Sleep' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: maxOutputTokens,
        temperature: 0, response_format: { type: 'json_object' }, provider: { require_parameters: true } }),
    });
    if (!response.ok) throw Error(`Sleep model request failed (${response.status}).`);
    const result = await response.json();
    const usage = result.usage ? { input_tokens: result.usage.prompt_tokens, output_tokens: result.usage.completion_tokens, cost: result.usage.cost } : null;
    // Preserve measured usage even when JSON is malformed; validation happens after settlement.
    let plan;
    try { plan = JSON.parse(result.choices?.[0]?.message?.content || ''); } catch { plan = null; }
    return { plan, usage, provider: 'openrouter', model: result.model || model };
  };
  executor.retrySafe = true;
  return executor;
}
