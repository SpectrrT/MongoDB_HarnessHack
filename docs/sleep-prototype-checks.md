# Sleep offline counter prototype checks

`verifyPrototype` executes a generated counter page in an isolated real browser and checks its behavior. It is deliberately limited to the `counter-v1` contract. This is a concrete executable capability for Sleep, not generic project execution.

## Frozen acceptance contract

```js
await verifyPrototype({
  html,
  kind: 'counter',
  requireReset: true,
  signal,
  timeoutMs: 8000,
});
```

Only `html` comes from generated output. The caller must select `kind` and `requireReset` from an explicit user counter goal and opt-in consent. A model cannot choose its own acceptance criteria, browser executable, launch arguments, selectors, network permissions, or file access.

- Exactly one visible `[data-testid="counter-value"]` element, initially containing trimmed text `0`.
- Exactly one visible native button with accessible name exactly `Increment`.
- Click it once and require `1`; click it again and require `2`.
- When `requireReset` is true, require exactly one visible native `Reset` button, click it, and require `0`.
- Each value update has a 350 ms render allowance. All behavior checks share the overall timeout.
- No attempted external resource dependencies or forbidden navigation. Cleanup must confirm the owned browser process group exited.

The default verification deadline is 8 seconds; caller values are restricted to 100 ms through 15 seconds. HTML is capped at 100,000 UTF-8 bytes. Invalid inputs throw before a browser starts. Runtime failures, timeouts and cancellations return `passed: false` with structured check details. The result includes observed values, browser version, exact HTML SHA-256, elapsed time, policy diagnostics and cleanup evidence.

## Actual browser evidence

Seven focused test groups passed using Chrome `153.0.8010.53` on macOS. These are deterministic HTML fixtures and a deterministic repair, not paid model generation. Both artifacts below were actually rendered and clicked. No provider token or cost saving is claimed.

| Measurement | Broken artifact | Repaired artifact |
| --- | ---: | ---: |
| Initial, first click, second click, reset | `0, 2, 4, 0` | `0, 1, 2, 0` |
| Required behavior checks passed | 2 of 4 | 4 of 4 |
| All controls, behavior, isolation and cleanup checks passed | 7 of 9 | 9 of 9 |
| Overall accepted | No | Yes |
| HTML bytes | 490 | 490 |
| Observed verification time | 1650 ms | 775 ms |
| Browser process groups left running | 0 | 0 |

These are single-run timing observations, not a latency benchmark. The broken artifact adds 2 per click. The repaired artifact adds 1. There is no substituted result or scripted browser response.

Additional real-browser checks verified that missing controls fail, reset is optional only when the trusted contract permits it, and a fresh run succeeds after a forbidden data-URL navigation. A local HTTP canary received **0 requests** during attempted fetch, image and WebSocket connections. The same case attempted `file:` access and recorded 10 CSP diagnostics across the parent and child policies; this count is diagnostics, not unique requests. An infinite click-handler loop was stopped in **1820 ms** under a 1,800 ms deadline, including owned process-group cleanup. Active cancellation, pre-cancellation, opaque-origin cookie/parent-DOM denial, and unavailable WebRTC/worker transports passed. No renderer process group remained after any test.

## Isolation and cleanup

Every verification launches a fresh, headless browser with Chromium sandboxing enabled and a temporary profile. The browser receives a minimal environment containing no inherited provider credentials. No existing profile, cookies, storage state, host-file contents, browser permissions, downloads, or model-selected executable path is supplied.

The context is offline. All routed requests are aborted, WebSocket routes are closed, service workers are blocked, and generated HTML runs inside an opaque-origin `sandbox="allow-scripts"` iframe with sensitive permissions denied. Trusted CSP is applied to both parent and child. The parent policy is essential: child-only CSP would allow a frame to replace itself with a data-URL document. The trusted bootstrap disables WebRTC, WebTransport and worker constructors before generated inline scripts; it is also inserted directly before source HTML because cross-process srcdoc frames may not receive the Playwright init script first.

Cancellation and timeouts kill the owned browser process group through Playwright, including a renderer stuck in JavaScript. Cleanup waits for process and process-group exit. It never passes generated text to a shell. Browser startup has its own bounded deadline; cancellation during startup waits for that launch to settle and then cleans it up. Cleanup may add up to approximately 3 seconds beyond the behavior deadline.

`SLEEP_PROTOTYPE_BROWSER=chromium` selects installed Playwright Chromium for CI. The default is installed Chrome. Only these two fixed channels are used. The runtime requires Playwright and its selected browser; unavailable browsers fail verification rather than fabricating a pass. In CI, install the browser before `npm test`.

This is defense in depth for a deliberately narrow local prototype test. It is not an OS-level isolation guarantee against browser vulnerabilities, a security proof, or a verifier for arbitrary applications. The tests cover macOS Chrome here; other platforms need their own execution evidence. The node test canary is a newly created loopback server containing no user data.

Reproduce: `node --test tests/prototype-checks.test.js`.

## Exact tested artifacts

Broken SHA-256: `cbee82c94b69ab031977ad13d3ef549bbca537e5f215c1334605c966f09246a8`.

