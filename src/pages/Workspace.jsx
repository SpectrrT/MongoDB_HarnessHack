import Harness from "./Harness";
import Adapt from "./Adapt";
import Sleep from "./Sleep";
import React, { useState, useEffect, useRef, lazy, Suspense } from "react";
import { Link, NavLink, useNavigate, useLocation } from "react-router-dom";
import {
  PanelLeft,
  PanelRight,
  Plus,
  ArrowUpRight,
  ArrowRight,
  Check,
  ChevronRight,
  Search,
  Home,
  MessageSquare,
  ListTodo,
  Brain,
  Moon,
  Plug,
  Settings,
  Mic,
  Monitor,
  Square,
  FileText,
  MoreHorizontal,
  X,
  Download,
  Trash2,
  RefreshCw,
  Pause,
  Play,
  Clock,
  Shield,
  Command,
  ExternalLink,
  HardDrive,
  Mail,
  GitPullRequest,
  CalendarDays,
  TimerReset,
} from "lucide-react";
import {
  ThinkingOrb,
  ScreenTransition,
  OrbLoading,
} from "../components/ScreenTransition";
import { useWorkspace, download } from "../store";
import { activeSuggestions } from "../../shared/workspace";
import { Modal, Empty } from "../components/Modal";
import PromptBar from "../vendor/beautiful/PromptBar";
import TaskRows from "../vendor/beautiful/TaskRows";
import ContextCards from "../vendor/beautiful/ContextCards";
import LoadingState from "../vendor/beautiful/LoadingState";
import { Connections, ConnectDialog } from "./Connections";
import SlowMode from "./SlowMode";
import { ConnectionLogo } from "../components/ConnectionLogo";
import LiveChat from "./LiveChat";
import SidebarNav from "../vendor/beautiful/SidebarNav";
import "../beautiful-workspace.css";
import "../themes.css";
import {resolveTheme,themeStyle} from "../../shared/themes";
import Appearance from "../components/Appearance";
const Gallery = lazy(() => import("./Gallery"));
const nav = [
  ["", "Overview", Home],
  ["chat", "Conversations", MessageSquare],
  ["tasks", "Tasks", ListTodo],
  ["harness", "Durable handoff", ListTodo],
  ["adapt", "Harness sleep", Moon],
  ["memory", "Memory", Brain],
  ["sleep", "Slow mode", Moon],
  ["connections", "Connections", Plug],
];
const date = (x) =>
  new Date(x).toLocaleDateString(undefined, { month: "short", day: "numeric" });
