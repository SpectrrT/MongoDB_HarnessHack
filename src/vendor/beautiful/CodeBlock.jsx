// Adapted from the original publicly provided Beautiful UI source. See THIRD_PARTY.md.
"use client";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { useCallback, useState } from "react";
const FILE = "churn.ts";
const CODE_LINES = [
  "export async function churnBatch() {",
  '  const flavor = await getFlavor("pistachio");',
  "  const base = await dairy.fetch({ flavor });",
  '  await freezer.store(base, { temp: "-16C" });',
  "  if (!base.approved) return null;",
  "  return base.gallons;",
  "}"
];
const DIFF = [
  { old: 1, cur: 1, type: "ctx", pieces: [{ text: "export async function churnBatch() {" }] },
  { old: 2, cur: 2, type: "ctx", pieces: [{ text: '  const flavor = await getFlavor("pistachio");' }] },
  { old: 3, cur: 3, type: "ctx", pieces: [{ text: "  const base = await dairy.fetch({ flavor });" }] },
  { old: 4, cur: null, type: "del", pieces: [{ text: "  await freezer.store(base, { temp: " }, { text: '"-14C"', change: "del" }, { text: " });" }] },
  { old: null, cur: 4, type: "add", pieces: [{ text: "  await freezer.store(base, { temp: " }, { text: '"-16C"', change: "add" }, { text: " });" }] },
  { old: null, cur: 5, type: "add", pieces: [{ text: "  if (!base.approved) return null;" }] },
  { old: 5, cur: 6, type: "ctx", pieces: [{ text: "  return base.gallons;" }] },
  { old: 6, cur: 7, type: "ctx", pieces: [{ text: "}" }] }
];
const HATCH = "repeating-linear-gradient(45deg, var(--red) 0, var(--red) 1.5px, transparent 1.5px, transparent 3px)";
const KEYWORDS = /* @__PURE__ */ new Set(["import", "from", "export", "default", "async", "function", "const", "let", "var", "await", "return", "if", "else", "for", "while", "new", "throw", "try", "catch", "null", "true", "false", "undefined"]);
const TOKEN = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`[^`]*`|\b\d+(?:\.\d+)?\b|\b(?:import|from|export|default|async|function|const|let|var|await|return|if|else|for|while|new|throw|try|catch|null|true|false|undefined)\b|[A-Za-z_$][\w$]*(?=\s*\())/g;
function highlight(text) {
  const nodes = [];
  let last = 0;
  let k = 0;
  for (const m of text.matchAll(TOKEN)) {
    const idx = m.index ?? 0;
    const t = m[0];
    if (idx > last) nodes.push(/* @__PURE__ */ jsx("span", { children: text.slice(last, idx) }, k++));
    let color;
    let weight;
    if (/^["'`]/.test(t) || /^\d/.test(t)) color = "var(--orange)";
    else if (KEYWORDS.has(t)) color = "var(--accent-ink)";
    else {
      color = "var(--ink)";
      weight = 500;
    }
    nodes.push(/* @__PURE__ */ jsx("span", { style: { color, fontWeight: weight }, children: t }, k++));
    last = idx + t.length;
  }
  if (last < text.length) nodes.push(/* @__PURE__ */ jsx("span", { children: text.slice(last) }, k++));
  return nodes;
}
function Pieces({ pieces }) {
  return /* @__PURE__ */ jsx(Fragment, { children: pieces.map((p, i) => {
    if (p.change) {
      const add = p.change === "add";
      return /* @__PURE__ */ jsx(
        "span",
        {
          className: "rounded-[3px]",
          style: {
            background: `color-mix(in srgb, var(--${add ? "green" : "red"}) 18%, transparent)`,
            padding: "0 2px",
            margin: "0 -1px",
            boxDecorationBreak: "clone",
            WebkitBoxDecorationBreak: "clone"
          },
          children: highlight(p.text)
        },
        i
      );
    }
    return /* @__PURE__ */ jsx("span", { children: highlight(p.text) }, i);
  }) });
}
function FileIcon() {
  return /* @__PURE__ */ jsx("svg", { "aria-hidden": true, width: "15", height: "15", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", className: "shrink-0 text-ink-3", children: /* @__PURE__ */ jsx("path", { d: "M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" }) });
}
const DEFAULT_LABELS = { copy: "Copy", copied: "Copied" };
function CodeBlock({
  variant = "Code",
  lines = CODE_LINES,
  code,
  diff = DIFF,
  filename = FILE,
  labels,
  onCopy
}) {
  const [copied, setCopied] = useState(false);
  const isDiff = variant === "Diff";
  const text = { ...DEFAULT_LABELS, ...labels };
  const raw = code ?? lines.join("\n");
  const copy = useCallback(() => {
    navigator.clipboard.writeText(raw).then(() => {
      setCopied(true);
      onCopy?.(raw);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [raw, onCopy]);
  const added = diff.filter((r) => r.type === "add").length;
  const removed = diff.filter((r) => r.type === "del").length;
  return /* @__PURE__ */ jsxs("div", { className: "w-full max-w-105 overflow-hidden rounded-card bg-surface shadow-card", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex h-11 items-center gap-2 border-b border-line px-4 text-[12.5px]", children: [
      /* @__PURE__ */ jsxs("span", { className: "inline-flex min-w-0 items-center gap-[7px]", children: [
        /* @__PURE__ */ jsx(FileIcon, {}),
        /* @__PURE__ */ jsx("span", { className: "truncate font-mono leading-none text-ink", children: filename })
      ] }),
      isDiff ? /* @__PURE__ */ jsxs("span", { className: "ml-auto inline-flex items-center gap-2 font-mono text-[12px] leading-none tabular-nums", children: [
        /* @__PURE__ */ jsxs("span", { className: "text-green", children: [
          "+",
          added
        ] }),
        /* @__PURE__ */ jsxs("span", { className: "text-red", children: [
          "-",
          removed
        ] })
      ] }) : /* @__PURE__ */ jsxs(
        "button",
        {
          type: "button",
          "aria-label": "Copy code",
          onClick: copy,
          className: `-mr-1 ml-auto flex h-6 items-center gap-1 rounded-[6px] px-1.5 text-[12px]
              font-medium transition-colors duration-100 hover:bg-hover
              ${copied ? "text-green" : "text-ink-3 hover:text-ink"}`,
          children: [
            copied ? /* @__PURE__ */ jsx("svg", { width: "11", height: "11", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "3", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ jsx("path", { d: "M20 6L9 17l-5-5" }) }) : /* @__PURE__ */ jsxs("svg", { width: "11", height: "11", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
              /* @__PURE__ */ jsx("rect", { x: "9", y: "9", width: "12", height: "12", rx: "2.5" }),
              /* @__PURE__ */ jsx("path", { d: "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" })
            ] }),
            copied ? text.copied : text.copy
          ]
        }
      )
    ] }),
    /* @__PURE__ */ jsx("div", { className: "py-3 font-mono text-[12.5px] leading-[1.65] text-ink-2", children: isDiff ? /* @__PURE__ */ jsxs("div", { className: "relative", children: [
      /* @__PURE__ */ jsx("span", { className: "pointer-events-none absolute inset-y-0 left-5 w-px bg-line" }),
      diff.map((r, i) => {
        const add = r.type === "add";
        const del = r.type === "del";
        const num = del ? r.old : r.cur;
        return /* @__PURE__ */ jsxs(
          "div",
          {
            className: `relative grid grid-cols-[20px_minmax(0,1fr)] items-start
                    ${add ? "bg-green-tint" : del ? "bg-red-tint" : ""}`,
            children: [
              (add || del) && /* @__PURE__ */ jsx("span", { className: "absolute inset-y-0 left-0 w-[3px]", style: { background: add ? "var(--green)" : HATCH } }),
              /* @__PURE__ */ jsx("span", { className: `select-none text-center text-[11px] ${add ? "text-green" : del ? "text-red" : "text-ink-3"}`, children: num ?? "" }),
              /* @__PURE__ */ jsx("code", { className: "pr-3 pl-1 break-words whitespace-pre-wrap", children: /* @__PURE__ */ jsx(Pieces, { pieces: r.pieces }) })
            ]
          },
          i
        );
      })
    ] }) : /* @__PURE__ */ jsxs("div", { className: "relative", children: [
      /* @__PURE__ */ jsx("span", { className: "pointer-events-none absolute inset-y-0 left-5 w-px bg-line" }),
      lines.map((line, i) => /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-[20px_minmax(0,1fr)] items-start", children: [
        /* @__PURE__ */ jsx("span", { className: "select-none text-center text-[11px] text-ink-3", children: i + 1 }),
        /* @__PURE__ */ jsx("code", { className: "pr-3 pl-1 break-words whitespace-pre-wrap", children: highlight(line) })
      ] }, i))
    ] }) })
  ] });
}
export {
  CodeBlock as default
};
