// Adapted from the original publicly provided Beautiful UI source. See THIRD_PARTY.md.
"use client";
import { jsx, jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
const STEP_MS = 700;
const Icons = {
  think: /* @__PURE__ */ jsx("path", { d: "M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" }),
  write: /* @__PURE__ */ jsx("g", { fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ jsx("path", { d: "M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" }) }),
  run: /* @__PURE__ */ jsx("g", { fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ jsx("path", { d: "M4 17l6-5-6-5M12 19h8" }) }),
  read: /* @__PURE__ */ jsxs("g", { fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
    /* @__PURE__ */ jsx("path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" }),
    /* @__PURE__ */ jsx("path", { d: "M14 2v6h6" })
  ] })
};
const DEFAULT_LABELS = {
  header: "4 tool calls, 2 messages",
  more: "+2 more"
};
const ROWS = [
  {
    icon: "think",
    label: "Thinking",
    chip: "Planning the churn schedule\u2026",
    mono: false,
    detailMono: false,
    detail: [
      { text: "Weekend demand carries pistachio, so it churns first." },
      { text: "Batch capacity leaves two evening freezer windows." }
    ]
  },
  {
    icon: "write",
    label: "Write 204 lines",
    chip: "ChurnSchedule.tsx",
    mono: true,
    detailMono: true,
    detail: [
      { text: "+ const windows = slots.filter((s) => s.temp <= -12)", tone: "add" },
      { text: '+ return schedule(windows, { hero: "pistachio" })', tone: "add" }
    ]
  },
  {
    icon: "run",
    label: "Rebuild and verify",
    chip: "npm run freeze",
    mono: true,
    detailMono: true,
    detail: [
      { text: "\u2713 built in 1.2s" },
      { text: "\u2713 34 checks passed" }
    ]
  },
  {
    icon: "read",
    label: "Read image",
    chip: "flavor-chart.png",
    mono: true,
    detailMono: false,
    detail: [
      { text: "1280 \xD7 720 \xB7 line chart, three summers." },
      { text: "Mint chip trends up 12% through July." }
    ]
  }
];
const DIFFS = [
  { file: "flavors.css", add: 13, del: 0 },
  { file: "ChurnSchedule.tsx", add: 74, del: 41 },
  { file: "menu.ts", add: 8, del: 2 }
];
const DIFF_LINES = {
  "flavors.css": [
    { text: ".scoop-card {", tone: "ctx" },
    { text: "  gap: 14px;", tone: "del" },
    { text: "  gap: 12px;", tone: "add" },
    { text: "  container-type: inline-size;", tone: "add" },
    { text: "}", tone: "ctx" }
  ],
  "ChurnSchedule.tsx": [
    { text: "const slots = coldSlots(week);", tone: "ctx" },
    { text: "const windows = slots;", tone: "del" },
    { text: "const windows = slots.filter(", tone: "add" },
    { text: "  (s) => s.temp <= -12,", tone: "add" },
    { text: ");", tone: "add" }
  ],
  "menu.ts": [
    { text: 'export const hero = "mint-chip";', tone: "del" },
    { text: 'export const hero = "pistachio";', tone: "add" }
  ]
};
function ToolChips({
  steps = ROWS,
  diffs = DIFFS,
  diffLines = DIFF_LINES,
  labels,
  className,
  onOpenChange,
  onToggleRow,
  live = false
} = {}) {
  const copy = { ...DEFAULT_LABELS, ...labels };
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(true);
  const [openRows, setOpenRows] = useState(/* @__PURE__ */ new Set());
  const [preview, setPreview] = useState(null);
  const openPreview = (file) => (event) => {
    const rect = event.currentTarget.closest("[data-diffchip]").getBoundingClientRect();
    const previewHeight = 38 + (diffLines[file]?.length ?? 0) * 19;
    const fitsBelow = rect.bottom + 6 + previewHeight <= window.innerHeight - 12;
    setPreview({
      file,
      x: Math.max(12, Math.min(rect.left, window.innerWidth - 300)),
      ...fitsBelow ? { top: rect.bottom + 6 } : { bottom: window.innerHeight - rect.top + 6 }
    });
  };
  const closePreview = (file) => () => setPreview((current) => current?.file === file ? null : current);
  const total = steps.length + 1;
  useEffect(() => {
    if (live || step >= total) return;
    const t = setTimeout(() => setStep((s) => s + 1), STEP_MS);
    return () => clearTimeout(t);
  }, [step, total, live]);
  const toggleRow = (label) => setOpenRows((current) => {
    const next = new Set(current);
    next.has(label) ? next.delete(label) : next.add(label);
    onToggleRow?.(label, next.has(label));
    return next;
  });
  return /* @__PURE__ */ jsxs("div", { className: `min-h-[220px] w-full max-w-80 pb-1${className ? ` ${className}` : ""}`, children: [
    /* @__PURE__ */ jsxs(
      "button",
      {
        type: "button",
        "aria-expanded": open,
        onClick: () => setOpen((current) => {
          onOpenChange?.(!current);
          return !current;
        }),
        className: "-mx-1.5 flex w-fit items-center gap-1.5 rounded-control px-1.5 py-1 text-[12.5px] text-ink-2 transition-colors duration-100 hover:bg-hover-2",
        children: [
          /* @__PURE__ */ jsx("svg", { width: "12", height: "12", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.2", strokeLinecap: "round", strokeLinejoin: "round", className: "transition-transform duration-200", style: { transform: open ? "rotate(0deg)" : "rotate(-90deg)" }, children: /* @__PURE__ */ jsx("path", { d: "M6 9l6 6 6-6" }) }),
          /* @__PURE__ */ jsx("span", { className: "tabular-nums", children: copy.header })
        ]
      }
    ),
    /* @__PURE__ */ jsx("div", { className: "grid transition-[grid-template-rows,opacity] duration-300", style: { gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0 }, children: /* @__PURE__ */ jsxs("div", { className: "-mx-1 overflow-hidden px-1.5 pb-1", children: [
      /* @__PURE__ */ jsx("div", { className: "mt-1.5 flex flex-col gap-1", children: steps.slice(0, live ? steps.length : step).map((row) => {
        const rowOpen = openRows.has(row.label);
        return /* @__PURE__ */ jsxs("div", { style: { animation: "fade-up 300ms cubic-bezier(0.23,1,0.32,1) both" }, children: [
          /* @__PURE__ */ jsxs(
            "button",
            {
              type: "button",
              "aria-expanded": rowOpen,
              onClick: () => toggleRow(row.label),
              className: "tool-activity-row group/row -mx-[3px] flex h-7 w-[calc(100%+6px)] min-w-0 items-center gap-2 rounded-control px-[3px] text-left transition-colors duration-100 hover:bg-hover-2",
              children: [
                /* @__PURE__ */ jsxs("span", { className: "relative flex size-4 shrink-0 items-center justify-center text-ink-3", children: [
                  row.iconNode || /* @__PURE__ */ jsx(
                    "svg",
                    {
                      width: "13",
                      height: "13",
                      viewBox: "0 0 24 24",
                      fill: row.icon === "think" ? "currentColor" : "none",
                      stroke: "currentColor",
                      className: `transition-opacity duration-100 group-hover/row:opacity-0 ${rowOpen ? "opacity-0" : ""}`,
                      children: Icons[row.icon]
                    }
                  ),
                  !row.iconNode && /* @__PURE__ */ jsx(
                    "svg",
                    {
                      width: "12",
                      height: "12",
                      viewBox: "0 0 24 24",
                      fill: "none",
                      stroke: "currentColor",
                      strokeWidth: "2.2",
                      strokeLinecap: "round",
                      strokeLinejoin: "round",
                      className: `absolute transition-[opacity,transform] duration-150 group-hover/row:opacity-100 ${rowOpen ? "opacity-100" : "opacity-0"}`,
                      style: { transform: rowOpen ? "rotate(0deg)" : "rotate(-90deg)" },
                      children: /* @__PURE__ */ jsx("path", { d: "M6 9l6 6 6-6" })
                    }
                  )
                ] }),
                /* @__PURE__ */ jsx("span", { className: "tool-activity-label shrink-0 text-[12.5px] font-medium text-ink", children: row.label }),
                /* @__PURE__ */ jsxs(
                  "span",
                  {
                    className: `tool-activity-status inline-flex h-5.5 min-w-0 flex-1 cursor-pointer items-center truncate rounded-chip bg-field px-1.5
                    text-[11.5px] text-ink-2 shadow-hairline transition-colors duration-100 hover:bg-hover-2
                    ${row.mono ? "font-mono" : ""}`,
                    children: [
                      row.working && /* @__PURE__ */ jsx("span", { className: "tool-live-dot", "aria-hidden": "true" }),
                      row.chip
                    ]
                  }
                )
              ]
            }
          ),
          /* @__PURE__ */ jsx(
            "div",
            {
              className: "grid transition-[grid-template-rows,opacity] duration-300",
              style: { gridTemplateRows: rowOpen ? "1fr" : "0fr", opacity: rowOpen ? 1 : 0, transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)" },
              children: /* @__PURE__ */ jsx("div", { className: "min-h-0 overflow-hidden", children: /* @__PURE__ */ jsx("div", { className: "mt-0.5 mb-1 ml-2 flex flex-col gap-0.5 border-l border-line py-0.5 pl-3.5", children: row.detail.map((line) => /* @__PURE__ */ jsx(
                "span",
                {
                  className: `truncate text-[11.5px] leading-[1.6] ${row.detailMono ? "font-mono" : ""} ${line.tone === "add" ? "text-green" : "text-ink-2"}`,
                  children: line.text
                },
                line.text
              )) }) })
            }
          )
        ] }, row.label);
      }) }),
      step >= total && /* @__PURE__ */ jsxs("div", { className: "mt-2.5 flex max-w-full flex-wrap gap-1.5 border-t border-line pt-2.5", children: [
        diffs.map((d, i) => /* @__PURE__ */ jsx(
          "span",
          {
            "data-diffchip": true,
            className: "relative",
            onMouseEnter: openPreview(d.file),
            onMouseLeave: closePreview(d.file),
            children: /* @__PURE__ */ jsxs(
              "button",
              {
                type: "button",
                "aria-expanded": preview?.file === d.file,
                "aria-label": `Show diff for ${d.file}`,
                onFocus: openPreview(d.file),
                onBlur: closePreview(d.file),
                className: "inline-flex h-7 max-w-full items-center gap-2 rounded-chip\n                  bg-surface px-2 font-mono text-[11.5px] text-ink shadow-btn\n                  transition-colors duration-100 hover:bg-hover",
                style: { animation: `pop-in 250ms cubic-bezier(0.23,1,0.32,1) ${i * 80}ms both` },
                children: [
                  /* @__PURE__ */ jsx("span", { className: "min-w-0 truncate", children: d.file }),
                  /* @__PURE__ */ jsxs("span", { className: "shrink-0 text-green tabular-nums", children: [
                    "+",
                    d.add
                  ] }),
                  d.del > 0 && /* @__PURE__ */ jsxs("span", { className: "shrink-0 text-red tabular-nums", children: [
                    "\u2212",
                    d.del
                  ] })
                ]
              }
            )
          },
          d.file
        )),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            className: "inline-flex h-7 items-center rounded-chip px-1.5 font-mono text-[11.5px] text-ink-3\n              underline decoration-transparent underline-offset-2 transition-colors duration-100\n              hover:text-ink-2 hover:decoration-current",
            style: { animation: `fade-in 300ms ease-out ${diffs.length * 80}ms both` },
            children: copy.more
          }
        )
      ] })
    ] }) }),
    preview && typeof document !== "undefined" && createPortal(
      /* @__PURE__ */ jsxs(
        "div",
        {
          className: "fixed z-50 w-72 overflow-hidden rounded-[10px] bg-surface shadow-overlay",
          style: {
            left: preview.x,
            top: preview.top,
            bottom: preview.bottom,
            animation: "pop-in 160ms cubic-bezier(0.23,1,0.32,1) both",
            transformOrigin: preview.top === void 0 ? "bottom left" : "top left"
          },
          children: [
            /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between border-b border-line px-2.5 py-1.5 font-mono text-[11px]", children: [
              /* @__PURE__ */ jsx("span", { className: "min-w-0 truncate text-ink-2", children: preview.file }),
              /* @__PURE__ */ jsxs("span", { className: "shrink-0 tabular-nums", children: [
                /* @__PURE__ */ jsxs("span", { className: "text-green", children: [
                  "+",
                  diffs.find((diff) => diff.file === preview.file)?.add
                ] }),
                (diffs.find((diff) => diff.file === preview.file)?.del ?? 0) > 0 && /* @__PURE__ */ jsxs("span", { className: "text-red", children: [
                  " \u2212",
                  diffs.find((diff) => diff.file === preview.file)?.del
                ] })
              ] })
            ] }),
            /* @__PURE__ */ jsx("div", { className: "py-1 font-mono text-[11px] leading-[1.8]", children: (diffLines[preview.file] ?? []).map((line, index) => /* @__PURE__ */ jsxs(
              "div",
              {
                className: `flex gap-2 px-2.5 whitespace-pre ${line.tone === "add" ? "bg-green-tint text-green" : line.tone === "del" ? "bg-red-tint text-red" : "text-ink-2"}`,
                children: [
                  /* @__PURE__ */ jsx("span", { className: "w-3 shrink-0 select-none", children: line.tone === "add" ? "+" : line.tone === "del" ? "\u2212" : " " }),
                  /* @__PURE__ */ jsx("span", { className: "min-w-0 truncate", children: line.text })
                ]
              },
              index
            )) })
          ]
        }
      ),
      document.body
    )
  ] });
}
export {
  ToolChips as default
};
