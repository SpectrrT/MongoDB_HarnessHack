import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, ChevronLeft, ChevronRight, Pause, Play, Search, X, Code2, Terminal, Globe, Monitor, Lock, Coffee } from "lucide-react";
import { ConnectionLogo } from "../components/ConnectionLogo";
import { Link } from "react-router-dom";
import { Modal } from "../components/Modal";
import "../history.css";

// Computer history, built September 26. A window onto the activity engine: the collector samples the
// front app, window title and browser page into Atlas, an aggregation folds samples into sessions,
// Atlas hybrid search finds them and a routines aggregation spots repeated work. Search and the
// hand-off asks lead; the day timeline supports them. Every number here comes from /api/activity/*.

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
// The collector saves every 15 seconds, so a running one is never quiet for this long.
const RECENT_MS = 3 * 60e3;
const EMPTY = [];

async function api(url, body) {
  let response;
  try {
    response = await fetch(
      url,
      body === undefined
        ? undefined
        : { method: "POST", headers: { "Content-Type": "application/json", "X-Offload-Client": "local" }, body: JSON.stringify(body) },
    );
  } catch {
    throw Error("Offload's local API isn't answering.");
  }
  if (!response.headers.get("content-type")?.includes("application/json")) throw Error("Computer history needs the local Offload service. Open the local app to view activity from this computer.");
  const value = await response.json().catch(() => null);
  if (!response.ok || !value) throw Error(value?.error || `The activity API answered HTTP ${response.status}.`);
  return value;
}

// ---- Time and names ----

const pad = (n) => String(n).padStart(2, "0");
const dayOf = (value = Date.now()) => {
  const d = new Date(value);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const parseDay = (day) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
};
const shiftDay = (day, n) => {
  const d = parseDay(day);
  d.setDate(d.getDate() + n);
  return dayOf(d);
};
const clock = (value) => new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const hourLabel = (value) => new Date(value).toLocaleTimeString([], { hour: "numeric" });
const shortDate = (value) =>
  new Date(value).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
const longDate = (day) =>
  parseDay(day).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" });
