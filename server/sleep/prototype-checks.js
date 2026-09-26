// A narrow behavior check, not a general-purpose code runner or a security boundary proof.
import {chromium} from "@playwright/test";
import {createHash} from "node:crypto";

export const COUNTER_PROTOTYPE_CONTRACT = Object.freeze({
  version: "counter-v1",
  kind: "counter",
  valueSelector: '[data-testid="counter-value"]',
  incrementButton: "Increment",
  resetButton: "Reset",
  initialValue: "0",
  incrementValues: Object.freeze(["1", "2"]),
  resetValue: "0",
  stableValueMs: 100,
  maxHtmlBytes: 100000,
  defaultTimeoutMs: 8000,
  maxTimeoutMs: 15000,
});

const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; " +
  "connect-src 'none'; font-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; " +
  "worker-src 'none'; base-uri 'none'; form-action 'none'; require-trusted-types-for 'script'; trusted-types 'none'";
const PERMISSIONS = "camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'; " +
  "display-capture 'none'; usb 'none'; serial 'none'; hid 'none'; payment 'none'; fullscreen 'none'";
const activeBrowsers = new Set();
let activeChecks = 0;
export const prototypeVerifierStatus = () => ({activeChecks, activeBrowsers: activeBrowsers.size});
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitAtMost(operation, milliseconds) {
  let timer;
  try {return await Promise.race([operation, new Promise(resolve => {timer = setTimeout(resolve, milliseconds);})]);}
  finally {clearTimeout(timer);}
}
const escapeAttribute = text => text.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const hash = text => createHash("sha256").update(text).digest("hex");

class VerificationStop extends Error {
  constructor(code) {super(code); this.code = code;}
}
function processAlive(pid) {
  if (!pid) return false;
  try {process.kill(process.platform === "win32" ? pid : -pid, 0); return true;}
  catch (error) {if (error.code === "ESRCH") return false; throw error;}
}
function disableTransports() {
  if (globalThis.__sleepPrototypeLocked) return;
  Object.defineProperty(globalThis, "__sleepPrototypeLocked", {value: true, configurable: false, writable: false});
  for (const name of ["RTCPeerConnection", "webkitRTCPeerConnection", "WebTransport", "Worker", "SharedWorker"])
    Object.defineProperty(globalThis, name, {value: undefined, configurable: false, writable: false});
  // No nested document may obtain a fresh set of transport constructors. Trusted Types also
  // blocks string-based HTML/script sinks; static embedded documents are rejected before render.
  const blocked = new Set(["iframe", "frame", "object", "embed", "portal"]);
  const isBlocked = name => blocked.has(String(name).split(":").at(-1).toLowerCase());
  for (const [method, nameIndex] of [["createElement", 0], ["createElementNS", 1]]) {
    const original = Document.prototype[method];
    Object.defineProperty(Document.prototype, method, {configurable: false, writable: false, value: function (...args) {
      if (isBlocked(args[nameIndex])) throw new DOMException("Nested documents are unavailable.", "NotSupportedError");
      return Reflect.apply(original, this, args);
    }});
  }
  const createDocument = DOMImplementation.prototype.createDocument;
  Object.defineProperty(DOMImplementation.prototype, "createDocument", {configurable: false, writable: false, value: function (...args) {
    if (isBlocked(args[1])) throw new DOMException("Nested documents are unavailable.", "NotSupportedError");
    return Reflect.apply(createDocument, this, args);
  }});
}

