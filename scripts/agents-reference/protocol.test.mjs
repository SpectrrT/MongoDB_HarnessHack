import test from 'node:test';
import assert from 'node:assert/strict';
import {answer, BUDGET, MODEL, recordingFetch, ENDPOINT, totals} from './protocol.mjs';

const final = content => ({id: 'fixture-final', object: 'chat.completion', created: 1, model: MODEL,
  choices: [{index: 0, finish_reason: 'stop', message: {role: 'assistant', content}}], usage: {prompt_tokens: 10, completion_tokens: 3, cost: 0.00001}});
const toolReply = (name, args, id = 'tool-read') => ({...final(null), choices: [{index: 0, finish_reason: 'tool_calls', message: {role: 'assistant', content: null,
  tool_calls: [{id, type: 'function', function: {name, arguments: JSON.stringify(args)}}]}}]});
const compactor = {read: async ({id, part}) => ({id, part, text: 'Verified value is 42.', nextPart: null}), list: async ({offset}) => ({records: [{id: 'archived'}], offset, nextOffset: null})};
const request = {goal: 'Return JSON with value.', units: [{id: 'pointer', text: 'Read archived.'}], compactor, runId: 'fixture', apiKey: 'fixture-no-network', context: {phase: 'fixture'}};
function mock(responses, requests) {
  return async (url, init) => {
    assert.equal(String(url), ENDPOINT); requests.push(JSON.parse(init.body));
    const response = responses.shift(); assert.ok(response, 'No unbudgeted retries');
    return new Response(JSON.stringify(response.body ?? response), {status: response.status ?? 200, headers: {'Content-Type': 'application/json'}});
  };
}

test('actual SDK and Offload send identical first requests and recover through the same archive', async () => {
  const runs = {};
  for (const engine of ['sdk', 'offload']) {
    const requests = [], receipts = [];
    const result = await answer({...request, engine, receipts, fetchImpl: mock([toolReply('context_read', {id: 'archived'}), final('{"value":42}')], requests)});
    assert.deepEqual(result.answer, {value: 42}, JSON.stringify(result));
    assert.equal(result.retrievals.length, 1); assert.equal(result.retrievals[0].found, true);
    assert.equal(result.usage.calls, 2); assert.equal(result.usage.totalTokens, 26);
    assert.equal(result.usage.cost, 0.00002);
    runs[engine] = {requests, result};
  }
  assert.deepEqual(runs.sdk.requests[0], runs.offload.requests[0]);
  assert.deepEqual(runs.sdk.requests[1], runs.offload.requests[1]);
});

test('both harnesses enforce four model calls including tool recovery turns', async () => {
  for (const engine of ['sdk', 'offload']) {
    const requests = [], receipts = [];
    const result = await answer({...request, engine, receipts, fetchImpl: mock(Array.from({length: BUDGET.modelCalls}, (_, i) => toolReply('context_list', {}, `tool-${i}`)), requests)});
    assert.equal(result.answer, null); assert.ok(result.error);
    assert.equal(receipts.length, 4); assert.equal(result.usage.totalTokens, 52);
    assert.equal(result.retrievals.length, 4);
  }
});

test('provider failures preserve reported usage and never trigger hidden SDK retries', async () => {
  for (const engine of ['sdk', 'offload']) {
    const requests = [], receipts = [];
    const result = await answer({...request, engine, receipts, fetchImpl: mock([{status: 429, body: {error: {message: 'fixture quota'}, usage: {prompt_tokens: 7, completion_tokens: 0, cost: 0.002}}}], requests)});
    assert.equal(result.answer, null); assert.ok(result.error);
    assert.equal(receipts.length, 1); assert.equal(receipts[0].status, 429);
    assert.equal(result.usage.totalTokens, 7); assert.equal(result.usage.cost, 0.002);
  }
});

test('missing usage and malformed answers are retained rather than converted into zero-cost passes', async () => {
  for (const engine of ['sdk', 'offload']) {
    const receipts = [], body = final('not JSON'); delete body.usage;
    const result = await answer({...request, engine, receipts, fetchImpl: mock([body], [])});
    assert.equal(result.answer, null); assert.equal(receipts.length, 1);
    assert.equal(result.usage.totalTokens, null); assert.equal(result.usage.cost, null);
    assert.equal(result.usage.unknownUsageCalls, 1); assert.equal(result.usage.unknownCostCalls, 1);
  }
});

test('Jev error responses preserve partial raw usage and transport failures remain explicit', async () => {
  const receipts = [];
  const record = recordingFetch({receipts, context: {arm: 'offload', phase: 'decision'}, endpoint: 'https://api.typesafe.ai/v1/systemone', decision: true,
    fetchImpl: async () => new Response(JSON.stringify({usage: {input_tokens: 9}, error: 'fixture'}), {status: 500})});
  await record('https://api.typesafe.ai/v1/systemone', {body: '{}'});
  assert.equal(receipts[0].usage.inputTokens, 9); assert.equal(totals(receipts).totalTokens, null);
  assert.equal(totals(receipts).knownCost, 0); assert.equal(totals(receipts).cost, null);
  const failed = recordingFetch({receipts, context: {}, fetchImpl: async () => {throw Error('secret must not leak');}});
  await assert.rejects(failed(ENDPOINT, {body: '{}'}), /Transport unavailable/);
  assert.equal(receipts.length, 2); assert.equal(totals(receipts).unknownUsageCalls, 2);
  assert.equal(JSON.stringify(receipts).includes('secret'), false);
});