export default function Workspace() {
  const { state, act, error, setError } = useWorkspace();
  const [sidebar, setSidebar] = useState(innerWidth > 900),
    [suggestions, setSuggestions] = useState(innerWidth > 1250),
    [session, setSession] = useState(false),
    [search, setSearch] = useState(false),
    [connect, setConnect] = useState(null);
  const [systemDark,setSystemDark] = useState(matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(()=>{const media=matchMedia("(prefers-color-scheme: dark)");const update=()=>setSystemDark(media.matches);media.addEventListener("change",update);return()=>media.removeEventListener("change",update);},[]);
  const navigate = useNavigate(),
    location = useLocation();
  useEffect(() => {
    const key = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearch((s) => !s);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        const id = crypto.randomUUID();
        act("new-conversation", { id })
          .then(() => navigate("/app/chat/" + id))
          .catch(() => {});
      }
      if (e.key === "Escape") {
        setSearch(false);
        if (innerWidth < 900) {
          setSidebar(false);
          setSuggestions(false);
        }
      }
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, []);
  if (!state)
    return (
      <OrbLoading label={error || "Opening your workspace…"} />
    );
  if (!state.profile.onboarded) return <Onboarding />;
  const route = location.pathname
      .replace("/app", "")
      .split("/")
      .filter(Boolean),
    page = route[0] || "",
    count = activeSuggestions(state).length;
  const activeSession = state.sessions.find((x) => x.status === "active");
  const newChat = async () => {
    const id = crypto.randomUUID();
    await act("new-conversation", { id });
    navigate("/app/chat/" + id);
  };
  const run = async (id) => {
    const suggestion = state.suggestions.find(s => s.id === id);
    if (!suggestion) return;
    navigate("/app/chat?prompt=" + encodeURIComponent(suggestion.title + ". Use my saved notes. Ask for missing details; do not invent facts from my accounts."));
    if(innerWidth < 1100) setSuggestions(false);
  };
  return (
    <div
      data-palette={state.settings.theme}
      style={themeStyle(resolveTheme(state.settings.theme,systemDark,state.settings.themeCustom))}
      className={`workspace ${sidebar ? "with-sidebar" : ""} ${suggestions ? "with-suggestions" : ""}`}
    >
      {sidebar && (
        <>
          <button
            className="sidebar-shade"
            aria-label="Close navigation"
            onClick={() => setSidebar(false)}
          />
          <div className="beautiful-sidebar beautiful-ui">
            <SidebarNav fill workspaceName="offload" workspaceLogo={<img src="/favicon.svg" width="18" height="18" alt=""/>}
              navItems={nav.map(([key,label,Icon]) => ({key,label,icon:<Icon size={18}/>}))}
              activeNav={page} activeTitle={state.conversations.find(c=>c.id===route[1])?.title || null}
              onNewChat={newChat} onCollapse={()=>setSidebar(false)}
              onWorkspaceClick={()=>navigate("/")}
              onNavigate={key=>{navigate("/app"+(key?"/"+key:""));if(innerWidth<900)setSidebar(false);}}
              onPick={id=>{navigate("/app/chat/"+id);if(innerWidth<900)setSidebar(false);}}
              recents={state.conversations.map(c=>({id:c.id,label:c.title}))}
              footerLabel="Settings" footerIcon={<Settings size={16}/>} onFooterClick={()=>navigate("/app/settings")}/>
          </div>
        </>
      )}
      <div className="workspace-main">
        <header className="app-header">
          <div>
            {!sidebar && (
              <button
                className="icon-button"
                aria-label="Open sidebar"
                onClick={() => {
                  setSidebar(true);
                  if (innerWidth < 900) setSuggestions(false);
                }}
              >
                <PanelLeft size={19} />
              </button>
            )}
            <span className="breadcrumb">
              Personal <ChevronRight size={13} />{" "}
              <strong>
                {nav.find((x) => x[0] === page)?.[1] || "Settings"}
              </strong>
            </span>
          </div>
          <div className="header-actions">
            <button
              className="icon-button"
              aria-label="Search workspace"
              onClick={() => setSearch(true)}
            >
              <Search size={18} />
            </button>
            <button
              className={`session-button ${activeSession ? "active" : ""}`}
              onClick={() => setSession(true)}
            >
              <span className={activeSession ? "status-dot" : ""} />
              {activeSession ? "Session active" : "Start a session"}
              <Plus size={14} />
            </button>
            <button
              className={`icon-button ${suggestions ? "selected" : ""}`}
              aria-label={
                suggestions ? "Close suggestions" : "Open suggestions"
              }
              onClick={() => {
                setSuggestions((x) => !x);
                if (innerWidth < 900) setSidebar(false);
              }}
            >
              <PanelRight size={18} />
              {count > 0 && <span className="count-dot">{count}</span>}
            </button>
          </div>
        </header>
        {error && (
          <div className="error-banner" role="alert">
            {error}
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              <X size={15} />
            </button>
          </div>
        )}
        <ScreenTransition
          as="main"
          screenKey={location.pathname}
          className={"app-content page-" + (page || "home")}
        >
          {page === "" && <LiveChat />}
          {page === "chat" && <LiveChat id={route[1]} onNew={newChat} />}
          {page === "tasks" && <Tasks id={route[1]} onConnect={setConnect} />}
          {page === "memory" && <Memory />}
          {page === "sleep" && <SlowMode><Sleep /></SlowMode>}
          {page === "harness" && <Harness />}
          {page === "adapt" && <Adapt />}
          {page === "connections" && <Connections onConnect={setConnect} />}
          {page === "settings" && <SettingsPage />}
          {page === "library" && (
            <Suspense fallback={<OrbLoading compact label="Opening component library…" />}>
              <Gallery />
            </Suspense>
          )}
        </ScreenTransition>
      </div>
      {suggestions && (
        <Suggestions onClose={() => setSuggestions(false)} onRun={run} />
      )}
      {session && <Session onClose={() => setSession(false)} />}
      {search && <SearchDialog onClose={() => setSearch(false)} onRun={run} />}
      {connect && (
        <ConnectDialog id={connect} onClose={() => setConnect(null)} />
      )}
    </div>
  );
}
function Onboarding() {
  const { act } = useWorkspace();
  const [step, setStep] = useState(0),
    [name, setName] = useState(""),
    [role, setRole] = useState("Product team"),
    [busy, setBusy] = useState(false);
  const finish = async () => {
    setBusy(true);
    try {
      await act("onboard", { name, role });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="onboarding">
      <Link to="/" className="wordmark">
        offload
      </Link>
      <div className="onboard-main">
        <ThinkingOrb
          state={
            step === 0 ? "breathing" : step === 1 ? "connecting" : "weaving"
          }
          size={64}
        />
        <span className="step-label">{step + 1} / 3</span>
        <ScreenTransition screenKey={step} className="onboard-step">
          {step === 0 ? (
            <>
              <h1>
                A little less
                <br />
                on your plate.
              </h1>
              <p>First, a name for your workspace.</p>
              <label>
                Your first name
                <input
                  autoFocus
                  value={name}
                  maxLength={60}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && name.trim()) setStep(1);
                  }}
                />
              </label>
              <button
                className="button"
                disabled={!name.trim()}
                onClick={() => setStep(1)}
              >
                Continue <ArrowRight size={17} />
              </button>
            </>
          ) : step === 1 ? (
            <>
              <h1>
                What fills
                <br />
                your day?
              </h1>
              <p>This helps organize your starting workspace.</p>
              <div className="role-options">
                {[
                  "Product team",
                  "Engineering",
                  "Design",
                  "Independent work",
                ].map((x) => (
                  <button
                    className={role === x ? "selected" : ""}
                    onClick={() => setRole(x)}
                    key={x}
                  >
                    {x}
                    {role === x && <Check size={16} />}
                  </button>
                ))}
              </div>
              <div className="button-row">
                <button className="text-button" onClick={() => setStep(0)}>
                  Back
                </button>
                <button className="button" onClick={() => setStep(2)}>
                  Continue <ArrowRight size={17} />
                </button>
              </div>
            </>
          ) : (
            <>
              <h1>
                Your work.
                <br />
                Your say.
              </h1>
              <p>
                Your workspace starts with example tasks. Account access and agent
                execution still need to be connected.
              </p>
              <div className="onboard-note">
                <Shield size={20} />
                <p>
                  No background recording starts here. You choose when to begin a
                  session. You can export or delete your workspace anytime.
                </p>
              </div>
              <div className="button-row">
                <button className="text-button" onClick={() => setStep(1)}>
                  Back
                </button>
                <button className="button" onClick={finish} disabled={busy}>
                  {busy ? "Opening…" : "Open my workspace"}{" "}
                  <ArrowRight size={17} />
                </button>
              </div>
            </>
          )}
        </ScreenTransition>
      </div>
      <footer>Your workspace stays on this device.</footer>
    </div>
  );
}
function Overview({ onRun, onSession, onSuggestions }) {
  const { state } = useWorkspace();
  const navigate = useNavigate();
  const pending = activeSuggestions(state);
  return (
    <div className="overview">
      <div className="greeting">
        <p>
          {new Date().getHours() < 12
            ? "Good morning"
            : new Date().getHours() < 18
              ? "Good afternoon"
              : "Good evening"}
          , {state.profile.name}.
        </p>
        <h1>
          Make room for
          <br />
          <em>the next thing.</em>
        </h1>
      </div>
      <div className="home-composer beautiful-ui">
        <PromptBar
          local={false}
          tall
          placeholder="What would you like to work on?"
          onSend={(text) =>
            navigate("/app/chat?prompt=" + encodeURIComponent(text))
          }
        />
      </div>
      <div className="section-line">
        <h2>Ready when you are</h2>
        <button className="text-button" onClick={onSuggestions}>
          View all <ArrowRight size={14} />
        </button>
      </div>
      <div className="home-tasks">
        {pending.slice(0, 2).map((a) => (
          <button key={a.id} onClick={() => onRun(a.id)}>
            <div className="task-glyph">
              <FileText size={19} />
            </div>
            <div>
              <h3>{a.title}</h3>
              <p>{a.reason}</p>
            </div>
            <ArrowUpRight size={18} />
          </button>
        ))}
      </div>
      <div className="activity-section">
        <div className="section-line">
          <h2>Your workspace</h2>
          <span>On this device</span>
        </div>
        <div className="workspace-summary">
          <Link to="/app/memory">
            <Brain size={20} />
            <span>
              <strong>{state.memory.length} memories</strong>
              <small>Details worth keeping</small>
            </span>
            <ChevronRight size={16} />
          </Link>
          <Link to="/app/sleep">
            <Moon size={20} />
            <span>
              <strong>
                {state.skills.length
                  ? `${state.skills.length} saved routine`
                  : "A quiet moment to learn"}
              </strong>
              <small>
                {state.skills.length
                  ? "Review what Offload learned"
                  : "Review a day of work"}
              </small>
            </span>
            <ChevronRight size={16} />
          </Link>
        </div>
      </div>
      {state.audit.length > 0 && (
        <div className="recent-activity">
          <h2>Last activity</h2>
          {state.audit.slice(0, 4).map((a) => (
            <p key={a.id}>
              <span>{a.text}</span>
              <time>
                {new Date(a.at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
function Suggestions({ onClose, onRun }) {
  const { state, act } = useWorkspace();
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("All");
  const list = activeSuggestions(state).filter(
    (x) =>
      (filter === "All" || x.category === filter) &&
      (x.title + " " + x.reason).toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <aside className="suggestions-panel">
      <div className="suggestions-head">
        <h2>Suggested for you</h2>
        <button
          className="icon-button"
          aria-label="Close suggestions panel"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <p className="panel-intro">Tasks you can review and queue.</p>
      <div className="panel-search">
        <Search size={15} />
        <input
          aria-label="Filter suggestions"
          placeholder="Find a task…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="filter-strip">
        {["All", "Writing", "Email", "Planning", "Development"].map((x) => (
          <button
            key={x}
            className={filter === x ? "active" : ""}
            onClick={() => setFilter(x)}
          >
            {x}
          </button>
        ))}
      </div>
      <div className="suggestions-list">
        {list.map((a) => (
          <article key={a.id} className="suggestion">
            <div className="suggestion-source">
              <ConnectionLogo source={a.source} size={16} />
              <span>{a.source}</span>
              <details>
                <summary aria-label={"Options for " + a.title}>
                  <MoreHorizontal size={17} />
                </summary>
                <div>
                  <button
                    onClick={() =>
                      act("suggestion", { id: a.id, status: "snoozed" }).catch(
                        () => {},
                      )
                    }
                  >
                    Snooze until tomorrow
                  </button>
                  <button
                    onClick={() =>
                      act("suggestion", {
                        id: a.id,
                        status: "dismissed",
                      }).catch(() => {})
                    }
                  >
                    Dismiss suggestion
                  </button>
                </div>
              </details>
            </div>
            <h3>{a.title}</h3>
            <p>{a.reason}</p>
            <div className="suggestion-foot">
              <span>{a.occurrences} related entries</span>
              <button onClick={() => onRun(a.id)}>
                Start task <ArrowUpRight size={14} />
              </button>
            </div>
          </article>
        ))}
        {!list.length && (
          <div className="panel-empty">
            <Check size={22} />
            <p>
              {state.settings.suggestions
                ? "Nothing here right now. Try another filter."
                : "Suggestions are paused in Settings."}
            </p>
          </div>
        )}
      </div>
      <div className="panel-bottom">
        <span className="status-dot" />
        Saved suggestions stay here until you act.
      </div>
    </aside>
  );
}
function Tasks({ id, onConnect }) {
  const { state, act } = useWorkspace();
  const navigate = useNavigate();
  const run = state.runs.find((x) => x.id === id);
  const [draft, setDraft] = useState("");
  useEffect(() => setDraft(run?.draft || ""), [run?.id, run?.draft]);
  if (run)
    return (
      <div className="detail-page">
        <button className="text-button" onClick={() => navigate("/app/tasks")}>
          ← All tasks
        </button>
        <div className="page-title">
          <h1>{run.title}</h1>
          <RunStatus status={run.status} />
        </div>
        <p className="muted">Progress is saved after each completed step.</p>
        <div className="run-progress beautiful-ui">
          <TaskRows
            variant="List"
            labels={{ completed: "Saved", paused: "Paused" }}
            rows={run.steps.map((label, i) => {
              const current = i === run.checkpoint;
              const status =
                i < run.checkpoint
                  ? "done"
                  : current && run.status === "running"
                    ? "running"
                    : current && run.status === "blocked"
                      ? "paused"
                      : "idle";
              return {
                key: String(i),
                label,
                amount: status === "running" ? "In progress" : "",
                status,
                step: i + 1,
                details: [
                  {
                    label:
                      status === "done"
                        ? "Checkpoint stored"
                        : status === "paused"
                          ? "Waiting for account access"
                          : "Waiting for this step",
                    meta: "",
                  },
                ],
              };
            })}
          />
        </div>
        {run.status === "blocked" && (
          <div className="notice">
            <Plug size={21} />
            <div>
              <h3>Reconnect to keep going.</h3>
              <p>
                Your progress is safe at step {run.checkpoint + 1}. This is a
                example account interruption.
              </p>
              <div className="button-row">
                <button
                  className="button small"
                  onClick={() => onConnect(run.provider)}
                >
                  Reconnect example account
                </button>
                <button
                  className="button secondary small"
                  onClick={() =>
                    act("resume-run", { id: run.id }).catch(() => {})
                  }
                >
                  Resume task
                </button>
              </div>
            </div>
          </div>
        )}
        {run.status === "running" && (
          <>
            <div className="beautiful-ui">
              <LoadingState label="Preparing your local draft" />
            </div>
            <button
              className="text-button"
              onClick={() => act("cancel-run", { id: run.id }).catch(() => {})}
            >
              Cancel task
            </button>
          </>
        )}
        {["ready", "completed"].includes(run.status) && (
          <div className="draft-editor">
            <div className="section-line">
              <h2>Your draft</h2>
              <span>Nothing has been sent</span>
            </div>
            <textarea
              aria-label="Edit draft"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <div className="button-row">
              <button
                className="button"
                onClick={() =>
                  act("save-draft", { id: run.id, text: draft }).catch(() => {})
                }
              >
                {run.saved ? "Save changes" : "Save local draft"}
                <Check size={16} />
              </button>
              <button
                className="button secondary"
                onClick={() => download("offload-draft.md", draft)}
              >
                <Download size={16} />
                Export Markdown
              </button>
            </div>
          </div>
        )}
      </div>
    );
  return (
    <div className="standard-page">
      <PageTitle
        title="Tasks"
        description="Work in progress, with a place to pick up."
      />
      {!state.runs.length ? (
        <Empty title="Nothing underway yet.">
          Choose a suggestion to prepare your first draft.
        </Empty>
      ) : (
        <div className="list-rows">
          {state.runs.map((r) => (
            <Link key={r.id} to={"/app/tasks/" + r.id}>
              <FileText size={20} />
              <div>
                <strong>{r.title}</strong>
                <small>
                  {r.checkpoint} of {r.steps.length} steps saved
                </small>
              </div>
              <RunStatus status={r.status} />
              <ChevronRight size={16} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
const RUN_STATUS = {
  running: "Running",
  blocked: "Needs access",
  ready: "Ready for review",
  completed: "Completed",
  cancelled: "Cancelled",
};
function RunStatus({ status }) {
  return (
    <span className={"status-label is-" + status}>
      {RUN_STATUS[status] || status}
    </span>
  );
}
function PageTitle({ title, description, children }) {
  return (
    <div className="page-title">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children}
    </div>
  );
}
function Memory() {
  const { state, act } = useWorkspace();
  const [text, setText] = useState(""),
    [query, setQuery] = useState(""),
    [saving, setSaving] = useState(false);
  const list = state.memory.filter((m) =>
    (m.text + " " + m.source).toLowerCase().includes(query.toLowerCase()),
  );
  const add = async () => {
    setSaving(true);
    try {
      await act("memory", { text });
      setText("");
    } catch {
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="standard-page">
      <PageTitle
        title="Memory"
        description="Keep the context. Leave the noise."
      />
      <div className="memory-input">
        <textarea
          aria-label="New memory"
          placeholder="A decision, a preference, a detail for next time…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button
          className="button small"
          disabled={saving || !text.trim()}
          onClick={add}
        >
          {saving ? "Saving…" : "Save memory"} <Plus size={15} />
        </button>
      </div>
      <label className="search-field">
        <Search size={16} />
        <input
          aria-label="Search memories"
          placeholder="Search your memory"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div className="memory-list">
        {list.map((m) => (
          <article key={m.id}>
            <div className="memory-meta">
              <span>
                {m.source}
                {m.example ? " · Example" : ""}
              </span>
              <span>{date(m.createdAt)}</span>
              <button
                className="icon-button"
                aria-label="Delete memory"
                onClick={() =>
                  act("delete-memory", { id: m.id }).catch(() => {})
                }
              >
                <Trash2 size={15} />
              </button>
            </div>
            <p>{m.text}</p>
          </article>
        ))}
        {!list.length && (
          <Empty title="No matching memories.">
            Add a note or try a different search.
          </Empty>
        )}
      </div>
    </div>
  );
}
function Session({ onClose }) {
  const { state, act } = useWorkspace();
  const current = state.sessions.find((x) => x.status === "active");
  const [consent, setConsent] = useState(false),
    [mode, setMode] = useState("notes"),
    [text, setText] = useState(""),
    [error, setError] = useState(""),
    [recording, setRecording] = useState(false),
    [url, setUrl] = useState(null);
  const media = useRef(null),
    recorder = useRef(null),
    chunks = useRef([]);
  const currentRef = useRef(current);
  currentRef.current = current;
  const stopMedia = () => {
    if (recorder.current?.state === "recording") recorder.current.stop();
    media.current?.getTracks().forEach((t) => t.stop());
    media.current = null;
    setRecording(false);
  };
  useEffect(
    () => () => {
      stopMedia();
      if (url) URL.revokeObjectURL(url);
      if (currentRef.current && currentRef.current.mode !== "notes")
        act("session-end", { id: currentRef.current.id }).catch(() => {});
    },
    [],
  );
  const start = async () => {
    setError("");
    try {
      let stream;
      if (mode === "audio") {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      if (mode === "screen") {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: 2 },
          audio: false,
        });
      }
      if (stream) {
        media.current = stream;
        chunks.current = [];
        const r = new MediaRecorder(stream);
        recorder.current = r;
        r.ondataavailable = (e) => {
          if (e.data.size) chunks.current.push(e.data);
        };
        r.onstop = () => {
          const blob = new Blob(chunks.current, { type: r.mimeType });
          setUrl(URL.createObjectURL(blob));
        };
        stream.getTracks()[0].onended = () => {
          stopMedia();
          if (currentRef.current)
            act("session-end", { id: currentRef.current.id }).catch(() => {});
        };
        r.start(1000);
        setRecording(true);
      }
      await act("session-start", {
        mode,
        consented: consent,
        name:
          mode === "notes"
            ? "Notes session"
            : mode === "audio"
              ? "Audio session"
              : "Screen session",
      });
    } catch (e) {
      stopMedia();
      setError(
        e.name === "NotAllowedError"
          ? "Permission was not granted. You can use a notes session instead."
          : e.message,
      );
    }
  };
  const end = async () => {
    stopMedia();
    if (current) await act("session-end", { id: current.id });
  };
  return (
    <Modal
      title={current ? "Your work session" : "Start a work session"}
      onClose={onClose}
      wide
    >
      {!current ? (
        <>
          <p>
            Choose the context you want to keep. Capture begins only after you
            start.
          </p>
          <div className="session-modes">
            {[
              ["notes", "Notes", FileText],
              ["audio", "Microphone", Mic],
              ["screen", "Selected screen", Monitor],
            ].map(([id, label, Icon]) => (
              <button
                className={mode === id ? "selected" : ""}
                key={id}
                onClick={() => setMode(id)}
              >
                <Icon size={18} />
                {label}
              </button>
            ))}
          </div>
          <p className="small-copy">
            {mode === "notes"
              ? "Save decisions as you work. No recording permission is needed."
              : "Record locally while this window stays open. Automatic transcription and screen interpretation are not connected. Closing this window ends capture."}
          </p>
          {mode !== "notes" && (
            <label className="check-label">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              Everyone involved agrees to this recording.
            </label>
          )}
          <button
            className="button"
            disabled={mode !== "notes" && !consent}
            onClick={start}
          >
            Start session <Play size={16} />
          </button>
        </>
      ) : (
        <>
          <div className="session-live">
            <ThinkingOrb state="listening" size={64} />
            <div>
              <h3>{current.name}</h3>
              <p>
                {recording
                  ? "Recording on this device"
                  : "Notes only. No microphone or screen capture."}
              </p>
            </div>
            <button className="button secondary small" onClick={end}>
              <Square size={14} />
              End session
            </button>
          </div>
          <label>
            Add a decision or detail
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What should Offload remember?"
            />
          </label>
          <button
            className="button small"
            disabled={!text.trim()}
            onClick={async () => {
              try {
                await act("session-note", { id: current.id, text });
                setText("");
              } catch {}
            }}
          >
            Save to memory <Plus size={15} />
          </button>
          <div className="session-notes">
            {current.notes.map((n, i) => (
              <p key={i}>{n}</p>
            ))}
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      {url && (
        <div className="recording-result">
          <p>Recording ready. Download it before closing this window.</p>
          <a
            className="button secondary"
            href={url}
            download={"offload-session." + (mode === "audio" ? "webm" : "webm")}
          >
            <Download size={16} />
            Download recording
          </a>
        </div>
      )}
    </Modal>
  );
}
function SearchDialog({ onClose, onRun }) {
  const { state } = useWorkspace();
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const rows = [
    ...state.suggestions.map((x) => ({ ...x, type: "Task" })),
    ...state.memory.map((x) => ({ id: x.id, title: x.text, type: "Memory" })),
    ...state.skills.map((x) => ({ id: x.id, title: x.name, type: "Routine" })),
  ]
    .filter((x) => x.title.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 12);
  return (
    <Modal title="Search your workspace" onClose={onClose}>
      <div className="search-field">
        <Search size={18} />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="A task, a detail, a routine…"
          aria-label="Search workspace content"
        />
      </div>
      <div className="search-results">
        {rows.map((x) => (
          <button
            key={x.id}
            onClick={() => {
              onClose();
              if (x.type === "Task") onRun(x.id);
              else
                navigate("/app/" + (x.type === "Memory" ? "memory" : "sleep"));
            }}
          >
            <span>{x.title}</span>
            <small>{x.type}</small>
            <ArrowUpRight size={15} />
          </button>
        ))}
      </div>
    </Modal>
  );
}
function SettingsPage() {
  const { state, act, reset, mode } = useWorkspace();
  const [name, setName] = useState(state.profile.name),
    [confirm, setConfirm] = useState(false);
  return (
    <div className="standard-page">
      <PageTitle title="Settings" description="Make this space yours." />
      <section className="settings-section">
        <h2>Your workspace</h2>
        <label>
          Name
          <div className="inline-input">
            <input value={name} onChange={(e) => setName(e.target.value)} />
            <button
              className="button small"
              onClick={() => act("profile", { name }).catch(() => {})}
            >
              Save
            </button>
          </div>
        </label>
      </section>
      <section className="settings-section">
        <h2>Suggestions and sleep</h2>
        <label className="setting-row">
          <span>
            <strong>Keep suggestions available</strong>
            <small>Tasks stay in the side panel until you act.</small>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={state.settings.suggestions}
            onChange={(e) =>
              act("settings", { suggestions: e.target.checked }).catch(() => {})
            }
          />
        </label>
        <label className="setting-row">
          <span>
            <strong>Review at a set time</strong>
            <small>Runs only while Offload is open on this device.</small>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={state.settings.sleepSchedule}
            onChange={(e) =>
              act("settings", { sleepSchedule: e.target.checked }).catch(
                () => {},
              )
            }
          />
        </label>
        {state.settings.sleepSchedule && (
          <label>
            Local review time
            <input
              type="time"
              value={state.settings.sleepHour}
              onChange={(e) =>
                act("settings", { sleepHour: e.target.value }).catch(() => {})
              }
            />
          </label>
        )}
      </section>
      <section className="settings-section">
        <h2>Your data</h2>
        <p>
          {mode === "browser"
            ? "Saved in this browser on this device."
            : "Saved by the local API on this computer."}{" "}
          This workspace does not sync across devices.
        </p>
        <div className="button-row">
          <button
            className="button secondary"
            onClick={() =>
              download(
                "offload-workspace.json",
                JSON.stringify(state, null, 2),
                "application/json",
              )
            }
          >
            <Download size={16} />
            Export workspace
          </button>
          <button
            className="text-button danger"
            onClick={() => setConfirm(true)}
          >
            Reset local workspace
          </button>
        </div>
      </section>
      <section className="settings-section">
        <h2>Built with</h2>
        <p>
          Original Beautiful UI components, Thinking Orbs, Evil Charts, and
          Vanta NET.
        </p>
        <Link className="text-link" to="/app/library">
          Explore the component library <ArrowUpRight size={15} />
        </Link>
      </section>
      <Appearance/>
      {confirm && (
        <Modal title="Reset this workspace?" onClose={() => setConfirm(false)}>
          <p>
            This deletes this workspace from your current storage. Export
            it first if you want to keep your notes and drafts.
          </p>
          <button className="button" onClick={reset}>
            Delete local data and restart
          </button>
        </Modal>
      )}
    </div>
  );
}
