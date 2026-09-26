// Adapted from the original publicly provided Beautiful UI source. See THIRD_PARTY.md.
"use client";
import { jsx, jsxs } from "react/jsx-runtime";
import { useState } from "react";
const FILTERS = [
  { key: "all", label: "All", count: 5 },
  { key: "todo", label: "To do", dot: "#f09a2f", count: 2 },
  { key: "progress", label: "In Progress", dot: "#16a6c7", count: 2 },
  { key: "done", label: "Completed", dot: "#25a878", count: 1 }
];
const ROWS = [
  { task: "Restock mango sorbet", date: "Dec 03", status: "todo", owner: "Mango Moon Gelato" },
  { task: "Churn black sesame", date: "Sep 22", status: "progress", owner: "Kumo Creamery" },
  { task: "Print summer menu", date: "Jan 02", status: "todo", owner: "Coral Coast Sorbet" },
  { task: "Taste-test batch 42", date: "Nov 08", status: "progress", owner: "Maple Orbit" },
  { task: "Order waffle cones", date: "Apr 14", status: "done", owner: "Aurora Scoops" }
];
const LABELS = {
  columns: { task: "Task name", date: "Date", status: "Status", owner: "Advisor" }
};
const PILLS = {
  todo: { label: "To do", cls: "filter-status-todo" },
  progress: { label: "In Progress", cls: "filter-status-progress" },
  done: { label: "Completed", cls: "filter-status-done" }
};
function FilterTable({
  rows = ROWS,
  labels = LABELS
} = {}) {
  const [filter, setFilter] = useState("all");
  return /* @__PURE__ */ jsxs("div", { className: "w-full max-w-105", children: [
    /* @__PURE__ */ jsx(
      "div",
      {
        className: "-mx-1 mb-1 flex items-center gap-1 overflow-x-auto px-1 py-1",
        style: { scrollbarWidth: "none" },
        children: FILTERS.map((f) => {
          const active = filter === f.key;
          return /* @__PURE__ */ jsxs(
            "button",
            {
              type: "button",
              "aria-pressed": active,
              onClick: () => setFilter(f.key),
              className: `flex h-6.5 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[12px]
                font-medium transition-[background-color,box-shadow,color] duration-200
                ${active ? "bg-surface text-ink shadow-btn" : "text-ink-2 hover:bg-hover"}`,
              children: [
                f.dot && /* @__PURE__ */ jsx("span", { className: "size-1.5 rounded-full", style: { background: f.dot } }),
                f.label,
                /* @__PURE__ */ jsx(
                  "span",
                  {
                    className: `rounded-[4px] px-1 text-[10.5px] tabular-nums
                  ${active ? "bg-field text-ink-2" : "text-ink-3"}`,
                    children: f.count
                  }
                )
              ]
            },
            f.key
          );
        })
      }
    ),
    /* @__PURE__ */ jsx(
      "div",
      {
        "aria-label": "Scrollable task table",
        className: "overflow-x-auto rounded-card bg-surface shadow-card",
        role: "region",
        tabIndex: 0,
        style: { scrollbarWidth: "none" },
        children: /* @__PURE__ */ jsxs("div", { className: "min-w-[420px]", children: [
          /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-[minmax(0,1.3fr)_minmax(0,0.6fr)_minmax(0,0.95fr)_minmax(0,0.9fr)] border-b border-[var(--grid-line)] text-[12.5px] font-medium text-ink-2", children: [
            /* @__PURE__ */ jsx("span", { className: "border-r border-[var(--grid-line)] px-3 py-2", children: labels.columns.task }),
            /* @__PURE__ */ jsx("span", { className: "border-r border-[var(--grid-line)] px-3 py-2", children: labels.columns.date }),
            /* @__PURE__ */ jsx("span", { className: "border-r border-[var(--grid-line)] px-3 py-2", children: labels.columns.status }),
            /* @__PURE__ */ jsx("span", { className: "px-3 py-2", children: labels.columns.owner })
          ] }),
          rows.map((row) => {
            const shown = filter === "all" || row.status === filter;
            const pill = PILLS[row.status];
            return /* @__PURE__ */ jsx(
              "div",
              {
                className: "grid transition-[grid-template-rows,opacity] duration-300",
                style: {
                  gridTemplateRows: shown ? "1fr" : "0fr",
                  opacity: shown ? 1 : 0,
                  transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)"
                },
                children: /* @__PURE__ */ jsx("div", { className: "overflow-hidden", children: /* @__PURE__ */ jsxs(
                  "div",
                  {
                    className: "grid grid-cols-[minmax(0,1.3fr)_minmax(0,0.6fr)_minmax(0,0.95fr)_minmax(0,0.9fr)] border-b\n                      border-[var(--grid-line)] text-[13px] transition-colors duration-100 hover:bg-hover",
                    children: [
                      /* @__PURE__ */ jsx("span", { className: "flex min-w-0 items-center border-r border-[var(--grid-line)] px-3 py-2", children: /* @__PURE__ */ jsx("span", { className: "truncate font-medium text-ink", children: row.task }) }),
                      /* @__PURE__ */ jsx("span", { className: "flex items-center whitespace-nowrap border-r border-[var(--grid-line)] px-3 py-2 text-ink-2 tabular-nums", children: row.date }),
                      /* @__PURE__ */ jsx("span", { className: "flex items-center border-r border-[var(--grid-line)] px-3 py-2", children: /* @__PURE__ */ jsx(
                        "span",
                        {
                          className: `inline-flex h-[23px] shrink-0 items-center whitespace-nowrap rounded-[8px] border px-[7px]
                          text-[13px] font-medium ${pill.cls}`,
                          children: pill.label
                        }
                      ) }),
                      /* @__PURE__ */ jsx("span", { className: "flex min-w-0 items-center px-3 py-2 text-ink-2", children: /* @__PURE__ */ jsx("span", { className: "truncate", children: row.owner }) })
                    ]
                  }
                ) })
              },
              row.task
            );
          })
        ] })
      }
    )
  ] });
}
export {
  FilterTable as default
};
