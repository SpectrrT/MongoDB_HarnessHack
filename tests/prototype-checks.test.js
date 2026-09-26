import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {once} from "node:events";
import {COUNTER_PROTOTYPE_CONTRACT, prototypeVerifierStatus, verifyPrototype} from "../server/sleep/prototype-checks.js";

function counter({increment = 1, reset = true, extra = "", stall = false} = {}) {
  return `<!doctype html><html><head><title>Counter fixture</title></head><body>
<main><h1>Counter</h1><output data-testid="counter-value">0</output>
<button id="increment">Increment</button>${reset ? '<button id="reset">Reset</button>' : ''}</main>
<script>let count=0;const display=document.querySelector('output');
document.querySelector('#increment').onclick=()=>{${stall ? 'while(true){}' : `count+=${increment};display.textContent=String(count);`}};
${reset ? "document.querySelector('#reset').onclick=()=>{count=0;display.textContent='0';};" : ''}
${extra}</script></body></html>`;
}
function noLeaks(result) {
  assert.equal(result.cleanup.processExited, true);
  assert.equal(result.cleanup.processGroupExited, true);
  assert.deepEqual(prototypeVerifierStatus(), {activeChecks: 0, activeBrowsers: 0});
}

test("real offline browser detects a broken counter then verifies its repaired artifact", {timeout: 20000}, async t => {
  const failedHtml = counter({increment: 2});
  const repairedHtml = counter({increment: 1});
  const before = await verifyPrototype({html: failedHtml, kind: "counter", requireReset: true});
  noLeaks(before);
  assert.equal(before.passed, false);
  assert.equal(before.observed.find(check => check.id === "increment-once").actual, "2");
  assert.equal(before.observed.find(check => check.id === "increment-twice").actual, "4");
  const after = await verifyPrototype({html: repairedHtml, kind: "counter", requireReset: true});
  noLeaks(after);
  assert.equal(after.passed, true);
  assert.deepEqual(after.observed.map(check => check.actual), ["0", "1", "2", "0"]);
  assert.notEqual(before.htmlSha256, after.htmlSha256);
  t.diagnostic(JSON.stringify({fixture: "actual offline Chrome counter check, incorrect increment of 2 repaired to 1", provider: "deterministic HTML fixtures; no model API", contract: COUNTER_PROTOTYPE_CONTRACT.version,
    before, after, leakedBrowsers: prototypeVerifierStatus().activeBrowsers,
    artifacts: {failedHtml, repairedHtml}}));
});

test("reset is required only by the trusted contract and missing controls fail", {timeout: 20000}, async () => {
  const html = counter({reset: false});
  const basic = await verifyPrototype({html, kind: "counter"}); noLeaks(basic); assert.equal(basic.passed, true);
  const withReset = await verifyPrototype({html, kind: "counter", requireReset: true}); noLeaks(withReset);
  assert.equal(withReset.passed, false);
  assert.equal(withReset.checks.find(check => check.id === "reset-control").passed, false);
  const missing = await verifyPrototype({html: "<h1>A counter proposal, without a working counter</h1>", kind: "counter"}); noLeaks(missing);
  assert.equal(missing.passed, false);
  assert.equal(missing.checks.find(check => check.id === "counter-value").passed, false);
});

test("external fetch, image, WebSocket and file requests never reach the local canary", {timeout: 15000}, async t => {
  let networkHits = 0;
  const server = http.createServer((req, res) => {networkHits++; res.end("Network access must not reach this response.");});
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  try {
    const port = server.address().port;
    const result = await verifyPrototype({kind: "counter", html: counter({extra: `
fetch('http://127.0.0.1:${port}/canary').catch(()=>{});
fetch('file:///etc/hosts').catch(()=>{});
const image=new Image();image.src='http://127.0.0.1:${port}/image';document.body.append(image);
try {new WebSocket('ws://127.0.0.1:${port}/socket');} catch {}
try {document.cookie='credential=attempt';} catch {}
`})});
    noLeaks(result);
    assert.equal(networkHits, 0);
    assert.equal(result.passed, false, "the offline contract rejects attempted external dependencies");
    assert.equal(result.checks.find(check => check.id === "self-contained").passed, false);
    assert.ok(Object.values(result.isolation).some(count => count > 0));
    t.diagnostic(JSON.stringify({fixture: "offline-network-canary", networkHits, isolation: result.isolation, cleanup: result.cleanup}));
  } finally {await new Promise(resolve => server.close(resolve));}
});

test("sandbox blocks self-navigation and later verifications start clean", {timeout: 15000}, async () => {
  const result = await verifyPrototype({kind: "counter", html: counter({extra: "location.href='data:text/html,<h1>Unexpected navigation</h1>';"}), timeoutMs: 3000});
  noLeaks(result); assert.equal(result.passed, false);
  assert.ok(result.isolation.unexpectedNavigations > 0 || result.isolation.policyViolations > 0 || result.checks.some(check => check.id === "timeout"));
  const next = await verifyPrototype({kind: "counter", html: counter()});
  noLeaks(next); assert.equal(next.passed, true);
});

