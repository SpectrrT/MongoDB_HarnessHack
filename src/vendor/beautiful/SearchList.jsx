// Adapted from the original publicly provided Beautiful UI source. See THIRD_PARTY.md.
"use client";
import { jsx, jsxs } from "react/jsx-runtime";
import { useState } from "react";
import GlideMenu from "../../components/primitives";
const ITEMS = [
  "Forecast summer demand",
  "Find waffle cone suppliers",
  "Compare seasonal flavors",
  "Draft flavor launch plan",
  "Check cold-chain status",
  "Audit sugar costs",
  "Retire low sellers"
];
const LABELS = {
  placeholder: "Search flavors\u2026",
  ariaLabel: "Search flavors",
  emptyTitle: "No results found",
  emptyHint: "Adjust your search to try again"
};
function SearchList({
  items = ITEMS,
  labels = LABELS
} = {}) {
  const [query, setQuery] = useState("");
  const results = query ? items.filter((i) => i.toLowerCase().includes(query.toLowerCase())) : items.slice(0, 5);
  const empty = query.length > 2 && results.length === 0;
  return /* @__PURE__ */ jsx("div", { className: "flex min-h-[248px] w-full max-w-72 flex-col items-stretch", children: /* @__PURE__ */ jsxs("div", { className: "w-full self-start overflow-hidden rounded-card bg-surface shadow-raised", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex h-10 items-center gap-2 border-b border-line px-3 transition-colors duration-100 hover:bg-hover", children: [
      /* @__PURE__ */ jsxs("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "var(--ink-3)", strokeWidth: "2", strokeLinecap: "round", className: "shrink-0", children: [
        /* @__PURE__ */ jsx("circle", { cx: "11", cy: "11", r: "7" }),
        /* @__PURE__ */ jsx("path", { d: "M21 21l-4.3-4.3" })
      ] }),
      /* @__PURE__ */ jsx(
        "input",
        {
          value: query,
          onChange: (event) => setQuery(event.target.value),
          placeholder: labels.placeholder,
          "aria-label": labels.ariaLabel,
          className: "min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3"
        }
      ),
      query && /* @__PURE__ */ jsx(
        "button",
        {
          "aria-label": "Clear search",
          type: "button",
          onClick: () => setQuery(""),
          className: "flex size-6 items-center justify-center rounded-full text-ink-3\n                transition-colors duration-100 hover:bg-line/70 hover:text-ink",
          style: { animation: "fade-in 150ms ease-out both" },
          children: /* @__PURE__ */ jsx("svg", { width: "11", height: "11", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.2", strokeLinecap: "round", children: /* @__PURE__ */ jsx("path", { d: "M18 6L6 18M6 6l12 12" }) })
        }
      )
    ] }),
    empty ? /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-center justify-center gap-1 px-4 py-8", style: { animation: "fade-in 250ms ease-out both" }, children: [
      /* @__PURE__ */ jsx("span", { className: "mb-1.5 flex size-8 items-center justify-center rounded-control bg-inset text-ink-3 shadow-hairline", children: /* @__PURE__ */ jsxs("svg", { width: "15", height: "15", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", children: [
        /* @__PURE__ */ jsx("circle", { cx: "11", cy: "11", r: "7" }),
        /* @__PURE__ */ jsx("path", { d: "M21 21l-4.3-4.3" })
      ] }) }),
      /* @__PURE__ */ jsx("span", { className: "text-[13px] font-medium text-ink", children: labels.emptyTitle }),
      /* @__PURE__ */ jsx("span", { className: "text-[12px] text-ink-3", children: labels.emptyHint })
    ] }) : /* @__PURE__ */ jsx("div", { className: "p-1", children: /* @__PURE__ */ jsx(GlideMenu, { className: "flex flex-col gap-px", highlightClassName: "inset-x-0 rounded-[6px] bg-hover", children: results.map((item) => /* @__PURE__ */ jsx(
      "button",
      {
        "data-menu-row": true,
        type: "button",
        onClick: () => setQuery(item),
        className: "relative z-10 flex h-8 w-full items-center rounded-[6px] px-2 text-left text-[13px] text-ink",
        style: { animation: "fade-in 200ms ease-out both" },
        children: item
      },
      item
    )) }) })
  ] }) });
}
export {
  SearchList as default
};
