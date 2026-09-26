// Adapted from the original publicly provided Beautiful UI source. See THIRD_PARTY.md.
"use client";
import { jsx, jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
const DEFAULT_LABELS = {
  header: "All chunks",
  count: "32"
};
const CHUNKS = [
  {
    title: "Vendor onboarding rule",
    chars: "290 characters",
    body: "Cold-chain certification must be verified before a new dairy can be added to the reorder workflow.",
    source: "Dairy Onboarding SOP.pdf",
    badge: "PDF",
    tone: "bg-red"
  },
  {
    title: "Seasonal demand row",
    chars: "1,250 characters",
    body: "Q4 velocity table: pistachio +18%, vanilla +6%, rocky road -11%; retire flavors below 40 scoops weekly.",
    source: "Sales Velocity Export.csv",
    badge: "CSV",
    tone: "bg-green"
  }
];
function ContextCards({
  chunks = CHUNKS,
  labels,
  className
} = {}) {
  const [chipsShown, setChipsShown] = useState(false);
  const copy = { ...DEFAULT_LABELS, ...labels };
  useEffect(() => {
    const chips = setTimeout(() => setChipsShown(true), 700);
    return () => clearTimeout(chips);
  }, []);
  return /* @__PURE__ */ jsxs("div", { className: `flex w-full max-w-95 flex-col gap-2${className ? ` ${className}` : ""}`, children: [
    /* @__PURE__ */ jsxs(
      "div",
      {
        className: "flex items-center gap-2 px-0.5",
        style: { animation: "fade-in 400ms ease-out both" },
        children: [
          /* @__PURE__ */ jsx("span", { className: "text-[13px] font-semibold text-ink", children: copy.header }),
          /* @__PURE__ */ jsx("span", { className: "inline-flex h-5 items-center rounded-md bg-inset px-1.5 text-[11.5px] font-medium text-ink-2 shadow-hairline tabular-nums", children: copy.count })
        ]
      }
    ),
    chunks.map((chunk, i) => /* @__PURE__ */ jsxs(
      "div",
      {
        className: "overflow-hidden rounded-card bg-surface shadow-card",
        style: {
          animation: `fade-up 400ms cubic-bezier(0.23,1,0.32,1) ${i * 100}ms both`
        },
        children: [
          /* @__PURE__ */ jsxs("div", { className: "primitive-card-bar flex items-center gap-2.5 border-b border-line", children: [
            /* @__PURE__ */ jsxs("span", { className: "flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-ink", children: [
              /* @__PURE__ */ jsx("svg", { width: "11", height: "11", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", children: /* @__PURE__ */ jsx("path", { d: "M4 6h16M4 12h16M4 18h10" }) }),
              /* @__PURE__ */ jsx("span", { className: "truncate", children: chunk.title })
            ] }),
            /* @__PURE__ */ jsx("span", { className: "ml-auto shrink-0 text-[12px] text-ink-3 tabular-nums", children: chunk.chars })
          ] }),
          /* @__PURE__ */ jsx("p", { className: "px-3 pt-2 pb-1 text-[12.5px] leading-relaxed text-ink-2", children: chunk.body }),
          /* @__PURE__ */ jsx("div", { className: "px-3 pb-3", children: /* @__PURE__ */ jsxs(
            "span",
            {
              className: "inline-flex h-6 items-center gap-1.5 rounded-full bg-inset px-2\n                text-[12px] font-medium text-ink-2 shadow-btn\n                transition-[opacity,transform,background-color] duration-300 hover:bg-hover",
              style: {
                opacity: chipsShown ? 1 : 0,
                transform: chipsShown ? "scale(1)" : "scale(0.95)",
                transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)",
                transitionDelay: `${i * 80}ms`
              },
              children: [
                /* @__PURE__ */ jsx("span", { className: `flex size-3.5 items-center justify-center rounded-[4px] ${chunk.tone} text-[7px] font-bold text-white`, children: chunk.badge }),
                chunk.source,
                /* @__PURE__ */ jsx("svg", { width: "9", height: "9", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ jsx("path", { d: "M7 17L17 7M7 7h10v10" }) })
              ]
            }
          ) })
        ]
      },
      chunk.title
    ))
  ] });
}
export {
  ContextCards as default
};