test("opaque origin denies cookies and parent DOM; transport constructors are unavailable", {timeout: 10000}, async () => {
  const result = await verifyPrototype({kind: "counter", html: counter({extra: `
let escaped=false;
try {document.cookie='credential=not-allowed';escaped=true;} catch {}
try {void parent.document.body;escaped=true;} catch {}
if(typeof RTCPeerConnection!=='undefined'||typeof Worker!=='undefined'||typeof WebTransport!=='undefined')escaped=true;
if(escaped)display.textContent='isolation-failed';
`})});
  noLeaks(result); assert.equal(result.passed, true);
});

test("an animated value cannot pass while Increment and Reset buttons do nothing", {timeout: 10000}, async t => {
  const html = '<output data-testid="counter-value">0</output><button>Increment</button><button>Reset</button>' +
    '<script>let n=0;setInterval(()=>document.querySelector("output").textContent=(++n)%3,25);</script>';
  const result = await verifyPrototype({kind: "counter", requireReset: true, html});
  noLeaks(result); assert.equal(result.passed, false);
  assert.ok(result.observed.some(value => value.stable === false));
  t.diagnostic(JSON.stringify({fixture: "animated-counter-with-inert-buttons", passed: result.passed, observed: result.observed, cleanup: result.cleanup}));
});

test("static and dynamically created child documents cannot recover fresh transport globals", {timeout: 15000}, async () => {
  const embedded = await verifyPrototype({kind: "counter", html: counter() + '<iframe srcdoc="<script>new RTCPeerConnection()</script>"></iframe>'});
  noLeaks(embedded); assert.equal(embedded.passed, false);
  assert.equal(embedded.checks.find(check => check.id === "single-document").passed, false);
  const dynamic = await verifyPrototype({kind: "counter", html: counter({extra: `
let blocked=0;
try {document.body.append(document.createElement('iframe'));} catch {blocked++;}
try {document.body.insertAdjacentHTML('beforeend','<iframe></iframe>');} catch {blocked++;}
try {document.body.append(document.createElementNS('http://www.w3.org/1999/xhtml','x:iframe'));} catch {blocked++;}
try {document.implementation.createDocument('http://www.w3.org/1999/xhtml','iframe');} catch {blocked++;}
if(blocked!==4)display.textContent='fresh-frame-possible';
`})});
  noLeaks(dynamic);
  assert.equal(dynamic.observed.find(value => value.id === "initial-zero").actual, "0");
});

test("infinite renderer loop times out and the owned browser process group exits", {timeout: 10000}, async t => {
  const result = await verifyPrototype({kind: "counter", html: counter({stall: true}), timeoutMs: 1800});
  noLeaks(result);
  assert.equal(result.cleanup.browserStarted, true);
  assert.equal(result.passed, false);
  assert.ok(result.checks.some(check => check.id === "timeout" && !check.passed));
  assert.ok(result.elapsedMs < 5000);
  t.diagnostic(JSON.stringify({fixture: "infinite-renderer-loop", elapsedMs: result.elapsedMs, cleanup: result.cleanup}));
});

test("cancellation closes an active browser; pre-cancelled and invalid inputs start none", {timeout: 15000}, async () => {
  const controller = new AbortController();
  const running = verifyPrototype({kind: "counter", html: counter({stall: true}), signal: controller.signal, timeoutMs: 8000});
  const started = performance.now();
  while (prototypeVerifierStatus().activeBrowsers === 0 && performance.now() - started < 3500)
    await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(prototypeVerifierStatus().activeBrowsers, 1);
  controller.abort();
  const result = await running;
  noLeaks(result); assert.equal(result.passed, false);
  assert.ok(result.checks.some(check => check.id === "cancelled"));
  const cancelled = await verifyPrototype({kind: "counter", html: counter(), signal: AbortSignal.abort()});
  noLeaks(cancelled); assert.equal(cancelled.cleanup.browserStarted, false);
  await assert.rejects(verifyPrototype({kind: "shell", html: counter()}), /Unsupported/);
  await assert.rejects(verifyPrototype({kind: "counter", html: counter(), requireReset: "yes"}), /Unsupported/);
  await assert.rejects(verifyPrototype({kind: "counter", html: "x".repeat(100001)}), /100000/);
  await assert.rejects(verifyPrototype({kind: "counter", html: counter(), timeoutMs: 100000}), /timeout/);
  assert.deepEqual(prototypeVerifierStatus(), {activeChecks: 0, activeBrowsers: 0});
});
