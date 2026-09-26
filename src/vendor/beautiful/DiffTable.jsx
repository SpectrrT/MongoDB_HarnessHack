// Adapted from the original publicly provided Beautiful UI source. See THIRD_PARTY.md.
"use client";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { Button } from "../../components/primitives";
function useStage(steps) {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    if (stage >= steps.length) return;
    const t = setTimeout(() => setStage((s) => s + 1), steps[stage]);
    return () => clearTimeout(t);
  }, [stage, steps]);
  return stage;
}
const STAGE_DELAYS = [180, 260];
const ROWS = [
  { key: "rocky", id: "Rocky Road", dept: "Classic", email: "aurora-scoops", removed: true },
  { key: "bubblegum", id: "Bubblegum", dept: "Retro", email: "kumo-creamery", removed: true },
  { key: "mint", id: "Mint Chip", dept: "Classic", email: "maple-orbit", removed: false }
];
const DOT = {
  Classic: "bg-accent",
  Retro: "bg-ink-3",
  Seasonal: "bg-orange"
};
function IncludedMark({ included, tone }) {
  return /* @__PURE__ */ jsx(
    "span",
    {
      "aria-hidden": true,
      className: `flex size-4.5 shrink-0 items-center justify-center rounded-[5px] transition-[background-color,color,transform] duration-150 ${included ? tone === "red" ? "bg-red text-white" : "bg-green text-white" : "bg-inset text-ink-3 shadow-hairline"}`,
      style: { transform: included ? "scale(1)" : "scale(0.92)" },
      children: included ? /* @__PURE__ */ jsx("svg", { width: "11", height: "11", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "3", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ jsx("path", { d: "M20 6L9 17l-5-5" }) }) : null
    }
  );
}
function DiffTable({
  rows = ROWS
} = {}) {
  const stage = useStage(STAGE_DELAYS);
  const tinted = stage >= 1;
  const settled = stage >= 2;
  const [accepted, setAccepted] = useState(false);
  const [edits, setEdits] = useState({ rocky: true, bubblegum: true, pistachio: true });
  const removals = ["rocky", "bubblegum"].filter((key) => edits[key]).length;
  const additions = edits.pistachio ? 1 : 0;
  const showAdded = settled;
  const toggleEdit = (key) => setEdits((current) => ({ ...current, [key]: !current[key] }));
  return /* @__PURE__ */ jsx("div", { className: "w-full max-w-95", children: /* @__PURE__ */ jsxs("div", { className: "relative overflow-hidden rounded-card bg-surface shadow-card", children: [
    /* @__PURE__ */ jsxs("div", { className: "primitive-card-bar flex items-center justify-between border-b border-line", children: [
      /* @__PURE__ */ jsx("span", { className: "text-[12.5px] font-medium text-ink", children: "Proposed menu cleanup" }),
      settled && !accepted && /* @__PURE__ */ jsx("span", { className: "text-[11px] text-ink-3", children: "Click changed rows to toggle" })
    ] }),
    /* @__PURE__ */ jsxs("table", { className: "w-full table-fixed border-collapse text-left", children: [
      /* @__PURE__ */ jsxs("colgroup", { children: [
        /* @__PURE__ */ jsx("col", { className: "w-[34%]" }),
        /* @__PURE__ */ jsx("col", { className: "w-[30%]" }),
        /* @__PURE__ */ jsx("col", { className: "w-[36%]" })
      ] }),
      /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsx("tr", { className: "border-b border-line", children: ["Flavor", "Category", "Supplier"].map((h) => /* @__PURE__ */ jsx("th", { className: "primitive-table-cell text-[12px] font-medium text-ink-3", children: h }, h)) }) }),
      /* @__PURE__ */ jsxs("tbody", { children: [
        rows.map((row) => {
          const out = row.removed && tinted && edits[row.key];
          const interactive = row.removed && settled && !accepted;
          return /* @__PURE__ */ jsxs(
            "tr",
            {
              tabIndex: interactive ? 0 : void 0,
              "aria-selected": row.removed ? edits[row.key] : void 0,
              onClick: interactive ? () => toggleEdit(row.key) : void 0,
              onKeyDown: interactive ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  toggleEdit(row.key);
                }
              } : void 0,
              className: `border-b border-line transition-[background-color,filter,opacity] duration-150 last:border-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent ${interactive ? "cursor-pointer hover:brightness-[0.985]" : ""}`,
              style: { background: out ? "var(--red-tint)" : void 0 },
              children: [
                /* @__PURE__ */ jsx(
                  "td",
                  {
                    className: "primitive-table-cell text-[13px] font-medium tabular-nums transition-colors duration-200",
                    style: { color: out ? "var(--red)" : "var(--ink)" },
                    children: row.id
                  }
                ),
                /* @__PURE__ */ jsx("td", { className: "primitive-table-cell", children: /* @__PURE__ */ jsxs(
                  "span",
                  {
                    className: "inline-flex h-5.5 items-center gap-1.5 rounded-full bg-inset px-2 text-[11.5px] font-medium shadow-hairline transition-opacity duration-200",
                    style: { opacity: out ? 0.55 : 1 },
                    children: [
                      /* @__PURE__ */ jsx("span", { className: `size-1.5 rounded-full ${DOT[row.dept]}` }),
                      /* @__PURE__ */ jsx("span", { className: "text-ink-2", children: row.dept })
                    ]
                  }
                ) }),
                /* @__PURE__ */ jsx(
                  "td",
                  {
                    className: "primitive-table-cell text-[12.5px] whitespace-nowrap transition-colors duration-200",
                    style: {
                      color: out ? "var(--red)" : "var(--ink-2)",
                      textDecorationLine: out ? "line-through" : "none",
                      textDecorationColor: "color-mix(in srgb, var(--red) 50%, transparent)"
                    },
                    children: /* @__PURE__ */ jsxs("span", { className: "flex items-center justify-between gap-2", children: [
                      /* @__PURE__ */ jsx("span", { className: "min-w-0 truncate", children: row.email }),
                      row.removed && settled && /* @__PURE__ */ jsx(IncludedMark, { included: edits[row.key], tone: "red" })
                    ] })
                  }
                )
              ]
            },
            row.key
          );
        }),
        /* @__PURE__ */ jsx("tr", { children: /* @__PURE__ */ jsx("td", { colSpan: 3, className: "p-0", children: /* @__PURE__ */ jsx(
          "div",
          {
            className: "grid transition-[grid-template-rows,opacity] duration-200",
            style: {
              gridTemplateRows: showAdded ? "1fr" : "0fr",
              opacity: showAdded ? 1 : 0,
              transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)"
            },
            children: /* @__PURE__ */ jsx("div", { className: "overflow-hidden", children: /* @__PURE__ */ jsxs(
              "div",
              {
                role: "checkbox",
                tabIndex: accepted ? -1 : 0,
                "aria-checked": edits.pistachio,
                "aria-label": "Include adding Pistachio",
                onClick: accepted ? void 0 : () => toggleEdit("pistachio"),
                onKeyDown: accepted ? void 0 : (event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggleEdit("pistachio");
                  }
                },
                className: `grid grid-cols-[34%_30%_36%] items-center border-t border-line transition-[background-color,filter,opacity] duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent ${accepted ? "" : "cursor-pointer hover:brightness-[0.985]"}`,
                style: { background: edits.pistachio ? "var(--green-tint)" : void 0 },
                children: [
                  /* @__PURE__ */ jsx("span", { className: "primitive-table-cell text-[13px] font-medium tabular-nums transition-colors duration-200", style: { color: edits.pistachio ? "var(--green)" : "var(--ink-3)" }, children: "Pistachio" }),
                  /* @__PURE__ */ jsx("span", { className: "primitive-table-cell", children: /* @__PURE__ */ jsxs("span", { className: "inline-flex h-5.5 items-center gap-1.5 rounded-full bg-surface px-2 text-[11.5px] font-medium shadow-hairline", children: [
                    /* @__PURE__ */ jsx("span", { className: "size-1.5 rounded-full bg-green" }),
                    /* @__PURE__ */ jsx("span", { className: "text-ink-2", children: "Seasonal" })
                  ] }) }),
                  /* @__PURE__ */ jsx("span", { className: "primitive-table-cell text-[13px] transition-colors duration-200", style: { color: edits.pistachio ? "var(--green)" : "var(--ink-3)" }, children: /* @__PURE__ */ jsxs("span", { className: "flex items-center justify-between gap-2", children: [
                    /* @__PURE__ */ jsx("span", { className: "min-w-0 truncate", children: "maple-orbit" }),
                    /* @__PURE__ */ jsx(IncludedMark, { included: edits.pistachio, tone: "green" })
                  ] }) })
                ]
              }
            ) })
          }
        ) }) })
      ] })
    ] }),
    settled && /* @__PURE__ */ jsx(
      "div",
      {
        className: "primitive-card-footer flex min-h-11 items-center justify-between border-t border-line",
        style: { animation: "fade-up 180ms cubic-bezier(0.23,1,0.32,1) both" },
        children: accepted ? /* @__PURE__ */ jsxs(
          "span",
          {
            className: "inline-flex items-center gap-1.5 rounded-full bg-green-tint py-1 pr-2.5 pl-1 text-[12.5px] font-medium text-green",
            style: { animation: "pop-in 180ms cubic-bezier(0.23,1,0.32,1) both" },
            children: [
              /* @__PURE__ */ jsx("span", { className: "flex size-4.5 items-center justify-center rounded-full bg-green text-white", children: /* @__PURE__ */ jsx("svg", { width: "11", height: "11", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "3", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ jsx("path", { d: "M20 6L9 17l-5-5" }) }) }),
              removals + additions,
              " ",
              removals + additions === 1 ? "edit" : "edits",
              " applied"
            ]
          }
        ) : /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsxs("span", { className: "text-[11.5px] tabular-nums text-ink-3", children: [
            removals,
            " ",
            removals === 1 ? "removal" : "removals",
            " \xB7 ",
            additions,
            " ",
            additions === 1 ? "addition" : "additions"
          ] }),
          /* @__PURE__ */ jsx("span", { className: "flex items-center gap-1.5", children: /* @__PURE__ */ jsxs(
            Button,
            {
              variant: "accent",
              size: "sm",
              disabled: removals + additions === 0,
              onClick: () => {
                setAccepted(true);
              },
              className: "text-[12px]",
              children: [
                "Apply ",
                removals + additions,
                " ",
                removals + additions === 1 ? "change" : "changes"
              ]
            }
          ) })
        ] })
      }
    )
  ] }) });
}
export {
  DiffTable as default
};