const RANGE = new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" });
function span(start, end) {
  try {
    return RANGE.formatRange(new Date(start), new Date(end));
  } catch {
    return `${clock(start)} – ${clock(end)}`;
  }
}
function duration(seconds) {
  const s = Math.max(0, Math.round(seconds || 0));
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), rest = m % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}
const plural = (n, word) => `${Number(n || 0).toLocaleString()} ${word}${n === 1 ? "" : "s"}`;
function dayTitle(day, today) {
  if (day === today) return "Today";
  if (day === shiftDay(today, -1)) return "Yesterday";
  return parseDay(day).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

// Display names for a few well-known sites and apps. Everything else shows as recorded.
const KNOWN = {
  "mail.google.com": "Gmail",
  "docs.google.com": "Google Docs",
  "drive.google.com": "Google Drive",
  "calendar.google.com": "Google Calendar",
  "meet.google.com": "Google Meet",
  "app.slack.com": "Slack",
  "github.com": "GitHub",
  "linear.app": "Linear",
  "notion.so": "Notion",
  "figma.com": "Figma",
  "zoom.us": "Zoom",
  Code: "VS Code",
  "cloud.mongodb.com": "MongoDB Atlas",
  "mongodb.com": "MongoDB Docs",
  "www.mongodb.com": "MongoDB Docs",
};
const nameOf = (label) => KNOWN[label] || label || "Unknown";
function AppIcon({ name, size = 18 }) {
  const label = nameOf(name);
  const service = ({ GitHub: 'github', 'MongoDB Atlas': 'mongodb', 'MongoDB Docs': 'mongodb', Gmail: 'gmail', 'Google Docs': 'drive', 'Google Drive': 'drive', 'Google Calendar': 'calendar', Slack: 'slack', Notion: 'notion', Figma: 'figma', Linear: 'linear' })[label];
  const Icon = label === 'VS Code' ? Code2 : /Terminal|iTerm/.test(label) ? Terminal : label === 'Private' ? Lock : label === 'Away' ? Coffee : /Chrome|Safari|Firefox|\.com$/.test(label) ? Globe : Monitor;
  return <span className="hx-app-icon" aria-hidden="true">{service ? <ConnectionLogo id={service} size={size} /> : <Icon size={size} strokeWidth={1.6} />}</span>;
}
const sessionName = (s) => (s.idle ? "Away" : s.private ? "Private" : nameOf(s.label || s.app));
const sessionDetail = (s) => (s.idle || s.private ? "" : s.title || "");
const chainText = (steps, joiner = " → ") => (steps || []).map(nameOf).join(joiner);

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function weekdayPattern(list) {
  const days = [...new Set(list || [])].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b);
  const workdays = days.every((d) => d <= 5);
  if (days.length === 7) return "every day";
  if (workdays && days.length === 5) return "every weekday";
  if (workdays && days.length >= 3) return "most weekdays";
  if (days.length === 2 && days[0] === 6) return "on weekends";
  return days.length ? `on ${days.map((d) => WEEKDAYS[d - 1]).join(", ")}` : "";
}
function describeRoutine(r) {
  const hour = Number.isFinite(r.typicalHour)
    ? `around ${hourLabel(new Date(2000, 0, 1, ((Math.round(r.typicalHour) % 24) + 24) % 24))}`
    : "";
  const text = [
    [weekdayPattern(r.weekdays), hour, r.timeZone].filter(Boolean).join(" "),
    r.minutes ? `about ${duration(r.minutes * 60)}` : "",
    r.count > r.dayCount ? `seen ${r.count} times on ${r.dayCount} days` : `seen on ${plural(r.dayCount, "day")}`,
  ]
    .filter(Boolean)
    .join(" · ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// ---- Timeline layout: shared by the bar, its legend and the session list ----

function layout(sessions) {
  const items = [];
  for (const s of sessions) {
    const a = Date.parse(s.start), b = Date.parse(s.end);
    if (Number.isFinite(a)) items.push({ s, a, b: Number.isFinite(b) && b > a ? b : a + 1000 });
  }
  if (!items.length) return null;
  const key = (s) => s.label || s.app;
  const totals = new Map();
  for (const { s } of items) if (!s.idle && !s.private) totals.set(key(s), (totals.get(key(s)) || 0) + (s.durationSec || 0));
  // Three shades are all a monochrome palette can keep apart; the rest folds into Other.
  const ranked = [...totals].sort((p, q) => q[1] - p[1]);
  const top = ranked.slice(0, 3).map(([k]) => k);
  const sums = { private: 0, away: 0 };
  for (const x of items) {
    const rank = top.indexOf(key(x.s));
    x.cat = x.s.idle ? "away" : x.s.private ? "private" : rank >= 0 ? `s${rank + 1}` : "other";
    if (x.cat in sums) sums[x.cat] += x.s.durationSec || 0;
  }
  const start = new Date(Math.min(...items.map((x) => x.a)));
  start.setMinutes(0, 0, 0);
  const end = new Date(Math.max(...items.map((x) => x.b)));
  if (end.getMinutes() || end.getSeconds() || end.getMilliseconds()) end.setMinutes(60, 0, 0);
  if (end - start < 3600e3) end.setTime(+start + 3600e3);
  const hours = (end - start) / 3600e3;
  const step = hours <= 6 ? 1 : hours <= 12 ? 2 : hours <= 18 ? 3 : 4;
  const ticks = [];
  for (const t = new Date(start); t <= end; t.setHours(t.getHours() + step)) ticks.push(+t);
  const legend = top.map((k, i) => ({ cat: `s${i + 1}`, name: nameOf(k), seconds: totals.get(k) }));
  if (ranked.length > 3)
    legend.push({ cat: "other", name: `Other (${ranked.length - 3})`, seconds: ranked.slice(3).reduce((n, [, v]) => n + v, 0) });
  if (items.some((x) => x.cat === "private")) legend.push({ cat: "private", name: "Private", seconds: sums.private });
  if (items.some((x) => x.cat === "away")) legend.push({ cat: "away", name: "Away", seconds: sums.away });
  legend.push({ cat: "none", name: "Not recorded" });
  return { from: +start, to: +end, items, ticks, legend };
}

// Time by app, with apps whose every session was private shown as "Private" rather than by name.
function appRows(byApp, sessions) {
  const hidden = new Map();
  for (const s of sessions) if (!s.idle) hidden.set(s.app, (hidden.get(s.app) ?? true) && !!s.private);
  const rows = new Map();
  for (const a of byApp || []) {
    const name = hidden.get(a.app) ? "Private" : nameOf(a.app);
    const row = rows.get(name) || { name, seconds: 0 };
    row.seconds += a.seconds || 0;
    rows.set(name, row);
  }
  return [...rows.values()].sort((p, q) => q.seconds - p.seconds);
}

// Scroll only the nearest scrolling ancestor. scrollIntoView would also shift the workspace's
// overflow-hidden frame and push the app header out of view.
function scrollToTop(el) {
  if (!el) return;
  const behavior = matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  for (let box = el.parentElement; box && box !== document.body; box = box.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(box).overflowY) && box.scrollHeight > box.clientHeight) {
      const top = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 16;
      return box.scrollTo({ top, behavior });
    }
  }
  scrollTo({ top: el.getBoundingClientRect().top + scrollY - 16, behavior });
}

const Tag = ({ children = "Demo history" }) => <span className="hx-tag">{children}</span>;
const STATE_LABEL = {
  checking: "Checking…",
  off: "Not connected",
  paused: "Paused",
  recording: "Recording",
  idle: "Collector off",
};

