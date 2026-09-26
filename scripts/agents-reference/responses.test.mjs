import test from 'node:test';
import assert from 'node:assert/strict';
process.env.BENCHMARK_MODEL = 'openai/gpt-6-astra';
const {answer, MODEL, ENDPOINT, BUDGET} = await import('./protocol.mjs');

const response = output => ({id: 'resp_fixture', object: 'response', created_at: 1, status: 'completed', model: MODEL,
  output, usage: {input_tokens: 20, output_tokens: 10, total_tokens: 30, output_tokens_details: {reasoning_tokens: 7}, cost: 0.001}});
const final = response([{type: 'message', id: 'msg_fixture', status: 'completed', role: 'assistant', content: [{type: 'output_text', text: '{"value":42}', annotations: []}]}]);
const call = index => response([{type: 'function_call', id: `fc_${index}`, call_id: `call_${index}`, name: 'context_read', arguments: '{"id":"archived"}', status: 'completed'}]);
const base = {goal: 'Return JSON with value.', units: [{id: 'pointer', text: 'Read archived.'}], runId: 'fixture', apiKey: 'fixture', context: {phase: 'answer'},
  compactor: {read: async () => ({id: 'archived', part: 0, text: 'Verified value is 42.', nextPart: null})}};

test('Astra uses matching Responses requests, archive recovery and reasoning-inclusive usage', async () => {
  const sent = {};
  for (const engine of ['sdk', 'offload']) {
    const requests = [], receipts = [], replies = [call(1), final];
    const result = await answer({...base, engine, receipts, fetchImpl: async (url, init) => {
      assert.equal(String(url), ENDPOINT); assert.ok(ENDPOINT.endsWith('/responses'));
      requests.push(JSON.parse(init.body));
      return new Response(JSON.stringify(replies.shift()), {headers: {'Content-Type': 'application/json'}});
    }});
    assert.deepEqual(result.answer, {value: 42}, JSON.stringify(result));
    assert.equal(result.retrievals.length, 1);
    assert.equal(result.usage.totalTokens, 60);
    assert.equal(result.usage.cost, 0.002);
    assert.equal(requests[0].max_output_tokens, 4096);
    assert.equal(requests[0].reasoning.effort, 'medium');
    assert.equal(requests[0].store, false);
    assert.equal(requests[0].temperature, undefined);
    assert.ok(requests[1].input.some(item => item.type === 'function_call_output'));
    sent[engine] = requests;
  }
  assert.deepEqual(sent.sdk, sent.offload);
});

test('Responses respects the four-call limit and retains errors with unknown usage', async () => {
  for (const engine of ['sdk', 'offload']) {
    const receipts = [];
    const result = await answer({...base, engine, receipts, fetchImpl: async () => new Response(JSON.stringify(call(receipts.length)), {headers: {'Content-Type': 'application/json'}})});
    assert.equal(result.answer, null); assert.equal(receipts.length, BUDGET.modelCalls);
    assert.equal(result.usage.totalTokens, 120);
    const errors = [];
    const failed = await answer({...base, engine, receipts: errors, fetchImpl: async () => new Response(JSON.stringify({error: {message: 'fixture unavailable'}}), {status: 429, headers: {'Content-Type': 'application/json'}})});
    assert.equal(errors.length, 1); assert.equal(failed.usage.totalTokens, null);
    assert.equal(failed.answer, null);
  }
});
