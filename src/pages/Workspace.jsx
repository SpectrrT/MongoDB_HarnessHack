import ScheduledTasks from '../components/ScheduledTasks';
import ConversationArchive from './ConversationArchive';
import {modelRequest} from '../model-api';
import {PERSONAL_SUGGESTIONS} from '../../shared/personal-suggestions';
import Session from "../components/Session";
import Harness from "./Harness";
import Sleep from "./Sleep";
import Rem from "./Rem";
import HistoryPage from "./History";
import React, { useState, useEffect, useLayoutEffect, useRef, lazy, Suspense } from "react";
import { Link, Navigate, NavLink, useNavigate, useLocation } from "react-router-dom";
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
  Sparkles,
  History as HistoryIcon,
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
import "../overview.css";
import {resolveTheme,themeStyle} from "../../shared/themes";
import Appearance from "../components/Appearance";
import AgentSettings from "../components/AgentSettings";
import ProfileMenu,{ProfileEditor} from "../components/ProfileMenu";
const Gallery = lazy(() => import("./Gallery"));
const nav = [
  ["overview", "Overview", Home],
  ["tasks", "Tasks", ListTodo],
  ["sleep", "Sleep", Moon],
  ["history", "Computer history", HistoryIcon],
  ["connections", "Connections", Plug],
];
const date = (x) =>
  new Date(x).toLocaleDateString(undefined, { month: "short", day: "numeric" });