export default function History() {
  const [now, setNow] = useState(() => Date.now());
  const today = dayOf(now);
  const [status, setStatus] = useState(null);
  const [settings, setSettings] = useState(null);
  const [settingsError, setSettingsError] = useState("");
  const [routines, setRoutines] = useState(null);
  const [routineError, setRoutineError] = useState("");
  const [routineBusy, setRoutineBusy] = useState("");
  const [routineNote, setRoutineNote] = useState("");
  const [day, setDay] = useState(() => dayOf());
  const [landed, setLanded] = useState(null);
  const [data, setData] = useState(null);
  const [dayError, setDayError] = useState("");
  const [focus, setFocus] = useState(null);
  const [live, setLive] = useState("off");
  const [liveNote, setLiveNote] = useState("");
  const [pauseBusy, setPauseBusy] = useState(false);
  const [headerError, setHeaderError] = useState("");
  const [forgetNote, setForgetNote] = useState("");
  const [searchKey, setSearchKey] = useState(0);
  const dayRef = useRef(day), daySeq = useRef(0), placed = useRef(false), configuredRef = useRef(false);
  const daySection = useRef(null), routinesHeading = useRef(null);
  const configured = !!status?.configured;
  useEffect(() => {
    dayRef.current = day;
  }, [day]);
  useEffect(() => {
    configuredRef.current = configured;
  }, [configured]);

  const loadStatus = useCallback(async ({ quiet = false } = {}) => {
    try {
      const value = await api("/api/activity/status");
      if (value.configured && !placed.current) {
        // Open on the latest day with history when nothing has been recorded today yet.
        placed.current = true;
        const latest = Math.max(0, ...(value.devices || []).map((d) => Date.parse(d.lastSeen) || 0));
        if (latest && dayOf(latest) < dayOf()) {
          setDay(dayOf(latest));
          setLanded(dayOf(latest));
        }
      }
      setStatus({ ...value, fetchedAt: Date.now() });
      return value;
    } catch (error) {
      if (!quiet) setStatus({ configured: false, error: error.message });
      return null;
    }
  }, []);
  const loadSettings = useCallback(async () => {
    try {
      setSettings(await api("/api/activity/settings"));
      setSettingsError("");
    } catch (error) {
      setSettingsError(error.message);
    }
  }, []);
  const loadRoutines = useCallback(async () => {
    try {
      const value = await api("/api/activity/routines");
      setRoutines(value.routines || []);
      setRoutineError("");
    } catch (error) {
      setRoutineError(error.message);
    }
  }, []);
  const loadDay = useCallback(async (which) => {
    const seq = ++daySeq.current;
    const query = `day=${which}&tz=${encodeURIComponent(TZ)}`;
    try {
      const [timeline, stats] = await Promise.all([
        api(`/api/activity/timeline?${query}`),
        api(`/api/activity/stats?${query}`),
      ]);
      if (seq !== daySeq.current) return;
      setData({ day: which, sessions: timeline.sessions || [], stats });
      setDayError("");
    } catch (error) {
      if (seq === daySeq.current) setDayError(error.message);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);
  useEffect(() => {
    if (!configured) return;
    loadSettings();
    loadRoutines();
  }, [configured, loadSettings, loadRoutines]);
  useEffect(() => {
    if (configured) loadDay(day);
  }, [configured, day, loadDay]);
  // A local clock for "now" and the recording check. No network.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30e3);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const onFocus = () => {
      setNow(Date.now());
      loadStatus();
      if (!configuredRef.current) return;
      loadSettings();
      loadRoutines();
      loadDay(dayRef.current);
    };
    addEventListener("focus", onFocus);
    return () => removeEventListener("focus", onFocus);
  }, [loadStatus, loadSettings, loadRoutines, loadDay]);
  // Live updates: an Atlas change stream on sessions and settings, relayed as Server-Sent Events.
  useEffect(() => {
    if (!configured || typeof EventSource === "undefined") return;
    const source = new EventSource("/api/activity/stream");
    let timer = 0, settingsChanged = false;
    setLive("connecting");
    const refresh = (event) => {
      if (event.type === "settings") settingsChanged = true;
      clearTimeout(timer);
      timer = setTimeout(() => {
        loadDay(dayRef.current);
        loadStatus({ quiet: true });
        if (settingsChanged) {
          settingsChanged = false;
          loadSettings();
        }
      }, 1000);
    };
    source.addEventListener("session", refresh);
    source.addEventListener("settings", refresh);
    source.onopen = () => {
      setLive("open");
      setLiveNote("");
    };
    source.onerror = (event) => {
      if (event.data) {
        // The server's own "error" event: the change stream stopped, though the connection is open.
        let message = "the change stream stopped";
        try {
          message = JSON.parse(event.data).message || message;
        } catch {
          /* keep the default */
        }
        setLiveNote(message);
        setLive("off");
        return;
      }
      setLive(source.readyState === EventSource.CLOSED ? "off" : "connecting");
    };
    return () => {
      clearTimeout(timer);
      source.close();
      setLive("off");
    };
  }, [configured, loadDay, loadStatus, loadSettings]);

  const paused = settings?.paused ?? status?.paused ?? false;
  const devices = (status?.devices || []).filter((d) => d.source !== "seed");
  const lastSample = devices.reduce((max, d) => Math.max(max, Date.parse(d.lastSeen) || 0), 0);
  // With the live stream open, "now" is current; without it, judge from when the status was read.
  const reference = live === "open" ? Math.max(now, status?.fetchedAt || 0) : status?.fetchedAt || now;
  const state = !status
    ? "checking"
    : !configured
      ? "off"
      : paused
        ? "paused"
        : lastSample && reference - lastSample < RECENT_MS
          ? "recording"
          : "idle";
  const latestDevice = devices.find((d) => (Date.parse(d.lastSeen) || 0) === lastSample);
  const deviceLine = !configured
    ? ""
    : !lastSample
      ? "No samples from this computer yet."
      : `Last sample ${dayOf(lastSample) === today ? clock(lastSample) : `${shortDate(lastSample)}, ${clock(lastSample)}`} · ${latestDevice?.device || "this computer"}`;

  const togglePause = async () => {
    setPauseBusy(true);
    setHeaderError("");
    try {
      const next = await api("/api/activity/settings", { paused: !paused });
      setSettings(next);
      setStatus((s) => (s ? { ...s, paused: next.paused } : s));
    } catch (error) {
      setHeaderError(error.message);
    } finally {
      setPauseBusy(false);
    }
  };
  const saveSettings = async (patch) => {
    const before = settings;
    setSettings({ ...before, ...patch });
    setSettingsError("");
    try {
      setSettings(await api("/api/activity/settings", patch));
      return true;
    } catch (error) {
      setSettings(before);
      setSettingsError(error.message);
      return false;
    }
  };
  const decide = async (routine, decision) => {
    setRoutineBusy(routine._id);
    setRoutineError("");
    setRoutineNote("");
    try {
      const value = await api(`/api/activity/routines/${encodeURIComponent(routine._id)}`, { decision });
      const next = { ...routine, ...value.routine };
      setRoutines((list) => (list || []).map((r) => (r._id === routine._id ? next : r)));
      if (next.status === "dismissed") {
        setRoutineNote(`Dismissed ${chainText(routine.steps)}.`);
        requestAnimationFrame(() => routinesHeading.current?.focus({ preventScroll: true }));
      }
    } catch (error) {
      setRoutineError(error.message);
    } finally {
      setRoutineBusy("");
    }
  };
  const forget = async () => {
    const to = new Date(), from = new Date(+to - 3600e3);
    setSettingsError("");
    setForgetNote("");
    try {
      const result = await api("/api/activity/forget", { from: from.toISOString(), to: to.toISOString() });
      setForgetNote(
        `Forgot ${plural(result.deletedSessions, "session")} and ${plural(result.deletedEvents, "sample")} from ${span(from, to)}.`,
      );
      loadDay(dayRef.current);
      loadRoutines();
      loadStatus({ quiet: true });
      setSearchKey((k) => k + 1);
      return true;
    } catch (error) {
      setSettingsError(error.message);
      return false;
    }
  };
  const showInDay = (result) => {
    setDay(dayOf(result.start));
    setFocus({ id: result._id, at: Date.parse(result.start), token: Date.now() });
    scrollToTop(daySection.current);
  };

  return (
    <div className="standard-page history-page">
      <div className="page-title">
        <div>
          <h1>Computer history</h1>
          <p>
            What you worked on, from app and window names. No screenshots, no keystrokes. Stored in your MongoDB
            Atlas project.
          </p>
        </div>
        <div className="hx-status">
          <div className="hx-status-row">
            <span className={`hx-pill is-${state}`} role="status">
              {STATE_LABEL[state]}
            </span>
            {configured && (
              <button
                className="button small secondary"
                disabled={pauseBusy}
                aria-label={paused ? "Resume recording" : "Pause recording"}
                onClick={togglePause}
              >
                {paused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}
                {paused ? "Resume" : "Pause"}
              </button>
            )}
          </div>
          {deviceLine && (
            <p className="hx-device">
              {deviceLine}
              {state === "idle" && (
                <>
                  {" "}
                  Start <code>npm run activity:collector</code> to record.
                </>
              )}
            </p>
          )}
        </div>
      </div>
      {headerError && (
        <p className="hx-error" role="alert">
          {headerError}
        </p>
      )}
      {!status && <p className="muted">Checking Computer history…</p>}
      {status && !configured && <Setup error={status.error} onRetry={() => loadStatus()} />}
      {configured && (
        <>
          <div className="hx-next-actions"><p>Review meeting notes and repeated work before starting a task.</p><Link className="button small secondary" to="/app/sleep?view=suggestions">Open next actions <ArrowRight size={14} aria-hidden="true" /></Link></div>
          <SearchPanel status={status} onShow={showInDay} refreshKey={searchKey} />
          <Routines
            routines={routines}
            error={routineError}
            note={routineNote}
            busyId={routineBusy}
            onDecide={decide}
            headingRef={routinesHeading}
          />
          <Day
            sectionRef={daySection}
            day={day}
            today={today}
            data={data}
            error={dayError}
            onDay={setDay}
            live={live}
            liveNote={liveNote}
            landed={landed}
            focus={focus}
            now={now}
            state={state}
          />
          <Privacy
            settings={settings}
            error={settingsError}
            onSave={saveSettings}
            onForget={forget}
            forgetNote={forgetNote}
            retentionDays={status.retentionDays}
            workspace={status.workspace}
          />
        </>
      )}
    </div>
  );
}

