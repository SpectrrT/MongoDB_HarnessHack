// Adapted from the original publicly provided Beautiful UI source. See THIRD_PARTY.md.
"use client";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "../../components/primitives";
const PLACEHOLDER = "/agent-desktop.webp";
const SCREEN_ASPECT = "aspect-[2964/1856]";
function Ico({ path, size = 15, sw = 2 }) {
  return /* @__PURE__ */ jsx("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: sw, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, children: path });
}
const collapseIcon = /* @__PURE__ */ jsxs(Fragment, { children: [
  /* @__PURE__ */ jsx("polyline", { points: "4 14 10 14 10 20" }),
  /* @__PURE__ */ jsx("polyline", { points: "20 10 14 10 14 4" }),
  /* @__PURE__ */ jsx("line", { x1: "14", y1: "10", x2: "21", y2: "3" }),
  /* @__PURE__ */ jsx("line", { x1: "3", y1: "21", x2: "10", y2: "14" })
] });
const openIcon = /* @__PURE__ */ jsxs(Fragment, { children: [
  /* @__PURE__ */ jsx("polyline", { points: "15 3 21 3 21 9" }),
  /* @__PURE__ */ jsx("polyline", { points: "9 21 3 21 3 15" }),
  /* @__PURE__ */ jsx("line", { x1: "21", y1: "3", x2: "14", y2: "10" }),
  /* @__PURE__ */ jsx("line", { x1: "3", y1: "21", x2: "10", y2: "14" })
] });
function fmt(total) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
function CursorSvg({ className, style }) {
  return /* @__PURE__ */ jsx("svg", { className, style, width: "30", height: "30", viewBox: "0 0 24 24", fill: "#111318", stroke: "#fff", strokeWidth: "1.4", strokeLinejoin: "round", "aria-hidden": true, children: /* @__PURE__ */ jsx("path", { d: "M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z" }) });
}
function DriftCursor() {
  return /* @__PURE__ */ jsx(CursorSvg, { className: "agent-cursor", style: { left: "42%", top: "53%" } });
}
function Screen({ streamSrc, cursor = true }) {
  return /* @__PURE__ */ jsxs("div", { className: "absolute inset-0 overflow-hidden bg-inset", children: [
    streamSrc ? /\.(mp4|webm|mov|m4v)(\?|$)/i.test(streamSrc) ? /* @__PURE__ */ jsx("video", { src: streamSrc, autoPlay: true, muted: true, loop: true, playsInline: true, className: "absolute inset-0 h-full w-full object-cover" }) : (
      // eslint-disable-next-line @next/next/no-img-element
      /* @__PURE__ */ jsx("img", { src: streamSrc, alt: "", className: "absolute inset-0 h-full w-full object-cover" })
    ) : /* @__PURE__ */ jsx(FauxWindow, {}),
    cursor && /* @__PURE__ */ jsx(DriftCursor, {})
  ] });
}
function MediaSizer({ src }) {
  const style = { maxHeight: "calc(100vh - 150px)", maxWidth: "min(960px, 90vw)" };
  const cls = "block h-auto w-auto object-contain";
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(src) ? /* @__PURE__ */ jsx("video", { src, autoPlay: true, muted: true, loop: true, playsInline: true, className: cls, style }) : (
    // eslint-disable-next-line @next/next/no-img-element
    /* @__PURE__ */ jsx("img", { src, alt: "", className: cls, style })
  );
}
function LoadingScreen() {
  const size = 26, stroke = 2, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return /* @__PURE__ */ jsxs("div", { className: "absolute inset-0 bg-black", children: [
    /* @__PURE__ */ jsx("span", { className: "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2", children: /* @__PURE__ */ jsxs("svg", { width: size, height: size, className: "block", style: { animation: "spin 1.1s linear infinite" }, "aria-hidden": true, children: [
      /* @__PURE__ */ jsx("circle", { cx: size / 2, cy: size / 2, r, fill: "none", stroke: "rgba(255,255,255,0.18)", strokeWidth: stroke }),
      /* @__PURE__ */ jsx("circle", { cx: size / 2, cy: size / 2, r, fill: "none", stroke: "#fff", strokeWidth: stroke, strokeLinecap: "round", strokeDasharray: `${c * 0.28} ${c * 0.72}` })
    ] }) }),
    /* @__PURE__ */ jsx(
      "span",
      {
        className: "absolute inset-x-0 text-center text-[12.5px] font-medium text-white/70",
        style: { top: "calc(50% + 28px)" },
        children: "Connecting to agent's screen"
      }
    )
  ] });
}
function FauxWindow() {
  return /* @__PURE__ */ jsxs("div", { className: "flex h-full w-full flex-col bg-surface", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex shrink-0 items-center gap-1.5 border-b border-line bg-inset px-2.5 py-1.5", children: [
      /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1", children: [
        /* @__PURE__ */ jsx("span", { className: "size-2 rounded-full bg-red" }),
        /* @__PURE__ */ jsx("span", { className: "size-2 rounded-full bg-orange" }),
        /* @__PURE__ */ jsx("span", { className: "size-2 rounded-full bg-green" })
      ] }),
      /* @__PURE__ */ jsxs("span", { className: "ml-1 flex min-w-0 items-center gap-1.5 rounded-t-[6px] bg-surface px-2 py-1 shadow-[0_-1px_0_var(--line)]", children: [
        /* @__PURE__ */ jsx("span", { className: "size-2 shrink-0 rounded-[3px] bg-accent-tint" }),
        /* @__PURE__ */ jsx("span", { className: "h-1.5 w-14 rounded-full bg-line-strong" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "flex shrink-0 items-center gap-2 border-b border-line px-2.5 py-1.5 text-ink-3", children: [
      /* @__PURE__ */ jsx(Ico, { size: 12, path: /* @__PURE__ */ jsx("path", { d: "M15 18l-6-6 6-6" }) }),
      /* @__PURE__ */ jsx(Ico, { size: 12, path: /* @__PURE__ */ jsx("path", { d: "M9 6l6 6-6 6" }) }),
      /* @__PURE__ */ jsx("span", { className: "min-w-0 flex-1 truncate rounded-full bg-field px-2.5 py-[3px] font-mono text-[9px] text-ink-3", children: "hunter.io/try/search/ugly.cash" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "flex flex-1 flex-col gap-2.5 overflow-hidden p-3", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsx("span", { className: "grid size-4 place-items-center rounded-[4px] bg-accent-tint text-[8px] font-bold text-accent", children: "h" }),
        /* @__PURE__ */ jsx("span", { className: "h-1.5 w-12 rounded-full bg-line-strong" }),
        /* @__PURE__ */ jsx("span", { className: "ml-auto h-4 w-12 rounded-full bg-inset shadow-btn" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 rounded-[8px] bg-inset p-2", children: [
        /* @__PURE__ */ jsx("span", { className: "h-3 flex-1 rounded-full bg-surface shadow-hairline" }),
        /* @__PURE__ */ jsx("span", { className: "h-3 w-9 rounded-full bg-accent" })
      ] }),
      ["w-2/5", "w-1/2", "w-1/3", "w-2/5"].map((w, i) => /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2.5", children: [
        /* @__PURE__ */ jsx("span", { className: "size-6 shrink-0 rounded-full bg-accent-tint" }),
        /* @__PURE__ */ jsxs("span", { className: "flex min-w-0 flex-1 flex-col gap-1.5", children: [
          /* @__PURE__ */ jsx("span", { className: `h-1.5 rounded-full bg-line-strong ${w}` }),
          /* @__PURE__ */ jsx("span", { className: "h-1.5 w-3/5 rounded-full bg-line" })
        ] })
      ] }, i))
    ] })
  ] });
}
function AgentScreen({
  agentName = "Agent",
  streamSrc = PLACEHOLDER,
  variant
} = {}) {
  const loading = variant === "Loading";
  const [open, setOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [secs, setSecs] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [cursorPos, setCursorPos] = useState(null);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setSecs((s) => s + 1), 1e3);
    return () => clearInterval(id);
  }, [recording]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);
  const startRecording = () => {
    setSecs(0);
    setRecording(true);
  };
  const endRecording = () => {
    setRecording(false);
    setSecs(0);
  };
  const controls = /* @__PURE__ */ jsxs("div", { className: "flex shrink-0 items-center gap-1.5", children: [
    recording ? /* @__PURE__ */ jsxs(
      "button",
      {
        type: "button",
        onClick: endRecording,
        className: "inline-flex h-[27px] items-center gap-1.5 rounded-full bg-red pl-2.5 pr-3 text-[13px] font-medium leading-none text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] transition-[transform,filter] duration-150 ease-out hover:brightness-95 active:scale-[0.96]",
        children: [
          /* @__PURE__ */ jsx("span", { className: "size-2.5 rounded-[2px] bg-white" }),
          "End"
        ]
      }
    ) : /* @__PURE__ */ jsxs(Button, { variant: "secondary", size: "sm", className: "gap-1 pl-1.5", onClick: startRecording, children: [
      /* @__PURE__ */ jsx(Ico, { size: 15, path: /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("circle", { cx: "12", cy: "12", r: "9" }),
        /* @__PURE__ */ jsx("circle", { cx: "12", cy: "12", r: "3.5", fill: "currentColor", stroke: "none" })
      ] }) }),
      "Teach a task"
    ] }),
    /* @__PURE__ */ jsx(
      "button",
      {
        type: "button",
        "aria-label": "Collapse",
        onClick: () => setOpen(false),
        className: "primitive-icon-button text-ink-3 transition-colors duration-100 hover:bg-hover hover:text-ink",
        children: /* @__PURE__ */ jsx(Ico, { size: 15, path: collapseIcon })
      }
    )
  ] });
  return /* @__PURE__ */ jsxs("div", { className: "w-full max-w-[340px]", children: [
    /* @__PURE__ */ jsx(
      "div",
      {
        className: `group/screen relative ${SCREEN_ASPECT} overflow-hidden rounded-window bg-inset shadow-card transition-shadow duration-150 ${loading ? "" : "cursor-pointer hover:shadow-raised"}`,
        onClick: loading ? void 0 : () => setOpen(true),
        style: { animation: "fade-up 380ms cubic-bezier(0.23,1,0.32,1) both" },
        children: loading ? /* @__PURE__ */ jsx(LoadingScreen, {}) : /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(Screen, { streamSrc }),
          /* @__PURE__ */ jsx("div", { className: "absolute inset-0 flex items-center justify-center bg-[rgba(17,19,24,0)] transition-colors duration-150 group-hover/screen:bg-[rgba(17,19,24,0.18)]", children: /* @__PURE__ */ jsx("span", { className: "translate-y-1 opacity-0 transition duration-150 group-hover/screen:translate-y-0 group-hover/screen:opacity-100", children: /* @__PURE__ */ jsxs(
            Button,
            {
              variant: "accent",
              size: "sm",
              onClick: (e) => {
                e.stopPropagation();
                setOpen(true);
              },
              children: [
                /* @__PURE__ */ jsx(Ico, { size: 14, path: openIcon }),
                "Open"
              ]
            }
          ) }) })
        ] })
      }
    ),
    /* @__PURE__ */ jsxs("div", { className: "mt-2.5 truncate px-0.5 text-[13px] font-medium text-ink", children: [
      agentName,
      "'s screen"
    ] }),
    open && mounted && createPortal(
      /* @__PURE__ */ jsxs(
        "div",
        {
          className: "fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6",
          role: "dialog",
          "aria-modal": "true",
          "aria-label": `${agentName}'s screen`,
          children: [
            /* @__PURE__ */ jsx(
              "div",
              {
                className: "absolute inset-0 bg-black/60 dark:bg-black/75",
                style: { animation: "fade-in 180ms ease-out both" },
                onClick: () => setOpen(false)
              }
            ),
            /* @__PURE__ */ jsxs(
              "div",
              {
                className: "relative flex max-h-full flex-col overflow-hidden rounded-[16px] bg-surface p-2 pt-0 shadow-overlay",
                style: { animation: "pop-in 240ms cubic-bezier(0.23,1,0.32,1) both" },
                children: [
                  /* @__PURE__ */ jsxs("div", { className: "flex h-11 shrink-0 items-center justify-between gap-3 px-1.5", children: [
                    /* @__PURE__ */ jsxs("div", { className: "flex min-w-0 items-center gap-2", children: [
                      /* @__PURE__ */ jsx("span", { className: "truncate text-[13px] font-semibold text-ink", children: agentName }),
                      recording && /* @__PURE__ */ jsxs("span", { className: "inline-flex shrink-0 items-center gap-1.5 rounded-full bg-red-tint py-0.5 pl-1.5 pr-2 text-[11.5px] font-medium tabular-nums text-red", children: [
                        /* @__PURE__ */ jsx("span", { className: "size-2 rounded-full bg-red", style: { animation: "records-pulse 1.1s ease-in-out infinite" } }),
                        fmt(secs)
                      ] })
                    ] }),
                    controls
                  ] }),
                  /* @__PURE__ */ jsxs(
                    "div",
                    {
                      className: "relative min-h-0 overflow-hidden rounded-[8px] bg-inset [cursor:none]",
                      onMouseMove: (e) => {
                        const r = e.currentTarget.getBoundingClientRect();
                        setCursorPos({ x: e.clientX - r.left, y: e.clientY - r.top });
                      },
                      onMouseLeave: () => setCursorPos(null),
                      children: [
                        loading ? /* @__PURE__ */ jsx("div", { className: SCREEN_ASPECT, style: { width: "min(960px, 90vw)" }, children: /* @__PURE__ */ jsx(LoadingScreen, {}) }) : /* @__PURE__ */ jsx(MediaSizer, { src: streamSrc }),
                        !loading && cursorPos && /* @__PURE__ */ jsx(
                          CursorSvg,
                          {
                            className: "pointer-events-none absolute z-10",
                            style: { left: cursorPos.x, top: cursorPos.y, filter: "drop-shadow(0 1px 1.5px rgba(0,0,0,0.35))" }
                          }
                        )
                      ]
                    }
                  )
                ]
              }
            )
          ]
        }
      ),
      document.body
    )
  ] });
}
export {
  AgentScreen as default
};