export default function Workspace() {
  const { state, act, error, setError } = useWorkspace();
  const [sidebar, setSidebar] = useState(innerWidth > 900),
    [suggestions, setSuggestions] = useState(false),
    [session, setSession] = useState(false),
    [search, setSearch] = useState(false),
    [connect, setConnect] = useState(null);
  useEffect(()=>{const narrow=matchMedia('(max-width: 900px)');const resize=()=>{if(narrow.matches){setSidebar(false);setSuggestions(false);}};narrow.addEventListener('change',resize);return()=>narrow.removeEventListener('change',resize);},[]);
  const [systemDark,setSystemDark] = useState(matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(()=>{const media=matchMedia("(prefers-color-scheme: dark)");const update=()=>setSystemDark(media.matches);media.addEventListener("change",update);return()=>media.removeEventListener("change",update);},[]);
  const palette=resolveTheme(state?.settings?.theme,systemDark,state?.settings?.themeCustom);
  useLayoutEffect(()=>{
    const root=document.documentElement;
    const previous=root.style.getPropertyValue('--workspace-canvas');
    root.style.setProperty('--workspace-canvas',palette.surface);
    root.setAttribute('data-offload-workspace','');
    return()=>{root.removeAttribute('data-offload-workspace');if(previous)root.style.setProperty('--workspace-canvas',previous);else root.style.removeProperty('--workspace-canvas');};
  },[palette.surface]);
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
        navigate("/app/chat");
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
  if (!page) return <Navigate to={"/app/chat" + location.search + location.hash} replace />;
  const newChat = () => navigate("/app/chat");
  const run = async (id) => {
    const suggestion = PERSONAL_SUGGESTIONS.find(s=>s.id===id) || state.suggestions.find(s => s.id === id);
    if (!suggestion) return;
    navigate("/app/chat?prompt=" + encodeURIComponent(suggestion.prompt || suggestion.title + ". Use my saved notes. Ask for missing details; do not invent facts from my accounts."));
    if(innerWidth < 1100) setSuggestions(false);
  };
  return (
    <div
      data-palette={state.settings.theme}
      style={themeStyle(palette)}
      className={`workspace ${sidebar ? "with-sidebar" : ""}`}
    >
      {sidebar && (
        <>
          <button
            className="sidebar-shade"
            aria-label="Close navigation"
            onClick={() => setSidebar(false)}
          />
          <div className="beautiful-sidebar beautiful-ui">
            <SidebarNav fill workspaceName="offload" workspaceLogo={null}
              navItems={nav.map(([key,label,Icon]) => ({key,label,icon:<Icon size={18} data-sleep-destination={key==='sleep'?'true':undefined}/>}))}
              activeNav={page} activeTitle={state.conversations.find(c=>c.id===route[1])?.title || null}
              onNewChat={newChat} onCollapse={()=>setSidebar(false)}
              onWorkspaceClick={()=>navigate("/")}
              onNavigate={key=>{navigate("/app"+(key?"/"+key:""));if(innerWidth<900)setSidebar(false);}}
              onPick={id=>{navigate("/app/chat/"+id);if(innerWidth<900)setSidebar(false);}}
              recents={state.conversations.filter(c=>!c.sleepEnabled&&!c.listStatus).map(c=>({id:c.id,label:c.title,running:!!c.pending}))}
              onOpenArchive={()=>navigate('/app/archive')}
              onConversationAction={async(id,action)=>{try{const c=state.conversations.find(c=>c.id===id);
                if(action==='sleep'){
                  const messages=c.messages.slice(-16).map(m=>({role:m.role,text:m.text.slice(0,20000)}));
                  const context=messages.length?{model:c.pending?.model||c.messages.findLast(m=>m.role==='assistant')?.model||state.settings.modelSelection||'gpt-5.5',provider:state.settings.modelProvider||'codex',effort:state.settings.reasoningEffort||'low',messages,notes:[]}:undefined;
                  await modelRequest('sleep/'+id,{enabled:true,...(context?{context}:{})});await act('conversation-sleep',{id,enabled:true});navigate('/app/sleep');
                }else{
                  if(action==='delete'&&c.pending)await modelRequest('jobs/'+c.pending.id+'/stop',{});
                  if(c.sleepEnabled){await modelRequest('sleep/'+id,{enabled:false});await act('conversation-sleep',{id,enabled:false});}
                  await act('conversation-state',{id,action});if(route[1]===id)navigate('/app/chat');
                }
              }catch(e){setError(e.message);}}}
              footerLabel="" footerIcon={<Settings size={16}/>} onFooterClick={()=>navigate("/app/settings")}/>
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
                {nav.find((x) => x[0] === page)?.[1] || (page === "chat" ? (route[1] ? "Conversation" : "New chat") : "Settings")}
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
            <ProfileMenu/>
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
          {page === "overview" && <Overview />}
          {page === "chat" && <LiveChat id={route[1]} onRevealSidebar={()=>setSidebar(true)} />}
          {page === "tasks" && <Tasks id={route[1]} onConnect={setConnect} />}
          {page === "memory" && <Navigate to={"/app/sleep?view=" + ({sleep: "conversations", rem: "rem"}[new URLSearchParams(location.search).get("tab")] || "memory")} replace />}
          {page === "archive" && <ConversationArchive/>}
          {page === "history" && <HistoryPage />}
          {page === "sleep" && <SlowMode memory={<Memory />} review={<Sleep />} rem={<Rem />} />}
          {page === "harness" && <Harness />}
          {page === "rem" && <Navigate to="/app/sleep?view=rem" replace />}
          {page === "connections" && <Connections onConnect={setConnect} />}
          {page === "settings" && <SettingsPage />}
          {page === "library" && (
            <Suspense fallback={<OrbLoading compact label="Opening component library…" />}>
              <Gallery />
            </Suspense>
          )}
        </ScreenTransition>
      </div>

      <Session open={session} onClose={() => setSession(false)} />
      {search && <SearchDialog onClose={() => setSearch(false)} onRun={run} />}
      {connect && (
        <ConnectDialog id={connect} onClose={() => setConnect(null)} />
      )}
    </div>
  );
}
function Onboarding() {
  const { act } = useWorkspace();
  const navigate = useNavigate();
  const [step, setStep] = useState(0),
    [name, setName] = useState(""),
    [role, setRole] = useState("Product team"),
    [busy, setBusy] = useState(false);
  const finish = async () => {
    setBusy(true);
    try {
      await act("onboard", { name, role });
      navigate("/app/chat", { replace: true });
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
function Overview() {
  const { state } = useWorkspace();
  const [scheduled, setScheduled] = useState(null);
  const [tasksUnavailable, setTasksUnavailable] = useState(false);
  useEffect(() => {
    let live = true;
    const read = async () => {
      try {
        const result = await modelRequest('tasks');
        if (live) { setScheduled(result.tasks); setTasksUnavailable(false); }
      } catch {
        if (live) setTasksUnavailable(true);
      }
    };
    void read();
    const timer = setInterval(read, 15000);
    return () => { live = false; clearInterval(timer); };
  }, []);
  const conversations = state.conversations
    .filter(c => !c.listStatus && (c.messages.length || c.pending))
    .sort((a, b) => (b.messages.at(-1)?.at ?? b.createdAt) - (a.messages.at(-1)?.at ?? a.createdAt));
  const running = conversations.filter(c => c.pending).length;
  const memories = state.memory.filter(m => !m.example && !m.sample);
  const tasks = scheduled?.filter(t => t.status === 'scheduled' || t.jobId);
  return (
    <div className="workspace-overview">
      <header className="overview-heading">
        <div><h1>Overview</h1><p>Your conversations, scheduled work, and saved context.</p></div>
        <Link to="/app/chat" className="button small"><Plus size={16} />New chat</Link>
      </header>
      <div className="overview-stats">
        <Link to="/app/chat"><MessageSquare size={19} /><span><strong>{conversations.length}</strong><span>Conversations</span><small>{running ? `${running} running` : 'No runs in progress'}</small></span><ArrowUpRight size={16} /></Link>
        <Link to="/app/tasks"><ListTodo size={19} /><span><strong>{tasksUnavailable || !tasks ? '—' : tasks.length}</strong><span>Active tasks</span><small>{tasksUnavailable ? 'Status unavailable' : !tasks ? 'Loading schedule…' : 'Scheduled or running'}</small></span><ArrowUpRight size={16} /></Link>
        <Link to="/app/memory"><Brain size={19} /><span><strong>{memories.length}</strong><span>Saved memories</span><small>Your notes and decisions</small></span><ArrowUpRight size={16} /></Link>
      </div>
      <section className="overview-conversations" aria-labelledby="overview-conversations-title">
        <div className="overview-section-heading"><h2 id="overview-conversations-title">Recent conversations</h2><Link to="/app/archive">Archive <ArrowRight size={14} /></Link></div>
        {conversations.length ? <div className="overview-conversation-list">{conversations.slice(0, 5).map(c => <Link key={c.id} to={'/app/chat/' + c.id}><MessageSquare size={17} /><span>{c.title || 'Untitled conversation'}</span><small>{c.pending ? 'Running' : c.sleepEnabled ? 'Sleep enabled' : 'Open'}</small><ChevronRight size={16} /></Link>)}</div> : <p className="overview-empty">No conversations yet. Start a new chat when you have something to work on.</p>}
      </section>
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
                    Snooze for a day
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
      <ScheduledTasks/>
      {!state.runs.length ? null : (
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
function SearchDialog({ onClose, onRun }) {
  const { state } = useWorkspace();
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const rows = [
    ...PERSONAL_SUGGESTIONS.map((x) => ({ ...x, type: "Task" })),
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
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="standard-page">
      <PageTitle title="Settings" description="Make this space yours." />
      <ProfileEditor/>
      <AgentSettings/>
      <section className="settings-section">
        <h2>Suggestions and sleep</h2>
        <label className="setting-row">
          <span>
            <strong>Keep suggestions available</strong>
            <small>Show rotating task suggestions below new chats.</small>
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