// Browser choice, launch flags, selectors and behavior are trusted constants. Callers must choose
// this contract from an explicit counter goal and consent before supplying model-authored HTML.
export async function verifyPrototype({html, kind, requireReset = false, signal,
  timeoutMs = COUNTER_PROTOTYPE_CONTRACT.defaultTimeoutMs} = {}) {
  if (kind !== "counter" || typeof requireReset !== "boolean") throw new TypeError("Unsupported prototype contract.");
  if (typeof html !== "string" || !html.trim() || Buffer.byteLength(html) > COUNTER_PROTOTYPE_CONTRACT.maxHtmlBytes)
    throw new TypeError("Prototype HTML must contain 1 to 100000 UTF-8 bytes.");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > COUNTER_PROTOTYPE_CONTRACT.maxTimeoutMs)
    throw new TypeError("Prototype timeout must be 100 to 15000 milliseconds.");
  if (signal && (typeof signal.addEventListener !== "function" || typeof signal.aborted !== "boolean"))
    throw new TypeError("Invalid cancellation signal.");

  const started = performance.now(), deadline = started + timeoutMs;
  const checks = [], observed = [];
  const isolation = {blockedRequests: 0, blockedWebSockets: 0, policyViolations: 0, unexpectedNavigations: 0, unexpectedPages: 0};
  let server, browser, browserVersion = null, launchPromise, timer, stopped, interrupt;
  const interrupted = new Promise((_, reject) => {interrupt = reject;});
  interrupted.catch(() => {});
  const stop = code => {if (!stopped) {stopped = code; interrupt(new VerificationStop(code));}};
  const cancel = () => stop("cancelled");
  const remaining = () => Math.max(1, Math.ceil(deadline - performance.now()));
  const bounded = operation => Promise.race([operation, interrupted]);
  const check = (id, passed, detail) => {checks.push({id, passed, detail}); return passed;};
  const cleanup = {browserStarted: false, processExited: true, processGroupExited: true};
  activeChecks++;
  signal?.addEventListener("abort", cancel, {once: true});
  if (signal?.aborted) cancel();
  timer = setTimeout(() => stop("timeout"), timeoutMs);

  try {
    if (stopped) throw new VerificationStop(stopped);
    // Playwright owns a new temporary profile. No inherited environment credentials, extensions,
    // saved browser profile, executable path, storage state or page-selected launch options.
    const channel = process.env.SLEEP_PROTOTYPE_BROWSER === "chromium" ? "chromium" : "chrome";
    launchPromise = chromium.launchServer({headless: true, channel, chromiumSandbox: true,
      timeout: Math.min(3000, remaining()), host: "127.0.0.1",
      env: {PATH: "/usr/bin:/bin:/usr/sbin:/sbin", LANG: "en_US.UTF-8", TZ: "UTC"},
      args: ["--disable-background-networking", "--disable-sync", "--no-first-run", "--force-webrtc-ip-handling-policy=disable_non_proxied_udp"],
    }).then(value => {
      server = value;
      cleanup.browserStarted = true;
      cleanup.processExited = false;
      cleanup.processGroupExited = false;
      activeBrowsers.add(server.process().pid);
      return value;
    });
    await bounded(launchPromise);
    browser = await bounded(chromium.connect(server.wsEndpoint(), {timeout: remaining()}));
    browserVersion = browser.version();
    const context = await bounded(browser.newContext({offline: true, serviceWorkers: "block", acceptDownloads: false,
      permissions: [], bypassCSP: false, viewport: {width: 800, height: 600}}));
    await bounded(context.route("**/*", async route => {
      isolation.blockedRequests++;
      if (route.request().isNavigationRequest()) isolation.unexpectedNavigations++;
      await route.abort("blockedbyclient").catch(() => {});
    }));
    await bounded(context.routeWebSocket("**/*", socket => {
      isolation.blockedWebSockets++;
      socket.close({code: 1008, reason: "Offline prototype verifier"});
    }));
    await bounded(context.addInitScript(disableTransports));
    const page = await bounded(context.newPage());
    page.setDefaultTimeout(Math.min(1000, remaining()));
    page.setDefaultNavigationTimeout(Math.min(1000, remaining()));
    context.on("page", popup => {
      if (popup !== page) {isolation.unexpectedPages++; void popup.close().catch(() => {});}
    });
    page.on("dialog", dialog => {void dialog.dismiss().catch(() => {});});
    page.on("console", message => {
      if (/content security policy|violates the following.*policy|refused to (?:connect|load|frame|send)/i.test(message.text()))
        isolation.policyViolations++;
    });
    page.on("framenavigated", frame => {
      if (!["about:blank", "about:srcdoc"].includes(frame.url())) {
        isolation.unexpectedNavigations++;
        stop("navigation-blocked");
      }
    });
    const embedded = await bounded(page.evaluate(source => {
      const inert = document.createElement("template");
      inert.innerHTML = source;
      return Boolean(inert.content.querySelector("iframe,frame,object,embed,portal,template"));
    }, html));
    if (!check("single-document", !embedded, embedded ? "Embedded documents and templates are outside the counter contract." : "No embedded document or template markup."))
      throw new VerificationStop("unsupported-markup");
    // The browser enforces sandbox flags from the trusted parent iframe. Generated markup cannot
    // grant itself same-origin, popups, forms, downloads, modals or top-navigation permission.
    // Also bootstrap the srcdoc directly: an isolated cross-process iframe may not receive
    // Playwright's context init script before its first parser-executed inline script.
    const document = `<meta http-equiv="Content-Security-Policy" content="${CSP}">` +
      `<script>(${disableTransports.toString()})();</script>${html}`;
    // The parent's frame policy also governs self-navigation by the child. A policy only inside
    // srcdoc would not stop that child replacing itself with a data-URL document.
    const wrapper = `<meta http-equiv="Content-Security-Policy" content="${CSP}">` +
      `<iframe title="Counter prototype" sandbox="allow-scripts" allow="${PERMISSIONS}" ` +
      `style="width:780px;height:560px;border:0" srcdoc="${escapeAttribute(document)}"></iframe>`;
    await bounded(page.setContent(wrapper, {waitUntil: "load", timeout: remaining()}));
    const frame = page.frameLocator('iframe[title="Counter prototype"]');
    const value = frame.locator(COUNTER_PROTOTYPE_CONTRACT.valueSelector);
    const increment = frame.getByRole("button", {name: "Increment", exact: true});
    const reset = frame.getByRole("button", {name: "Reset", exact: true});
    const control = async (locator, id) => {
      const count = await bounded(locator.count());
      const present = count === 1 && await bounded(locator.isVisible()) &&
        await bounded(locator.evaluate(element => element.tagName === "BUTTON"));
      return check(id, present, present ? "One visible native button with the required accessible name." : "Expected one visible native button with the required accessible name.");
    };
    const valueCount = await bounded(value.count());
    const valuePresent = valueCount === 1 && await bounded(value.isVisible());
    check("counter-value", valuePresent, valuePresent ? "One visible counter value." : "Expected one visible [data-testid=counter-value] element.");
    const incrementPresent = await control(increment, "increment-control");
    const resetPresent = !requireReset || await control(reset, "reset-control");
    if (valuePresent && incrementPresent && resetPresent) {
      const expectValue = async (id, expected) => {
        // Allow a short render frame without waiting indefinitely for a broken implementation.
        const until = Math.min(deadline, performance.now() + 350);
        let actual, stableSince = null, stable = false;
        do {
          actual = String(await bounded(value.textContent({timeout: remaining()}))).trim();
          if (actual === expected) {
            stableSince ??= performance.now();
            if (performance.now() - stableSince >= COUNTER_PROTOTYPE_CONTRACT.stableValueMs) {stable = true; break;}
          } else stableSince = null;
          await bounded(delay(20));
        } while (performance.now() < until);
        observed.push({id, expected, actual: actual.slice(0, 80), stable});
        return check(id, stable, `Expected stable ${expected}; observed ${actual.slice(0, 80)}${stable ? "." : " without a stable matching interval."}`);
      };
      await expectValue("initial-zero", "0");
      await bounded(increment.click({timeout: remaining()}));
      await expectValue("increment-once", "1");
      await bounded(increment.click({timeout: remaining()}));
      await expectValue("increment-twice", "2");
      if (requireReset) {
        await bounded(reset.click({timeout: remaining()}));
        await expectValue("reset-zero", "0");
      }
    }
    // Flush immediate resource-policy violations before reporting the self-contained check.
    await bounded(delay(30));
    const attempts = Object.values(isolation).reduce((total, value) => total + value, 0);
    check("self-contained", attempts === 0, attempts ? "External resources or forbidden navigation were attempted and blocked." : "No external resource or forbidden navigation attempts observed.");
  } catch (error) {
    const code = stopped || (error instanceof VerificationStop ? error.code : error.name === "TimeoutError" ? "timeout" : "browser-check-failed");
    check(code, false, code === "cancelled" ? "Verification cancelled." : code === "timeout" ? "Verification exceeded its bounded time limit." : "Prototype could not complete the fixed browser checks.");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
    // A cancellation can happen during launch. Wait for that bounded launch to settle, then
    // kill the owned process group, including a renderer stuck in an infinite JavaScript loop.
    await launchPromise?.catch(() => {});
    if (server) {
      const process = server.process(), pid = process.pid;
      await waitAtMost(server.kill().catch(() => {}), 2000);
      const until = performance.now() + 1000;
      while (processAlive(pid) && performance.now() < until) await delay(20);
      cleanup.processExited = process.exitCode !== null || process.signalCode !== null;
      cleanup.processGroupExited = !processAlive(pid);
      if (cleanup.processGroupExited) activeBrowsers.delete(pid);
    }
    activeChecks--;
    check("browser-cleanup", cleanup.processExited && cleanup.processGroupExited,
      cleanup.processGroupExited ? "Owned browser process group exited." : "Owned browser process group did not exit within the cleanup bound.");
  }
  return {kind, contractVersion: COUNTER_PROTOTYPE_CONTRACT.version, requireReset, browserVersion,
    passed: checks.length > 1 && checks.every(result => result.passed), checks, observed, isolation, cleanup,
    elapsedMs: Math.round(performance.now() - started), htmlSha256: hash(html), htmlBytes: Buffer.byteLength(html)};
}