```html
<!doctype html><html><head><title>Counter fixture</title></head><body>
<main><h1>Counter</h1><output data-testid="counter-value">0</output>
<button id="increment">Increment</button><button id="reset">Reset</button></main>
<script>let count=0;const display=document.querySelector('output');
document.querySelector('#increment').onclick=()=>{count+=2;display.textContent=String(count);};
document.querySelector('#reset').onclick=()=>{count=0;display.textContent='0';};
</script></body></html>
```

Repaired SHA-256: `4d0f387c43bf1ace72a6e3468d618c0d33ff5255ee253b9596ced81734047444`.

```html
<!doctype html><html><head><title>Counter fixture</title></head><body>
<main><h1>Counter</h1><output data-testid="counter-value">0</output>
<button id="increment">Increment</button><button id="reset">Reset</button></main>
<script>let count=0;const display=document.querySelector('output');
document.querySelector('#increment').onclick=()=>{count+=1;display.textContent=String(count);};
document.querySelector('#reset').onclick=()=>{count=0;display.textContent='0';};
</script></body></html>
```

## Raw browser reports

```json
{
  "fixture": "actual offline Chrome counter check, incorrect increment of 2 repaired to 1",
  "provider": "deterministic HTML fixtures; no model API",
  "contract": "counter-v1",
  "before": {
    "kind": "counter",
    "contractVersion": "counter-v1",
    "requireReset": true,
    "browserVersion": "153.0.8010.53",
    "passed": false,
    "checks": [
      {
        "id": "counter-value",
        "passed": true,
        "detail": "One visible counter value."
      },
      {
        "id": "increment-control",
        "passed": true,
        "detail": "One visible native button with the required accessible name."
      },
      {
        "id": "reset-control",
        "passed": true,
        "detail": "One visible native button with the required accessible name."
      },
      {
        "id": "initial-zero",
        "passed": true,
        "detail": "Expected 0; observed 0."
      },
      {
        "id": "increment-once",
        "passed": false,
        "detail": "Expected 1; observed 2."
      },
      {
        "id": "increment-twice",
        "passed": false,
        "detail": "Expected 2; observed 4."
      },
      {
        "id": "reset-zero",
        "passed": true,
        "detail": "Expected 0; observed 0."
      },
      {
        "id": "self-contained",
        "passed": true,
        "detail": "No external resource or forbidden navigation attempts observed."
      },
      {
        "id": "browser-cleanup",
        "passed": true,
        "detail": "Owned browser process group exited."
      }
    ],
    "observed": [
      {
        "id": "initial-zero",
        "expected": "0",
        "actual": "0"
      },
      {
        "id": "increment-once",
        "expected": "1",
        "actual": "2"
      },
      {
        "id": "increment-twice",
        "expected": "2",
        "actual": "4"
      },
      {
        "id": "reset-zero",
        "expected": "0",
        "actual": "0"
      }
    ],
    "isolation": {
      "blockedRequests": 0,
      "blockedWebSockets": 0,
      "policyViolations": 0,
      "unexpectedNavigations": 0,
      "unexpectedPages": 0
    },
    "cleanup": {
      "browserStarted": true,
      "processExited": true,
      "processGroupExited": true
    },
    "elapsedMs": 1650,
    "htmlSha256": "cbee82c94b69ab031977ad13d3ef549bbca537e5f215c1334605c966f09246a8",
    "htmlBytes": 490
  },
  "after": {
    "kind": "counter",
    "contractVersion": "counter-v1",
    "requireReset": true,
    "browserVersion": "153.0.8010.53",
    "passed": true,
    "checks": [
      {
        "id": "counter-value",
        "passed": true,
        "detail": "One visible counter value."
      },
      {
        "id": "increment-control",
        "passed": true,
        "detail": "One visible native button with the required accessible name."
      },
      {
        "id": "reset-control",
        "passed": true,
        "detail": "One visible native button with the required accessible name."
      },
      {
        "id": "initial-zero",
        "passed": true,
        "detail": "Expected 0; observed 0."
      },
      {
        "id": "increment-once",
        "passed": true,
        "detail": "Expected 1; observed 1."
      },
      {
        "id": "increment-twice",
        "passed": true,
        "detail": "Expected 2; observed 2."
      },
      {
        "id": "reset-zero",
        "passed": true,
        "detail": "Expected 0; observed 0."
      },
      {
        "id": "self-contained",
        "passed": true,
        "detail": "No external resource or forbidden navigation attempts observed."
      },
      {
        "id": "browser-cleanup",
        "passed": true,
        "detail": "Owned browser process group exited."
      }
    ],
    "observed": [
      {
        "id": "initial-zero",
        "expected": "0",
        "actual": "0"
      },
      {
        "id": "increment-once",
        "expected": "1",
        "actual": "1"
      },
      {
        "id": "increment-twice",
        "expected": "2",
        "actual": "2"
      },
      {
        "id": "reset-zero",
        "expected": "0",
        "actual": "0"
      }
    ],
    "isolation": {
      "blockedRequests": 0,
      "blockedWebSockets": 0,
      "policyViolations": 0,
      "unexpectedNavigations": 0,
      "unexpectedPages": 0
    },
    "cleanup": {
      "browserStarted": true,
      "processExited": true,
      "processGroupExited": true
    },
    "elapsedMs": 775,
    "htmlSha256": "4d0f387c43bf1ace72a6e3468d618c0d33ff5255ee253b9596ced81734047444",
    "htmlBytes": 490
  },
  "leakedBrowsers": 0
}
```
