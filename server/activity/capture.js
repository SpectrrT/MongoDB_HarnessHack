// macOS sampling with built-in tools. `lsappinfo` (frontmost app) and `ioreg` (idle time) need no
// permissions. Window titles use System Events, which needs Accessibility access, and browser pages
// use AppleScript, which needs Automation access. macOS asks once; if the answer is no, we keep
// recording app names only and retry a minute later. Nothing here reads screen contents or keys.
import { execFile } from 'node:child_process';
import { ACTIVE_SECONDS, IDLE_SECONDS } from './store.js';

const run = (cmd, args, timeout = 2500) =>
  new Promise((resolve) => {
    execFile(cmd, args, { timeout, maxBuffer: 1 << 20 }, (error, stdout) => resolve(error ? null : String(stdout).trim()));
  });

const retryAt = new Map();
const blocked = (key) => (retryAt.get(key) || 0) > Date.now();
const block = (key, ms = 60000) => retryAt.set(key, Date.now() + ms);

export async function frontmostApp() {
  const asn = await run('lsappinfo', ['front']);
  if (!asn) return null;
  const info = await run('lsappinfo', ['info', '-only', 'name', '-only', 'bundleid', asn]);
  const app = /"LSDisplayName"="([^"]*)"/.exec(info || '')?.[1];
  const bundleId = /"CFBundleIdentifier"="([^"]*)"/.exec(info || '')?.[1] || null;
  return app ? { app, bundleId } : null;
}

export async function idleSeconds() {
  const out = await run('ioreg', ['-c', 'IOHIDSystem', '-d', '4', '-k', 'HIDIdleTime']);
  const ns = /"HIDIdleTime" = (\d+)/.exec(out || '')?.[1];
  return ns ? Math.floor(Number(ns) / 1e9) : 0;
}

const TITLE_SCRIPT =
  'tell application "System Events" to tell (first application process whose frontmost is true) to ' +
  'if (count of windows) > 0 then get name of front window';

export async function windowTitle() {
  if (blocked('title')) return null;
  const out = await run('osascript', ['-e', TITLE_SCRIPT]);
  if (out === null) {
    block('title');
    return null;
  }
  return out && out !== 'missing value' ? out : null;
}

const chromium = (name) =>
  `tell application "${name}" to if (count of windows) > 0 then return ` +
  '(URL of active tab of front window) & linefeed & (title of active tab of front window)';
const BROWSER_SCRIPTS = {
  'Google Chrome': chromium('Google Chrome'),
  Arc: chromium('Arc'),
  'Microsoft Edge': chromium('Microsoft Edge'),
  'Brave Browser': chromium('Brave Browser'),
  Chromium: chromium('Chromium'),
  Safari:
    'tell application "Safari" to if (count of documents) > 0 then return ' +
    '(URL of front document) & linefeed & (name of front document)',
};

// Only asked while that browser is frontmost, so AppleScript never launches a browser.
export async function browserTab(app) {
  const script = BROWSER_SCRIPTS[app];
  if (!script || blocked(`browser:${app}`)) return null;
  const out = await run('osascript', ['-e', script]);
  if (out === null) {
    block(`browser:${app}`);
    return null;
  }
  const [url, ...title] = out.split('\n');
  return { url: url || null, title: title.join(' ').trim() || null };
}

export async function sample({ titles = true, urls = true, excludedApps = [] } = {}) {
  const front = await frontmostApp();
  if (!front) return null;
  const s = { ts: new Date().toISOString(), ...front, title: null, url: null, idle: false, source: 'collector' };
  // Seconds since any keyboard or mouse input: "hands-on" versus reading. Which keys were pressed is never read.
  const quiet = await idleSeconds();
  if (quiet >= IDLE_SECONDS) return { ...s, idle: true, active: false };
  s.active = quiet < ACTIVE_SECONDS;
  if (excludedApps.some((a) => a.toLowerCase() === front.app.toLowerCase())) return s;
  if (titles || urls) {
    const tab = await browserTab(front.app);
    if (tab) {
      if (urls) s.url = tab.url;
      if (titles) s.title = tab.title;
    }
  }
  if (titles && !s.title) s.title = await windowTitle();
  return s;
}