function Setup({ error, onRetry }) {
  return (
    <section className="hx-setup" aria-labelledby="hx-setup-title">
      <h2 id="hx-setup-title">Connect this computer</h2>
      <p>
        {error || "Computer history uses the local Offload service and a connected MongoDB workspace."}
      </p>
      <p>
        Nothing is recorded from this page. Start the collector on your computer when you are ready.
      </p>
      <div className="button-row"><button className="button small secondary" onClick={onRetry}>Check connection</button></div>
      <details className="hx-setup-details"><summary>Local setup</summary><p>Set <code>MONGODB_URI</code>, start <code>npm run harness:server</code>, then <code>npm run activity:collector</code>. The collector records app and window names, not screenshots or keystrokes.</p></details>
    </section>
  );
}

const MODE = {
  "atlas-hybrid": "Atlas hybrid search: vector and keyword, fused with $rankFusion",
  local: "Local search, ranked in the app",
};

function SearchPanel({ status, onShow, refreshKey }) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const seq = useRef(0), lastQuery = useRef("");
  const run = useCallback(async (text) => {
    const q = text.trim();
    if (!q) return;
    const id = ++seq.current;
    setBusy(true);
    setError("");
    try {
      const value = await api(`/api/activity/search?q=${encodeURIComponent(q)}&limit=10`);
      if (id !== seq.current) return;
      lastQuery.current = q;
      setResult({ q, mode: value.mode, results: value.results || [] });
    } catch (e) {
      if (id === seq.current) setError(e.message);
    } finally {
      if (id === seq.current) setBusy(false);
    }
  }, []);
  // Re-run the last search after "Forget the last hour" so forgotten sessions don't linger.
  useEffect(() => {
    if (refreshKey && lastQuery.current) run(lastQuery.current);
  }, [refreshKey, run]);
  const engine = `${MODE[status.search] || "Search"}${status.embedder ? ` · embeddings: ${status.embedder}` : ""}`;

  return (
    <section aria-label="Search your computer history">
      <form
        className="hx-search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          run(query);
        }}
      >
        <Search size={18} aria-hidden="true" />
        <input
          type="search"
          aria-label="Search your computer history"
          placeholder="When did I investigate the slow aggregation?"
          value={query}
          maxLength={200}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!e.target.value) {
              seq.current++;
              setResult(null);
              setError("");
              setBusy(false);
              lastQuery.current = "";
            }
          }}
        />
        <button className="button small" disabled={busy || !query.trim()}>
          {busy ? "Searching…" : "Search"}
        </button>
      </form>
      <p className="hx-engine" role="status">
        {busy
          ? "Searching…"
          : result
            ? `${plural(result.results.length, "result")} · ${MODE[result.mode] || "Search"}`
            : engine}
      </p>
      {error && (
        <p className="hx-error" role="alert">
          {error}
        </p>
      )}
      {result &&
        (result.results.length ? (
          <ol className="hx-results">
            {result.results.map((r) => {
              const name = r.private ? "Private" : nameOf(r.label || r.domain || r.app);
              const title = r.private ? "" : r.title;
              const days = Array.isArray(r.days) ? r.days.length : 0;
              const repeat = r.count > 1 || days > 1;
              const visits =
                days > 1
                  ? r.count > days
                    ? `${plural(r.count, "visit")} on ${days} days`
                    : `on ${days} days`
                  : r.count > 1
                    ? plural(r.count, "visit")
                    : "";
              return (
                <li key={r._id}>
                  <button type="button" className="hx-result" onClick={() => onShow(r)}>
                    <span className="hx-result-main">
                      <strong>{title || name}</strong>
                      <span className="hx-meta">
                        {title && <span className="hx-app-label"><AppIcon name={name} size={16} />{name}</span>}
                        <span>
                          {repeat ? "Last " : ""}
                          {shortDate(r.start)}, {span(r.start, r.end)}
                        </span>
                        <span>{duration(r.durationSec)}</span>
                        {visits && <span>{visits}</span>}
                        {r.source === "seed" && <Tag />}
                      </span>
                    </span>
                    <span className="hx-sr">Show it in the day timeline.</span>
                    <ChevronRight size={16} aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="hx-note">
            Nothing matched “{result.q}”. Try an app, a site or words from a window title.
          </p>
        ))}
    </section>
  );
}

function Routines({ routines, error, note, busyId, onDecide, headingRef }) {
  const list = (routines || [])
    .filter((r) => r.status !== "dismissed")
    .sort((a, b) => (a.status === "approved") - (b.status === "approved"));
  const waiting = list.filter((r) => r.status !== "approved").length;
  return (
    <section className="hx-section" aria-labelledby="hx-routines-title">
      <div className="hx-head">
        <h2 id="hx-routines-title" ref={headingRef} tabIndex={-1}>
          Repeated work
        </h2>
        {list.length > 0 && <span>{waiting ? `${waiting} to review` : "All reviewed"}</span>}
      </div>
      <p className="hx-intro">
        Apps and sites you use in the same order on different days, found by an aggregation over your sessions in
        Atlas. Save a routine to review later. Saving does not start a task.
      </p>
      {error && (
        <p className="hx-error" role="alert">
          {error}
        </p>
      )}
      {note && (
        <p className="hx-note" role="status">
          {note}
        </p>
      )}
      {!routines && !error && <p className="muted">Looking for repeated work…</p>}
      {routines && !list.length && (
        <div className="hx-empty">
          <h3>Nothing repeats yet.</h3>
          <p>
            When the same apps and sites show up in the same order on several days, you can review and save the pattern here.
          </p>
        </div>
      )}
      {list.length > 0 && (
        <div className="hx-routines">
          {list.map((r) => (
            <Routine key={r._id} routine={r} busy={busyId === r._id} onDecide={onDecide} />
          ))}
        </div>
      )}
    </section>
  );
}

function Routine({ routine: r, busy, onDecide }) {
  const approved = r.status === "approved";
  const spoken = chainText(r.steps, ", then ");
  return (
    <article className={`hx-routine${approved ? " is-approved" : ""}`} aria-label={spoken}>
      <ol className="hx-chain">
        {(r.steps || []).map((step, i) => (
          <li key={i}>
            {i > 0 && <ArrowRight size={16} aria-hidden="true" className="hx-chain-arrow" />}
            <span className="hx-step">
              <strong className="hx-app-label" title={step}><AppIcon name={step} />{nameOf(step)}</strong>
              {r.titles?.[i] && <small title={r.titles[i]}>{r.titles[i]}</small>}
            </span>
          </li>
        ))}
      </ol>
      <p className="hx-when">
        <span>{describeRoutine(r)}</span>
        {r.cadence === "weekly" && <Tag>Weekly pattern</Tag>}
        {r.source === "seed" && <Tag />}
        {r.source === "mixed" && <Tag>Includes demo history</Tag>}
      </p>
      {r.cadence === "weekly" && <p className="hx-ask">Inferred from app activity across at least three weeks. No task is scheduled.</p>}
      {approved ? (
        <div className="hx-handoff" role="status">
          <Check size={16} aria-hidden="true" />
          <span>Routine saved. No task has run. <Link to="/app/sleep?view=suggestions">Review next actions</Link></span>
          <button
            className="text-button"
            disabled={busy}
            aria-label={`Remove: ${spoken}`}
            onClick={() => onDecide(r, "dismiss")}
          >
            Remove
          </button>
        </div>
      ) : (
        <>
          <p className="hx-ask">Save this pattern for later?</p>
          <div className="button-row">
            <button
              className="button small"
              disabled={busy}
              aria-label={`Save routine: ${spoken}`}
              onClick={() => onDecide(r, "approve")}
            >
              Save routine
            </button>
            <button
              className="button small secondary"
              disabled={busy}
              aria-label={`Not now: ${spoken}`}
              onClick={() => onDecide(r, "dismiss")}
            >
              Not now
            </button>
          </div>
        </>
      )}
    </article>
  );
}

function Day({ sectionRef, day, today, data, error, onDay, live, liveNote, landed, focus, now, state }) {
  const stale = !!data && data.day !== day;
  const sessions = data?.sessions || EMPTY;
  const view = useMemo(() => (sessions.length ? layout(sessions) : null), [sessions]);
  const allSample = sessions.length > 0 && sessions.every((s) => s.source === "seed");
  const hasSample = sessions.some((s) => s.source === "seed" || s.source === "mixed");
  const isToday = day === today;
  const recent = isToday || day === shiftDay(today, -1);
  return (
    <section className="hx-section" ref={sectionRef} aria-labelledby="hx-day-title" aria-busy={!data || stale}>
      <div className="hx-head hx-day-head">
        <div>
          <h2 id="hx-day-title">{dayTitle(day, today)}</h2>
          {(recent || (hasSample && !stale) || (isToday && live === "open")) && (
            <p className="hx-sub">
              {recent && <span>{longDate(day)}</span>}
              {hasSample && !stale && <Tag>{allSample ? "Sample week" : "Includes sample data"}</Tag>}
              {isToday && live === "open" && (
                <span className="hx-live" title="Updates arrive through an Atlas change stream">
                  Live
                </span>
              )}
            </p>
          )}
        </div>
        <div className="hx-day-nav">
          {!isToday && (
            <button className="text-button" onClick={() => onDay(today)}>
              Today
            </button>
          )}
          <button className="icon-button" aria-label="Previous day" onClick={() => onDay(shiftDay(day, -1))}>
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <button
            className="icon-button"
            aria-label="Next day"
            disabled={day >= today}
            onClick={() => onDay(shiftDay(day, 1))}
          >
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
      {landed === day && !isToday && (
        <p className="hx-note">Nothing recorded yet today, so this opens on the latest day with history.</p>
      )}
      {error && (
        <p className="hx-error" role="alert">
          {error}
        </p>
      )}
      {!data ? (
        !error && <p className="muted">Loading the day…</p>
      ) : stale && (error || !view) ? (
        !error && <p className="muted">Loading the day…</p>
      ) : (
        <div className={stale ? "hx-stale" : undefined}>
          {view ? (
            <>
              <Timeline view={view} isToday={!stale && isToday} now={now} focus={focus} />
              <Stats stats={data.stats} />
              <Apps byApp={data.stats?.byApp} sessions={sessions} />
              <SessionList items={view.items} hideSampleTags={allSample} />
            </>
          ) : (
            <EmptyDay isToday={isToday} state={state} />
          )}
        </div>
      )}
      {liveNote && (
        <p className="hx-note">
          Live updates are off ({liveNote}). The page refreshes when you come back to it.
        </p>
      )}
    </section>
  );
}

function EmptyDay({ isToday, state }) {
  if (!isToday)
    return (
      <div className="hx-empty">
        <h3>Nothing on this day.</h3>
        <p>No sessions were recorded. Try another day or search above.</p>
      </div>
    );
  return (
    <div className="hx-empty">
      <h3>Nothing yet today.</h3>
      <p>
        {state === "paused" ? (
          "Recording is paused. Resume it to fill in today."
        ) : state === "recording" ? (
          "Sessions appear here as you work."
        ) : (
          <>
            Start <code>npm run activity:collector</code> on this computer and today fills in as you work.
          </>
        )}
      </p>
    </div>
  );
}

function Timeline({ view, isToday, now, focus }) {
  const { from, to, items, ticks, legend } = view;
  const total = to - from;
  const pct = (t) => ((t - from) / total) * 100;
  const track = useRef(null), wrap = useRef(null), tip = useRef(null), applied = useRef(null);
  const hint = useId();
  const [activeId, setActiveId] = useState(null);
  const active = items.find((x) => x.s._id === activeId) || null;

  // A search result asked to be shown here: select it once, when its day has loaded.
  useEffect(() => {
    if (!focus || applied.current === focus.token) return;
    const hit = items.find((x) => x.s._id === focus.id) || items.find((x) => x.a <= focus.at && focus.at < x.b);
    if (!hit) return;
    applied.current = focus.token;
    setActiveId(hit.s._id);
    track.current?.focus({ preventScroll: true });
  }, [focus, items]);
  // Keep the tooltip inside the timeline's width.
  useLayoutEffect(() => {
    const el = tip.current, box = wrap.current;
    if (!el || !box || !active) return;
    const width = box.clientWidth, w = el.offsetWidth;
    const center = (pct((active.a + active.b) / 2) / 100) * width;
    el.style.left = `${Math.max(0, Math.min(width - w, center - w / 2))}px`;
  });

  // The pointer picks the session under it, or the nearest one within 8px: tiny sessions stay reachable.
  const pick = (clientX) => {
    const rect = track.current?.getBoundingClientRect();
    if (!rect?.width) return null;
    const t = from + ((clientX - rect.left) / rect.width) * total;
    const slop = (8 / rect.width) * total;
    let best = null, gap = Infinity;
    for (const x of items) {
      const d = t < x.a ? x.a - t : t > x.b ? t - x.b : 0;
      if (d < gap) {
        best = x;
        gap = d;
      }
    }
    return gap <= slop ? best : null;
  };
  const onPointer = (e) => setActiveId(pick(e.clientX)?.s._id ?? null);
  const onKeyDown = (e) => {
    if (e.key === "Escape") return setActiveId(null);
    const i = items.findIndex((x) => x.s._id === activeId), last = items.length - 1;
    const next = {
      ArrowRight: i < 0 ? 0 : Math.min(last, i + 1),
      ArrowLeft: i < 0 ? last : Math.max(0, i - 1),
      Home: 0,
      End: last,
    }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    setActiveId(items[next].s._id);
  };

  const nowPct = isToday && now >= from && now <= to ? pct(now) : null;
  const detail = active ? sessionDetail(active.s) : "";
  const spoken = active
    ? [
        sessionName(active.s),
        detail,
        span(active.s.start, active.s.end),
        duration(active.s.durationSec),
        active.s.source === "seed" ? "demo history" : "",
      ]
        .filter(Boolean)
        .join(", ")
    : "";
  return (
    <>
      <div className="hx-timeline" ref={wrap}>
        <div
          ref={track}
          className={`hx-track${active ? " has-active" : ""}`}
          tabIndex={0}
          role="group"
          aria-roledescription="timeline"
          aria-label={`Timeline, ${hourLabel(from)} to ${hourLabel(to)}, ${plural(items.length, "session")}`}
          aria-describedby={hint}
          onPointerMove={onPointer}
          onPointerDown={onPointer}
          onPointerLeave={(e) => e.pointerType === "mouse" && setActiveId(null)}
          onKeyDown={onKeyDown}
          onBlur={() => setActiveId(null)}
        >
          {items.map((x) => (
            <span
              key={x.s._id}
              className={`hx-seg hx-${x.cat}${x.s._id === activeId ? " is-active" : ""}`}
              style={{ left: `${pct(x.a)}%`, width: `max(3px, ${((x.b - x.a) / total) * 100}%)` }}
            />
          ))}
        </div>
        {nowPct !== null && <span className="hx-now" style={{ left: `${nowPct}%` }} aria-hidden="true" />}
        {active && (
          <span
            className="hx-mark"
            style={{ left: `${pct(active.a)}%`, width: `${((active.b - active.a) / total) * 100}%` }}
            aria-hidden="true"
          />
        )}
        {active && (
          <div className="hx-tip" ref={tip} aria-hidden="true">
            <strong className="hx-app-label"><AppIcon name={sessionName(active.s)} />{sessionName(active.s)}</strong>
            {detail && <span>{detail}</span>}
            <span>
              {span(active.s.start, active.s.end)} · {duration(active.s.durationSec)}
            </span>
            {active.s.source === "seed" && <Tag />}
          </div>
        )}
      </div>
      <p id={hint} className="hx-sr">
        Use the left and right arrow keys to step through sessions. Every session is also listed below.
      </p>
      <p className="hx-sr" aria-live="polite">
        {spoken}
      </p>
      <div className="hx-axis" aria-hidden="true">
        {ticks.map((t) => {
          const p = pct(t);
          return (
            <span key={t} className={p < 6 ? "is-start" : p > 94 ? "is-end" : undefined} style={{ left: `${p}%` }}>
              {hourLabel(t)}
            </span>
          );
        })}
      </div>
      <ul className="hx-legend" aria-label="Legend">
        {legend.map((l) => (
          <li key={l.cat}>
            <span className={`hx-swatch hx-${l.cat}`} aria-hidden="true" />
            {l.name}
            {l.seconds ? <small>{duration(l.seconds)}</small> : null}
          </li>
        ))}
        {nowPct !== null && (
          <li>
            <span className="hx-swatch hx-now-key" aria-hidden="true" />
            Now
          </li>
        )}
      </ul>
    </>
  );
}

function Stats({ stats }) {
  if (!stats) return null;
  return (
    <dl className="hx-stats">
      <div>
        <dt>Active time</dt>
        <dd>
          {duration(stats.totalSec)}
          <small>{plural(stats.sessions, "session")}</small>
        </dd>
      </div>
      <div>
        <dt>Focus blocks</dt>
        <dd>
          {stats.focusBlocks ?? 0}
          <small>25+ min without switching</small>
        </dd>
      </div>
      <div>
        <dt>Switches</dt>
        <dd>
          {stats.switches ?? 0}
          <small>between apps and sites</small>
        </dd>
      </div>
      <div>
        <dt>First to last</dt>
        <dd className="hx-range">{stats.first && stats.last ? span(stats.first, stats.last) : "–"}</dd>
      </div>
    </dl>
  );
}

function Apps({ byApp, sessions }) {
  const rows = useMemo(() => appRows(byApp, sessions), [byApp, sessions]);
  if (!rows.length) return null;
  const max = rows[0].seconds || 1;
  return (
    <>
      <h3 className="hx-subhead">Time by app</h3>
      <ol className="hx-apps">
        {rows.slice(0, 6).map((r) => (
          <li key={r.name}>
            <span className="hx-app-name" title={r.name}>
              <AppIcon name={r.name} />{r.name}
            </span>
            <span className="hx-bar" aria-hidden="true">
              <i style={{ width: `${Math.max(0, (r.seconds / max) * 100)}%` }} />
            </span>
            <span className="hx-app-time">{duration(r.seconds)}</span>
          </li>
        ))}
      </ol>
      {rows.length > 6 && <p className="hx-note">And {plural(rows.length - 6, "more app")}.</p>}
    </>
  );
}

function SessionList({ items, hideSampleTags }) {
  return (
    <details className="hx-list">
      <summary>All {plural(items.length, "session")}</summary>
      <ol>
        {items.map(({ s, cat }) => {
          const detail = sessionDetail(s);
          return (
            <li key={s._id}>
              <span className={`hx-swatch hx-${cat}`} aria-hidden="true" />
              <span className="hx-list-time">{span(s.start, s.end)}</span>
              <span className="hx-list-name">
                <strong className="hx-app-label"><AppIcon name={sessionName(s)} />{sessionName(s)}</strong>
                {detail && <span>{detail}</span>}
                {s.source === "seed" && !hideSampleTags && <Tag />}
              </span>
              <span className="hx-list-dur">{duration(s.durationSec)}</span>
            </li>
          );
        })}
      </ol>
    </details>
  );
}

function Privacy({ settings, error, onSave, onForget, forgetNote, retentionDays, workspace }) {
  const [draft, setDraft] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [since, setSince] = useState(0);
  const add = async (e) => {
    e.preventDefault();
    const app = draft.trim();
    if (!app || !settings) return;
    if (settings.excludedApps.some((x) => x.toLowerCase() === app.toLowerCase())) return setDraft("");
    if (await onSave({ excludedApps: [...settings.excludedApps, app] })) setDraft("");
  };
  const forget = async () => {
    setBusy(true);
    const ok = await onForget();
    setBusy(false);
    if (ok) setConfirming(false);
  };
  return (
    <section className="hx-section hx-privacy" aria-labelledby="hx-privacy-title">
      <div className="hx-head">
        <h2 id="hx-privacy-title">Privacy</h2>
      </div>
      <p className="hx-intro">You decide what is recorded. Changes apply to new samples.</p>
      {error && !confirming && (
        <p className="hx-error" role="alert">
          {error}
        </p>
      )}
      {!settings ? (
        !error && <p className="muted">Loading your settings…</p>
      ) : (
        <>
          <label className="setting-row">
            <span>
              <strong>Window titles</strong>
              <small>Keep the title of the window you are in. Off: app names only.</small>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={settings.captureTitles}
              onChange={(e) => onSave({ captureTitles: e.target.checked })}
            />
          </label>
          <label className="setting-row">
            <span>
              <strong>Page addresses</strong>
              <small>Keep the site and page open in your browser.</small>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={settings.captureUrls}
              onChange={(e) => onSave({ captureUrls: e.target.checked })}
            />
          </label>
          <div className="hx-excluded">
            <strong id="hx-excluded-title">Excluded apps</strong>
            <small>Time in these apps shows as Private, with no window titles or pages.</small>
            {settings.excludedApps.length ? (
              <ul className="hx-chips" aria-labelledby="hx-excluded-title">
                {settings.excludedApps.map((app) => (
                  <li key={app} className="hx-chip">
                    <span>{app}</span>
                    <button
                      type="button"
                      aria-label={`Stop excluding ${app}`}
                      onClick={() => onSave({ excludedApps: settings.excludedApps.filter((x) => x !== app) })}
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hx-note">No apps are excluded.</p>
            )}
            <form className="hx-add" onSubmit={add}>
              <input
                aria-label="App to exclude"
                placeholder="App name, for example Signal"
                value={draft}
                maxLength={120}
                onChange={(e) => setDraft(e.target.value)}
              />
              <button
                className="button small secondary"
                disabled={!draft.trim() || settings.excludedApps.length >= 50}
              >
                Exclude
              </button>
            </form>
          </div>
          <div className="hx-forget">
            <span>
              <strong>Forget the last hour</strong>
              <small>Deletes the raw samples and the sessions built from them. This can't be undone.</small>
            </span>
            <button
              className="button small secondary"
              onClick={() => {
                setSince(Date.now() - 3600e3);
                setConfirming(true);
              }}
            >
              Forget…
            </button>
          </div>
          {forgetNote && (
            <p className="hx-note" role="status">
              {forgetNote}
            </p>
          )}
        </>
      )}
      <p className="hx-note">
        Raw samples are deleted automatically after {plural(retentionDays || 7, "day")}. Everything is stored in your
        MongoDB Atlas project{workspace ? ` under the workspace “${workspace}”` : ""}.
      </p>
      {confirming && (
        <Modal title="Forget the last hour?" onClose={() => !busy && setConfirming(false)}>
          <p>
            This deletes what Offload recorded since {clock(since)}: the raw samples and the sessions built from them,
            from your Atlas project. It can't be undone.
          </p>
          {error && (
            <p className="hx-error" role="alert">
              {error}
            </p>
          )}
          <div className="button-row">
            <button className="button" disabled={busy} onClick={forget}>
              {busy ? "Forgetting…" : "Forget the last hour"}
            </button>
            <button className="button secondary" disabled={busy} onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
