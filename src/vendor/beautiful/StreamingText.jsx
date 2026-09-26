// Adapted from the original publicly provided Beautiful UI source. See THIRD_PARTY.md.
"use client";
import { jsx, jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import MarkdownContent from "../../components/MarkdownContent";
import "../../response-markdown.css";
const WORD_MS = 55;
const HOLD_MS = 3400;
const TOKENS = [
  ..."Pistachio is your fastest-growing flavor \u2014 sales are up 23% this month and margins beat vanilla by 8 points.".split(" ").map((text) => ({ text })),
  { text: "", cite: true },
  ..."Stone-fruit flavors are trending in the same range.".split(" ").map((text) => ({ text }))
];
const FOLLOW_UPS = [
  "Which flavors sell best in winter",
  "Compare gelato and soft serve margins"
];
const SOURCE_IMAGES = {
  scoop: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='16' fill='%231f7a5f'/%3E%3Cpath d='M20 36c0 7 5.4 12 12 12s12-5 12-12H20Z' fill='%23fff'/%3E%3Ccircle cx='32' cy='25' r='11' fill='%23bff3dd'/%3E%3Cpath d='M24 24c4-7 13-7 17 0' fill='none' stroke='%231f7a5f' stroke-width='4' stroke-linecap='round'/%3E%3C/svg%3E",
  trends: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='16' fill='%232f6fec'/%3E%3Cpath d='M15 43 27 31l8 7 14-18' fill='none' stroke='%23fff' stroke-width='7' stroke-linecap='round' stroke-linejoin='round'/%3E%3Ccircle cx='49' cy='20' r='5' fill='%23bfe0ff'/%3E%3C/svg%3E",
  market: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='16' fill='%23e56d24'/%3E%3Cpath d='M17 45V25h8v20h-8Zm11 0V16h8v29h-8Zm11 0V30h8v15h-8Z' fill='%23fff'/%3E%3Cpath d='M16 49h32' stroke='%23ffd6b8' stroke-width='4' stroke-linecap='round'/%3E%3C/svg%3E"
};
const SOURCES = [
  { name: "Scoop Data", domain: "scoopdata.io", href: "https://scoopdata.io/", image: SOURCE_IMAGES.scoop },
  { name: "Trends Index", domain: "trends.google.com", href: "https://trends.google.com/trends/", image: SOURCE_IMAGES.trends },
  { name: "Market Basket", domain: "marketbasket.io", href: "https://marketbasket.io/", image: SOURCE_IMAGES.market }
];
function sourceImage(source) {
  return source.image;
}
function SourceChip({ source }) {
  if (!source) return null;
  return /* @__PURE__ */ jsxs(
    "a",
    {
      href: source.href,
      target: "_blank",
      rel: "noreferrer",
      className: "ml-0 mr-1 inline-flex h-4.5 translate-y-[-1px] items-center gap-1 rounded-[5px]\n        bg-inset pr-[3px] pl-[3px] align-middle font-mono text-[10.5px] text-ink-2 shadow-hairline\n        transition-colors duration-150 hover:bg-hover hover:text-ink",
      style: { animation: "pop-in 250ms cubic-bezier(0.23,1,0.32,1) both" },
      children: [
        /* @__PURE__ */ jsx("img", { src: sourceImage(source), alt: "", className: "source-avatar size-3 rounded-[3px]" }),
        /* @__PURE__ */ jsx("span", { children: source.domain })
      ]
    }
  );
}
const ACTION_ICONS = [
  /* @__PURE__ */ jsxs("g", { children: [
    /* @__PURE__ */ jsx("rect", { x: "9", y: "9", width: "12", height: "12", rx: "2.5" }),
    /* @__PURE__ */ jsx("path", { d: "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" })
  ] }, "copy"),
  /* @__PURE__ */ jsx("path", { d: "M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" }, "retry"),
  /* @__PURE__ */ jsx("path", { d: "M7 10v12M15 5.88L14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88z" }, "up"),
  /* @__PURE__ */ jsx("path", { d: "M17 14V2M9 18.12L10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88z" }, "down")
];
const DEFAULT_LABELS = {
  sources: "10 sources",
  followUps: "Follow-ups"
};
function StreamingText({
  live = false,
  content = TOKENS,
  sources = SOURCES,
  followUps = FOLLOW_UPS,
  labels,
  loop = true,
  fill = false,
  onDone,
  onFollowUp
} = {}) {
  const l = { ...DEFAULT_LABELS, ...labels };
  const [count, setCount] = useState(live ? content.length : 0);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const done = live || count >= content.length;
  useEffect(() => {
    if (live) return;
    if (done && !loop) {
      onDone?.();
      return;
    }
    const t = setTimeout(
      () => setCount((c) => c >= content.length ? 0 : c + 1),
      done ? HOLD_MS : WORD_MS
    );
    return () => clearTimeout(t);
  }, [count, done, loop]);
  return /* @__PURE__ */ jsxs("div", { className: fill ? "w-full" : "min-h-[15.5rem] w-full max-w-95", children: [
    live ? /* @__PURE__ */ jsx(MarkdownContent, { text: content.filter((token) => !token.cite).map((token) => token.text).join(" ") }) : /* @__PURE__ */ jsxs("p", { className: "whitespace-pre-wrap text-[13px] leading-relaxed text-ink", children: [
      content.slice(0, count).map(
        (token, i) => token.cite ? /* @__PURE__ */ jsx(SourceChip, { source: sources[0] }, i) : /* @__PURE__ */ jsxs("span", { className: "inline", children: [
          token.text,
          " "
        ] }, i)
      ),
      !done && /* @__PURE__ */ jsx(
        "span",
        {
          className: "ml-0.5 inline-block h-3 w-0.5 translate-y-0.5 rounded-full bg-ink",
          style: { animation: "fade-in 150ms ease-out both" }
        }
      )
    ] }),
    /* @__PURE__ */ jsxs(
      "div",
      {
        className: "mt-2 flex items-center gap-0.5 transition-opacity duration-400",
        style: { opacity: done ? 1 : 0, pointerEvents: done ? "auto" : "none" },
        children: [
          ACTION_ICONS.filter((_, i) => !live || i === 0).map((icon, i) => /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              "aria-label": i === 0 ? "Copy response" : "Action",
              onClick: () => {
                if (i === 0) navigator.clipboard.writeText(content.map((t) => t.text).join(" ")).catch(() => {
                });
              },
              className: "flex size-6 items-center justify-center rounded-[6px] text-ink-3\n              transition-colors duration-100 hover:bg-hover-2 hover:text-ink-2",
              children: /* @__PURE__ */ jsx("svg", { width: "15", height: "15", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", children: icon })
            },
            i
          )),
          /* @__PURE__ */ jsxs(
            "button",
            {
              type: "button",
              hidden: !sources.length,
              "aria-expanded": sourcesOpen,
              onClick: () => setSourcesOpen((current) => !current),
              className: "ml-1.5 flex items-center gap-1.5 rounded-[6px] px-1 py-0.5 text-left transition-colors duration-150 hover:bg-hover",
              children: [
                /* @__PURE__ */ jsx("span", { className: "flex -space-x-1", children: sources.map((source) => /* @__PURE__ */ jsx(
                  "img",
                  {
                    src: sourceImage(source),
                    alt: "",
                    className: "source-avatar size-3.5 rounded-full bg-surface shadow-[0_0_0_1.5px_var(--canvas)]"
                  },
                  source.domain
                )) }),
                /* @__PURE__ */ jsx("span", { className: "text-[12px] text-ink-2", children: l.sources })
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
        style: {
          gridTemplateRows: done && sourcesOpen ? "1fr" : "0fr",
          opacity: done && sourcesOpen ? 1 : 0,
          transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)"
        },
        children: /* @__PURE__ */ jsx("div", { className: "overflow-hidden", children: /* @__PURE__ */ jsx("div", { className: "mt-1.5 flex flex-col rounded-[10px] bg-inset p-1 shadow-hairline", children: sources.map((source) => /* @__PURE__ */ jsxs(
          "a",
          {
            href: source.href,
            target: "_blank",
            rel: "noreferrer",
            className: "flex items-center gap-2 rounded-[6px] px-1.5 py-1 text-[12px] text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink",
            children: [
              /* @__PURE__ */ jsx("img", { src: sourceImage(source), alt: "", className: "source-avatar size-4 rounded-[4px]" }),
              /* @__PURE__ */ jsx("span", { className: "animated-underline", children: source.name }),
              /* @__PURE__ */ jsx("span", { className: "ml-auto font-mono text-[10.5px] text-ink-3", children: source.domain })
            ]
          },
          source.domain
        )) }) })
      }
    ),
    /* @__PURE__ */ jsxs(
      "div",
      {
        className: "mt-2.5 transition-opacity duration-400",
        style: { opacity: done ? 1 : 0, pointerEvents: done ? "auto" : "none" },
        children: [
          followUps.length > 0 && /* @__PURE__ */ jsx("p", { className: "text-[12px] font-medium text-ink-2", children: l.followUps }),
          /* @__PURE__ */ jsx("div", { className: "mt-0.5 flex flex-col", children: followUps.map((text, i) => /* @__PURE__ */ jsxs(
            "button",
            {
              onClick: () => onFollowUp?.(text, i),
              className: "-mx-1.5 flex items-center gap-2 rounded-[7px] border-b border-line\n                px-1.5 py-1.5 text-left text-[12.5px] text-ink transition-colors\n                duration-100 hover:bg-hover-2",
              style: done ? { animation: `fade-up 350ms cubic-bezier(0.23,1,0.32,1) ${i * 90}ms both` } : { opacity: 0 },
              children: [
                /* @__PURE__ */ jsxs("svg", { width: "11", height: "11", viewBox: "0 0 24 24", fill: "none", stroke: "var(--ink-3)", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", className: "shrink-0", children: [
                  /* @__PURE__ */ jsx("path", { d: "M9 10l-5 5 5 5" }),
                  /* @__PURE__ */ jsx("path", { d: "M20 4v7a4 4 0 0 1-4 4H4" })
                ] }),
                text
              ]
            },
            text
          )) })
        ]
      }
    )
  ] });
}
export {
  StreamingText as default
};
