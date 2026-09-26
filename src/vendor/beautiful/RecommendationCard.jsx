// Adapted from the original publicly provided Beautiful UI source. See THIRD_PARTY.md.
"use client";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Button } from "../../components/primitives";
import { EntityChip } from "../../components/primitives";
import { ValuePill } from "../../components/primitives";
const DEFAULT_LABELS = {
  title: "Want me to place this restock order?",
  alternatives: "Alternatives",
  otherOptions: "Other options",
  accepted: "Accepted"
};
const OPTIONS = [
  {
    key: "high",
    body: /* @__PURE__ */ jsxs(Fragment, { children: [
      "Reorder waffle cones from",
      " ",
      /* @__PURE__ */ jsx(EntityChip, { name: "Cone King" }),
      " ",
      "with lead time ",
      /* @__PURE__ */ jsx(ValuePill, { tone: "green", children: "7 days" })
    ] }),
    short: "Reorder from Cone King \xB7 7-day lead",
    signal: 3,
    tone: "var(--green)",
    label: "High confidence",
    cta: "Accept",
    ctaVariant: "accent"
  },
  {
    key: "review",
    body: /* @__PURE__ */ jsxs(Fragment, { children: [
      "Switch vanilla to ",
      /* @__PURE__ */ jsx(ValuePill, { children: "Vanilla Madagascar" }),
      " for peak season."
    ] }),
    short: "Switch to Vanilla Madagascar",
    signal: 2,
    tone: "var(--orange)",
    label: "Needs review",
    cta: "Configure",
    ctaVariant: "primary"
  },
  {
    key: "none",
    body: /* @__PURE__ */ jsxs(Fragment, { children: [
      "Fall back to a ",
      /* @__PURE__ */ jsx("span", { className: "font-medium text-ink", children: "full restock" }),
      " across every SKU."
    ] }),
    short: "Full restock across every SKU",
    signal: 0,
    tone: "var(--ink-3)",
    label: "No signal",
    cta: "Accept full restock",
    ctaVariant: "primary"
  }
];
function Meter({ signal, tone }) {
  return /* @__PURE__ */ jsx("span", { className: "flex items-end gap-0.5", children: [0, 1, 2].map((bar) => /* @__PURE__ */ jsx(
    "span",
    {
      className: "w-1 rounded-full transition-colors duration-300",
      style: { height: 10, background: bar < signal ? tone : "var(--line-strong)" }
    },
    bar
  )) });
}
function RecommendationCard({
  options = OPTIONS,
  labels
} = {}) {
  const t = { ...DEFAULT_LABELS, ...labels };
  const [selected, setSelected] = useState(0);
  const [open, setOpen] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const active = options[selected];
  const others = options.map((o, i) => ({ o, i })).filter(({ i }) => i !== selected);
  return /* @__PURE__ */ jsxs("div", { className: "w-full max-w-95 overflow-hidden rounded-card bg-surface shadow-card", children: [
    /* @__PURE__ */ jsxs("div", { className: "primitive-card-pad", children: [
      /* @__PURE__ */ jsx("span", { className: "text-[14px] font-medium text-ink", children: t.title }),
      /* @__PURE__ */ jsx(
        "p",
        {
          className: "mt-1.5 min-h-12 text-[13px] leading-relaxed text-ink-2",
          style: { animation: "fade-in 180ms ease-out both" },
          children: active.body
        },
        active.key
      )
    ] }),
    /* @__PURE__ */ jsx(
      "div",
      {
        className: "grid transition-[grid-template-rows,opacity] duration-300",
        style: {
          gridTemplateRows: open ? "1fr" : "0fr",
          opacity: open ? 1 : 0,
          transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)"
        },
        children: /* @__PURE__ */ jsx("div", { className: "overflow-hidden", children: /* @__PURE__ */ jsxs("div", { className: "border-t border-line bg-surface px-2 py-2", children: [
          /* @__PURE__ */ jsx("p", { className: "px-1.5 pb-1 text-[11px] font-medium text-ink-3", children: t.otherOptions }),
          others.map(({ o, i }) => /* @__PURE__ */ jsxs(
            "button",
            {
              type: "button",
              onClick: () => {
                setSelected(i);
                setAccepted(false);
              },
              className: "flex w-full items-center gap-2.5 rounded-control px-1.5 py-1.5\n                  text-left transition-colors duration-100 hover:bg-hover",
              children: [
                /* @__PURE__ */ jsx(Meter, { signal: o.signal, tone: o.tone }),
                /* @__PURE__ */ jsx("span", { className: "min-w-0 flex-1 truncate text-[12.5px] text-ink", children: o.short }),
                /* @__PURE__ */ jsx("span", { className: "shrink-0 text-[11px] text-ink-3", children: o.label })
              ]
            },
            o.key
          ))
        ] }) })
      }
    ),
    /* @__PURE__ */ jsxs("div", { className: "primitive-card-footer flex items-center justify-between gap-3 bg-surface", children: [
      /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsx(Meter, { signal: active.signal, tone: active.tone }),
        /* @__PURE__ */ jsx("span", { className: "text-[12.5px] font-medium text-ink-2", children: active.label })
      ] }),
      /* @__PURE__ */ jsxs("span", { className: "-mr-0.5 flex items-center gap-2", children: [
        /* @__PURE__ */ jsx(
          Button,
          {
            variant: "secondary",
            size: "sm",
            "aria-expanded": open,
            onClick: () => setOpen((current) => !current),
            className: "px-2.5 text-[12.5px]",
            children: t.alternatives
          }
        ),
        /* @__PURE__ */ jsx(
          Button,
          {
            variant: accepted ? "success" : active.ctaVariant,
            size: "sm",
            onClick: () => setAccepted(true),
            className: "text-[12.5px]",
            children: accepted ? t.accepted : active.cta
          }
        )
      ] })
    ] })
  ] });
}
export {
  RecommendationCard as default
};
