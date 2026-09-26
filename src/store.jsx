import {watchModelJob} from './watch-model-job';
import {modelRequest} from './model-api';
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import {
  createWorkspace,
  transition,
  advanceWorkspace,
} from "../shared/workspace.js";
const Context = createContext(null),
  KEY = "offload.workspace.v1";
const locked = (fn) =>
  navigator.locks
    ? navigator.locks.request("offload-workspace", fn)
    : Promise.resolve().then(fn);
const MODE = import.meta.env.VITE_STORAGE_MODE || "browser";
export function WorkspaceProvider({ children }) {
  const [state, setState] = useState(null),
    [error, setError] = useState("");
  const [liveJobs,setLiveJobs]=useState({}),[jobConnections,setJobConnections]=useState({});
  const watchers=useRef(new Map());
  const ref = useRef(null),
    queue = useRef(Promise.resolve());
  const put = useCallback((s) => {
    ref.current = s;
    setState(s);
    if (MODE === "browser") {
      try {
        localStorage.setItem(KEY, JSON.stringify(s));
      } catch {
        setError(
          "The browser could not save your workspace. Export a backup in Settings.",
        );
      }
    }
    return s;
  }, []);
  useEffect(() => {
    if (MODE === "api") {
      fetch("/api/state")
        .then((r) => {
          if (!r.ok)
            throw Error(
              "The local service is unavailable. Start it with npm run dev.",
            );
          return r.json();
        })
        .then(put)
        .catch((e) => setError(e.message));
    } else {
      try {
        const saved = localStorage.getItem(KEY);
        const s = saved ? JSON.parse(saved) : createWorkspace();
        if (s.version !== 1)
          throw Error("This workspace uses an unsupported version.");
        put(advanceWorkspace(s));
      } catch (e) {
        setError(
          "Your saved workspace could not be opened. Export or clear it in browser storage before restarting.",
        );
      }
    }
  }, [put]);
  const act = useCallback(
    (type, payload = {}) => {
      const run = queue.current
        .catch(() => {})
        .then(async () => {
          try {
            let s;
            if (MODE === "api") {
              const r = await fetch("/api/action", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type, payload }),
              });
              s = await r.json();
              if (!r.ok) throw Error(s.error);
            } else {
              return await locked(() => {
                const latest =
                  JSON.parse(localStorage.getItem(KEY) || "null") ||
                  ref.current;
                const next = transition(advanceWorkspace(latest), {
                  type,
                  payload,
                });
                put(next);
                setError("");
                return next;
              });
            }
            put(s);
            setError("");
            return s;
          } catch (e) {
            setError(e.message);
            throw e;
          }
        });
      queue.current = run;
      return run;
    },
    [put],
  );
  useEffect(() => {
    const tick = setInterval(async () => {
      if (!ref.current) return;
      if (MODE === "api") {
        try {
          const r = await fetch("/api/state");
          if (r.ok) {
            const s = await r.json();
            if (s.revision !== ref.current.revision) put(s);
          }
        } catch {}
      } else {
        await locked(() => {
          const latest =
            JSON.parse(localStorage.getItem(KEY) || "null") || ref.current;
          const next = advanceWorkspace(latest);
          if (next !== latest || next.revision !== ref.current.revision)
            put(next);
        });
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [put]);
  useEffect(() => {
    const h = (e) => {
      if (e.key === KEY && e.newValue) {
        try {
          const s = JSON.parse(e.newValue);
          if (s.version === 1) {
            ref.current = s;
            setState(s);
          }
        } catch {}
      }
    };
    addEventListener("storage", h);
    return () => removeEventListener("storage", h);
  }, []);
  const pendingSignature=JSON.stringify((state?.conversations||[]).filter(c=>c.pending).map(c=>[c.id,c.pending.id]));
  useEffect(()=>{
    const pending=new Map((ref.current?.conversations||[]).filter(c=>c.pending).map(c=>[c.pending.id,c.id]));
    for(const [jobId,stop] of watchers.current)if(!pending.has(jobId)){stop();watchers.current.delete(jobId);}
    for(const [jobId,id] of pending)if(!watchers.current.has(jobId)){
      watchers.current.set(jobId,watchModelJob({
        read:()=>modelRequest('jobs/'+jobId),
        onUpdate:job=>setLiveJobs(current=>({...current,[jobId]:job})),
        onConnection:message=>setJobConnections(current=>({...current,[jobId]:message})),
        onFinish:job=>act('chat-finish',{id,jobId,...(job.status==='completed'?{text:job.result.text,usage:job.result.usage,agent:job.result.agent}:{error:job.error||'You stopped this reply.',...(job.stream?{text:'Partial reply:\n\n'+job.stream.slice(0,19000)}:{})})}),
      }));
    }
  },[pendingSignature,act]);
  useEffect(()=>()=>{for(const stop of watchers.current.values())stop();watchers.current.clear();},[]);
  const naming=useRef(new Map());
  useEffect(()=>{
    for(const c of state?.conversations||[]){
      const first=c.messages.find(m=>m.role==='user');
      if(!first||c.generatedTitle||c.listStatus||naming.current.has(c.id))continue;
      const job={stopped:false,attempts:0};naming.current.set(c.id,job);
      const name=async()=>{try{
        const result=await modelRequest('titles',{conversationId:c.id,text:(first.displayText||first.text).slice(0,20000)});
        if(job.stopped)return;
        if(result.status==='completed')await act('conversation-title',{id:c.id,title:result.title});
        else if(result.status==='pending'&&++job.attempts<30)job.timer=setTimeout(name,3000);
      }catch{ /* Keep the first-message title if naming is unavailable. */ }};
      void name();
    }
  },[state?.conversations,act]);
  useEffect(()=>()=>{for(const job of naming.current.values()){job.stopped=true;clearTimeout(job.timer);}naming.current.clear();},[]);
  const reset = async () => {
    if(ref.current?.conversations.some(c=>c.sleepEnabled))await modelRequest("sleep/reset",{});
    if (MODE === "api") {
      const r = await fetch("/api/reset", { method: "POST" });
      if (!r.ok) throw Error("Reset failed.");
      put(await r.json());
    } else put(createWorkspace());
  };
  return (
    <Context.Provider
      value={{ state, act, error, setError, reset, mode: MODE, liveJobs, jobConnections }}
    >
      {children}
    </Context.Provider>
  );
}
export const useWorkspace = () => useContext(Context);
export function download(name, text, type = "text/markdown") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
