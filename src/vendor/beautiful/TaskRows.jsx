// Adapted from the original publicly provided Beautiful UI source. See THIRD_PARTY.md.
"use client";
import { jsx, jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
const TICKS = [600, 900, 2400, 1400, 2400, 600];
function useTick(intervals) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (tick >= intervals.length - 1) return;
    const t = setTimeout(() => setTick((x) => x + 1), intervals[tick]);
    return () => clearTimeout(t);
  }, [tick, intervals]);
  return tick;
}
function SpinnerRing({ active, children }) {
  const size = 24, stroke = 2;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return /* @__PURE__ */ jsxs("span", { className: "relative inline-flex shrink-0 items-center justify-center", style: { width: size, height: size }, children: [
    /* @__PURE__ */ jsxs(
      "svg",
      {
        width: size,
        height: size,
        className: "absolute inset-0",
        style: active ? { animation: "spin 1.1s linear infinite" } : void 0,
        children: [
          /* @__PURE__ */ jsx("circle", { cx: size / 2, cy: size / 2, r, fill: "none", stroke: "var(--line)", strokeWidth: stroke }),
          active && /* @__PURE__ */ jsx(
            "circle",
            {
              cx: size / 2,
              cy: size / 2,
              r,
              fill: "none",
              stroke: "var(--ink-3)",
              strokeWidth: stroke,
              strokeLinecap: "round",
              strokeDasharray: `${c * 0.28} ${c * 0.72}`
            }
          )
        ]
      }
    ),
    /* @__PURE__ */ jsx("span", { className: "relative text-[10.5px] font-semibold tabular-nums text-ink", children })
  ] });
}
function Badge({ tone, children }) {
  return /* @__PURE__ */ jsx(
    "span",
    {
      className: `flex size-5.5 shrink-0 items-center justify-center rounded-full text-white
        ${tone === "red" ? "bg-red" : "bg-green"}`,
      style: { animation: "pop-in 300ms cubic-bezier(0.23,1,0.32,1) both" },
      children
    }
  );
}
const XIcon = /* @__PURE__ */ jsx("svg", { width: "12", height: "12", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "3.5", strokeLinecap: "round", children: /* @__PURE__ */ jsx("path", { d: "M18 6L6 18M6 6l12 12" }) });
const CheckIcon = /* @__PURE__ */ jsx("svg", { width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "3.5", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ jsx("path", { d: "M20 6L9 17l-5-5" }) });
const RetryIcon = /* @__PURE__ */ jsx("svg", { width: "12", height: "12", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "3", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ jsx("path", { d: "M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" }) });
const DEFAULT_LABELS = {
  completed: "Completed",
  failed: "Failed"
};
const TASK_ROWS = [
  {
    key: "verify",
    label: "Verified vendor records",
    amount: "12 suppliers",
    status: "done",
    details: [
      { label: "Matched tax and contact IDs", meta: "12/12" },
      { label: "Flagged stale records", meta: "0" }
    ]
  },
  {
    key: "index",
    label: "Build reorder task list",
    amount: "7 SKUs",
    status: "running",
    step: 2,
    details: [
      { label: "Reading POS export", meta: "3 files" },
      { label: "Scoring stockout risk", meta: "68%" }
    ]
  },
  {
    key: "draft",
    label: "Draft supplier emails",
    amount: "2 messages",
    status: "sequence",
    step: 3,
    details: [
      { label: "Cone supplier follow-up", meta: "draft" },
      { label: "Pistachio reorder note", meta: "draft" }
    ]
  }
];
function TaskRows({
  variant = "Capsules",
  rows = TASK_ROWS,
  labels,
  className,
  onToggleRow
}) {
  const tick = useTick(TICKS);
  const [manualOpen, setManualOpen] = useState({});
  const row2 = tick < 3 ? "pending" : tick === 3 ? "failed" : "done";
  const copy = { ...DEFAULT_LABELS, ...labels };
  const badgeFor = (row) => {
    if (row.status === "done") return /* @__PURE__ */ jsx(Badge, { tone: "green", children: CheckIcon });
    if (row.status === "running") return /* @__PURE__ */ jsx(SpinnerRing, { active: true, children: row.step });
    return row2 === "pending" ? /* @__PURE__ */ jsx(SpinnerRing, { children: row.step }) : row2 === "failed" ? /* @__PURE__ */ jsx(Badge, { tone: "red", children: XIcon }) : /* @__PURE__ */ jsx(Badge, { tone: "green", children: CheckIcon });
  };
  const pillFor = (row) => {
    if (row.status === "done")
      return /* @__PURE__ */ jsx("span", { className: "inline-flex h-5.5 items-center rounded-full bg-green-tint px-2 text-[11.5px] font-medium text-green", children: copy.completed });
    if (row.status === "running") return null;
    return row2 === "failed" ? /* @__PURE__ */ jsxs("span", { className: "inline-flex h-5.5 items-center gap-1.5 rounded-full bg-red-tint px-2 text-[11.5px] font-medium text-red", style: { animation: "fade-in 200ms ease-out both" }, children: [
      copy.failed,
      " ",
      /* @__PURE__ */ jsx("span", { style: { animation: "spin 1.2s linear infinite" }, className: "flex", children: RetryIcon })
    ] }) : row2 === "done" ? /* @__PURE__ */ jsx("span", { className: "inline-flex h-5.5 items-center gap-1.5 rounded-full bg-green-tint px-2 text-[11.5px] font-medium text-green", style: { animation: "fade-in 200ms ease-out both" }, children: copy.completed }) : null;
  };
  const list = variant === "List";
  return /* @__PURE__ */ jsx(
    "div",
    {
      className: `flex w-full max-w-110 flex-col ${list ? "gap-0 self-start overflow-hidden rounded-card bg-surface shadow-card" : "min-h-[196px] gap-2"}${className ? ` ${className}` : ""}`,
      children: rows.map((row, i) => {
        const open = manualOpen[row.key] ?? (row.key === "index" && tick === 2);
        return /* @__PURE__ */ jsxs(
          "div",
          {
            className: `self-stretch overflow-hidden transition-[border-radius,background-color] duration-300 hover:bg-inset ${list ? "border-b border-line last:border-0" : "bg-surface shadow-card"}`,
            style: {
              borderRadius: list ? 0 : open ? 14 : 22,
              animation: `fade-up 450ms cubic-bezier(0.23,1,0.32,1) ${i * 80}ms both`
            },
            children: [
              /* @__PURE__ */ jsxs(
                "button",
                {
                  type: "button",
                  "aria-expanded": open,
                  onClick: () => {
                    setManualOpen((current) => ({ ...current, [row.key]: !open }));
                    onToggleRow?.(row.key, !open);
                  },
                  className: "flex h-11 w-full items-center gap-2.5 px-2.5 text-left",
                  children: [
                    /* @__PURE__ */ jsx("span", { className: "flex size-6 shrink-0 items-center justify-center", children: badgeFor(row) }),
                    /* @__PURE__ */ jsx("span", { className: "min-w-0 flex-1 truncate text-[13px] font-medium text-ink", children: row.label }),
                    /* @__PURE__ */ jsx("span", { className: "text-[12.5px] text-ink-2 tabular-nums", children: row.amount }),
                    pillFor(row),
                    /* @__PURE__ */ jsx(
                      "span",
                      {
                        "aria-hidden": "true",
                        className: "-ml-2 flex size-7 shrink-0 items-center justify-center rounded-full text-ink-3",
                        children: /* @__PURE__ */ jsx(
                          "svg",
                          {
                            width: "15",
                            height: "15",
                            viewBox: "0 0 24 24",
                            fill: "none",
                            stroke: "currentColor",
                            strokeWidth: "2.2",
                            strokeLinecap: "round",
                            strokeLinejoin: "round",
                            className: "transition-transform duration-300",
                            style: { transform: open ? "rotate(180deg)" : "rotate(0)" },
                            children: /* @__PURE__ */ jsx("path", { d: "M6 9l6 6 6-6" })
                          }
                        )
                      }
                    )
                  ]
                }
              ),
              /* @__PURE__ */ jsx(
                "div",
                {
                  className: "grid transition-[grid-template-rows,opacity] duration-300",
                  style: {
                    gridTemplateRows: open ? "1fr" : "0fr",
                    opacity: open ? 1 : 0,
                    transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)"
                  },
                  children: /* @__PURE__ */ jsx("div", { className: "overflow-hidden", children: /* @__PURE__ */ jsxs("div", { className: "mb-2.5 grid grid-cols-[24px_1fr] gap-2.5 px-2.5", children: [
                    /* @__PURE__ */ jsx("span", { "aria-hidden": true, className: "mx-auto h-full w-px bg-line" }),
                    /* @__PURE__ */ jsx("div", { className: "flex flex-col gap-1.5", children: row.details.map((d, j) => /* @__PURE__ */ jsxs(
                      "div",
                      {
                        className: "flex items-center justify-between",
                        style: open ? { animation: `fade-up 300ms cubic-bezier(0.23,1,0.32,1) ${120 + j * 100}ms both` } : void 0,
                        children: [
                          /* @__PURE__ */ jsx("span", { className: "text-[12px] text-ink-2", children: d.label }),
                          /* @__PURE__ */ jsx("span", { className: "font-mono text-[11.5px] text-ink-3 tabular-nums", children: d.meta })
                        ]
                      },
                      d.label
                    )) })
                  ] }) })
                }
              )
            ]
          },
          row.key
        );
      })
    }
  );
}
export {
  TaskRows as default
};
