// Adapted from the original publicly provided Beautiful UI source. See THIRD_PARTY.md.
"use client";
import { jsx, jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
const chevron = Array.from({ length: 9 }, (_, i) => {
  const r = Math.floor(i / 3), c = i % 3;
  return (c + Math.abs(r - 1)) * 90;
});
const ORBIT_ORDER = [0, 1, 2, 5, 8, 7, 6, 3];
const orbit = Array.from({ length: 9 }, (_, i) => {
  const k = ORBIT_ORDER.indexOf(i);
  return k === -1 ? null : k * 110;
});
const PATTERNS = {
  Drive: { delays: chevron, dur: 650, round: false },
  Dots: { delays: chevron, dur: 650, round: true },
  Orbit: { delays: orbit, dur: 950, round: false }
};
function LoaderGrid({
  delays,
  dur,
  round
}) {
  return /* @__PURE__ */ jsx("span", { "aria-hidden": true, className: "grid shrink-0 grid-cols-[repeat(3,4px)] gap-[1.5px]", children: delays.map((delay, index) => /* @__PURE__ */ jsx(
    "span",
    {
      className: `size-[4px] bg-ink ${round ? "rounded-full" : "rounded-[1px]"}`,
      style: {
        opacity: delay === null ? 0.07 : 0.15,
        animation: delay === null ? "none" : `pixel-on ${dur}ms ease-in-out ${delay}ms infinite`
      }
    },
    index
  )) });
}
function useElapsed() {
  const [ds, setDs] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setDs((d) => d + 1), 100);
    return () => clearInterval(t);
  }, []);
  const total = ds / 10;
  if (total < 60) return `${total.toFixed(1)}s`;
  return `${Math.floor(total / 60)}m ${(total % 60).toFixed(1)}s`;
}
function LoadingState({
  label,
  variant = "Drive",
  /** the meme feed for the Surfer variant; hosted on Vercel Blob so it plays in
   *  production (the local /public/subway-surfers.mp4 stays gitignored).
   *  Heavily compressed (288px, 20fps, no audio → ~265 KB, from 1.1 MB) to keep
   *  Blob data transfer down. */
  videoSrc = "https://95dnc2a95qgwt9ff.public.blob.vercel-storage.com/subway-surfers-min.mp4"
}) {
  const elapsed = useElapsed();
  const surfer = variant === "Surfer";
  const resolvedLabel = label ?? (surfer ? "Subway surfing" : "Churning");
  const [videoOk, setVideoOk] = useState(true);
  const { delays, dur, round } = PATTERNS[variant] ?? PATTERNS.Drive;
  const labelEl = /* @__PURE__ */ jsx(
    "span",
    {
      className: "bg-clip-text text-[13px] font-medium text-transparent",
      style: {
        backgroundImage: "linear-gradient(90deg, var(--ink-3) 35%, var(--ink) 50%, var(--ink-3) 65%)",
        backgroundSize: "200% 100%",
        animation: "shimmer-text 1.4s linear infinite"
      },
      children: resolvedLabel
    }
  );
  const elapsedEl = /* @__PURE__ */ jsx("span", { className: "font-mono text-[12px] text-ink-3 tabular-nums", children: elapsed });
  if (surfer) {
    return /* @__PURE__ */ jsxs("div", { role: "status", className: "flex w-fit flex-col items-start", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2.5", children: [
        /* @__PURE__ */ jsx(LoaderGrid, { ...PATTERNS.Drive }),
        labelEl,
        elapsedEl
      ] }),
      /* @__PURE__ */ jsx(
        "div",
        {
          className: "mt-2 w-56 overflow-hidden rounded-[10px] shadow-overlay",
          style: { animation: "pop-in 200ms cubic-bezier(0.16,1,0.3,1) both", transformOrigin: "top left" },
          children: /* @__PURE__ */ jsx("div", { className: "relative aspect-video w-full", style: { background: "var(--tooltip-bg)" }, children: videoOk ? /* @__PURE__ */ jsx(
            "video",
            {
              src: videoSrc,
              autoPlay: true,
              muted: true,
              loop: true,
              playsInline: true,
              onError: () => setVideoOk(false),
              className: "h-full w-full object-cover"
            }
          ) : /* @__PURE__ */ jsxs("div", { className: "flex h-full w-full flex-col items-center justify-center gap-1.5", children: [
            /* @__PURE__ */ jsx(LoaderGrid, { ...PATTERNS.Drive }),
            /* @__PURE__ */ jsx("span", { className: "px-3 text-center font-mono text-[10px]", style: { color: "var(--tooltip-muted)" }, children: "Video unavailable" })
          ] }) })
        }
      )
    ] });
  }
  return /* @__PURE__ */ jsxs("div", { role: "status", className: "flex w-fit items-center gap-2.5", children: [
    /* @__PURE__ */ jsx(LoaderGrid, { delays, dur, round }),
    labelEl,
    elapsedEl
  ] });
}
export {
  LoadingState as default
};
