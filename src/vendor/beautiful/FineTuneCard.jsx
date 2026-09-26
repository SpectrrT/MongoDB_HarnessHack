// Adapted from the original publicly provided Beautiful UI source. See THIRD_PARTY.md.
"use client";
import { jsx, jsxs } from "react/jsx-runtime";
import { useRef, useState } from "react";
import GlideMenu from "../../components/primitives";
function ScrubField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix = "",
  active
}) {
  const drag = useRef(null);
  const clamp = (v) => Math.min(max, Math.max(min, Math.round(v)));
  return /* @__PURE__ */ jsxs(
    "label",
    {
      className: "flex h-6.5 min-w-0 items-center gap-1 rounded-chip py-1 pr-1 pl-0.5\n        transition-[background-color,box-shadow] duration-200",
      style: {
        background: active ? "var(--accent-tint)" : "var(--field)",
        boxShadow: active ? "0 0 0 1px var(--accent)" : "none"
      },
      children: [
        /* @__PURE__ */ jsx(
          "span",
          {
            role: "slider",
            "aria-label": label,
            "aria-valuenow": value,
            "aria-valuemin": min,
            "aria-valuemax": max,
            tabIndex: 0,
            onPointerDown: (e) => {
              e.target.setPointerCapture(e.pointerId);
              drag.current = { x: e.clientX, v: value };
            },
            onPointerMove: (e) => {
              if (!drag.current) return;
              onChange(clamp(drag.current.v + (e.clientX - drag.current.x) / 2 * step));
            },
            onPointerUp: () => drag.current = null,
            onKeyDown: (e) => {
              const mult = e.shiftKey ? 10 : 1;
              if (e.key === "ArrowUp" || e.key === "ArrowRight") {
                e.preventDefault();
                onChange(clamp(value + step * mult));
              } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
                e.preventDefault();
                onChange(clamp(value - step * mult));
              }
            },
            className: "flex h-full shrink-0 cursor-ew-resize touch-none items-center rounded-[4px]\n          px-0.5 text-[12px] text-ink-3 select-none hover:text-ink-2 focus-visible:text-accent-ink\n          focus-visible:outline-none",
            children: label
          }
        ),
        /* @__PURE__ */ jsx(
          "input",
          {
            inputMode: "numeric",
            value,
            onChange: (e) => {
              const n = Number(e.target.value.replace(/[^\d-]/g, ""));
              if (!Number.isNaN(n)) onChange(clamp(n));
            },
            "aria-label": `${label} value`,
            className: "min-w-0 flex-1 bg-transparent text-[12px] text-ink tabular-nums outline-none"
          }
        ),
        suffix && /* @__PURE__ */ jsx("span", { className: "shrink-0 pr-0.5 text-[11.5px] text-ink-3", children: suffix })
      ]
    }
  );
}
const SEGMENTS = ["row", "col", "grid"];
function SegmentIcon({ kind }) {
  const dot = "size-1.5 rounded-[2px] border-[1.2px] border-current";
  if (kind === "row")
    return /* @__PURE__ */ jsx("span", { className: "flex gap-0.5", children: [0, 1, 2].map((i) => /* @__PURE__ */ jsx("span", { className: dot }, i)) });
  if (kind === "col")
    return /* @__PURE__ */ jsx("span", { className: "flex flex-col gap-0.5", children: [0, 1].map((i) => /* @__PURE__ */ jsx("span", { className: dot }, i)) });
  return /* @__PURE__ */ jsx("span", { className: "grid grid-cols-2 gap-0.5", children: [0, 1, 2, 3].map((i) => /* @__PURE__ */ jsx("span", { className: dot }, i)) });
}
const FIELDS = [
  { key: "width", label: "W", value: 324, min: 40, max: 999 },
  { key: "height", label: "H", value: 96, min: 24, max: 999 },
  { key: "radius", label: "Radius", value: 28, min: 0, max: 64 },
  { key: "opacity", label: "Opacity", value: 100, min: 0, max: 100, suffix: "%" }
];
const OPTIONS = ["Seasonal", "Classic", "Limited"];
const DEFAULT_LABELS = {
  title: "Flavor card",
  layout: "Layout",
  type: "Type",
  placeholder: "Select type",
  adjust: "Adjust",
  edited: "Edited"
};
function chunk(items, size) {
  const rows = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}
function FineTuneCard({
  fields = FIELDS,
  options = OPTIONS,
  labels,
  onChange
}) {
  const text = { ...DEFAULT_LABELS, ...labels };
  const [seg, setSeg] = useState(0);
  const [values, setValues] = useState(
    () => Object.fromEntries(fields.map((f) => [f.key, f.value]))
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [typeValue, setTypeValue] = useState(text.placeholder);
  const selectSeg = (i) => {
    setSeg(i);
    onChange?.({ segment: i, values, type: typeValue });
  };
  const setValue = (key, v) => {
    setValues((current) => {
      const next = { ...current, [key]: v };
      onChange?.({ segment: seg, values: next, type: typeValue });
      return next;
    });
  };
  const selectType = (value) => {
    setTypeValue(value);
    setMenuOpen(false);
    onChange?.({ segment: seg, values, type: value });
  };
  const changed = fields.some((f) => values[f.key] !== f.value);
  const done = seg !== 0 || changed || typeValue !== text.placeholder;
  return /* @__PURE__ */ jsxs("div", { className: "relative w-full max-w-60 rounded-card bg-surface shadow-raised", children: [
    /* @__PURE__ */ jsxs("div", { className: "primitive-card-bar flex items-center justify-between border-b border-line", children: [
      /* @__PURE__ */ jsx("span", { className: "text-[13px] font-medium text-ink", children: text.title }),
      done ? /* @__PURE__ */ jsxs(
        "span",
        {
          className: "flex items-center gap-1.5 text-[12px] font-medium text-green",
          style: { animation: "pop-in 250ms cubic-bezier(0.23,1,0.32,1) both" },
          children: [
            /* @__PURE__ */ jsx("svg", { width: "10", height: "10", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "3", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ jsx("path", { d: "M20 6L9 17l-5-5" }) }),
            text.edited
          ]
        }
      ) : /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1.5", children: [
        /* @__PURE__ */ jsx("span", { className: "flex size-4.5 items-center justify-center rounded-[5px] border border-accent/30 bg-accent-tint", children: /* @__PURE__ */ jsx("svg", { width: "9", height: "9", viewBox: "0 0 24 24", fill: "var(--accent)", children: /* @__PURE__ */ jsx("path", { d: "M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" }) }) }),
        /* @__PURE__ */ jsx(
          "span",
          {
            className: "bg-clip-text text-[12px] font-medium text-transparent",
            style: {
              backgroundImage: "linear-gradient(90deg, var(--accent) 35%, var(--accent-ink) 50%, var(--accent) 65%)",
              backgroundSize: "200% 100%",
              animation: "shimmer-text 1.4s linear infinite"
            },
            children: text.adjust
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "primitive-card-pad flex flex-col gap-2 border-b border-line", children: [
      /* @__PURE__ */ jsx("p", { className: "text-[12.5px] font-medium text-ink", children: text.layout }),
      /* @__PURE__ */ jsxs("div", { className: "relative grid grid-cols-3 rounded-control bg-field p-0.5", children: [
        /* @__PURE__ */ jsx(
          "span",
          {
            "aria-hidden": true,
            className: "absolute inset-y-0.5 rounded-[6px] bg-surface shadow-btn transition-transform duration-300",
            style: {
              width: "calc((100% - 4px) / 3)",
              left: 2,
              transform: `translateX(${seg * 100}%)`,
              transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)"
            }
          }
        ),
        SEGMENTS.map((s, i) => /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            "aria-label": `${s} layout`,
            "aria-pressed": i === seg,
            onClick: () => selectSeg(i),
            className: `relative z-10 flex h-6 items-center justify-center transition-colors duration-200
                ${i === seg ? "text-accent" : "text-ink-3"}`,
            children: /* @__PURE__ */ jsx(SegmentIcon, { kind: s })
          },
          s
        ))
      ] }),
      chunk(fields, 2).map((pair, ri) => /* @__PURE__ */ jsx("div", { className: "grid min-w-0 grid-cols-2 gap-2", children: pair.map((f) => /* @__PURE__ */ jsx(
        ScrubField,
        {
          label: f.label,
          value: values[f.key],
          onChange: (v) => setValue(f.key, v),
          min: f.min,
          max: f.max,
          step: f.step,
          suffix: f.suffix,
          active: values[f.key] !== f.value
        },
        f.key
      )) }, ri))
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "primitive-card-footer flex items-center justify-between", children: [
      /* @__PURE__ */ jsx("span", { className: "text-[12px] text-ink-3", children: text.type }),
      /* @__PURE__ */ jsxs("div", { className: "relative -mr-0.5 w-30", children: [
        /* @__PURE__ */ jsxs(
          "button",
          {
            type: "button",
            "aria-expanded": menuOpen,
            onClick: () => setMenuOpen((current) => !current),
            className: "flex h-6.5 w-full items-center justify-between rounded-chip bg-inset py-1 pr-1 pl-2\n              shadow-hairline transition-shadow duration-200 focus-visible:outline-none",
            style: { boxShadow: menuOpen ? "0 0 0 1px var(--accent)" : void 0 },
            children: [
              /* @__PURE__ */ jsx("span", { className: `text-[12px] ${typeValue !== text.placeholder ? "text-ink" : "text-ink-3"}`, children: typeValue }),
              /* @__PURE__ */ jsx(
                "svg",
                {
                  width: "11",
                  height: "11",
                  viewBox: "0 0 24 24",
                  fill: "none",
                  stroke: "var(--ink-3)",
                  strokeWidth: "2.5",
                  strokeLinecap: "round",
                  strokeLinejoin: "round",
                  className: "transition-transform duration-200",
                  style: { transform: menuOpen ? "rotate(180deg)" : "rotate(0)" },
                  children: /* @__PURE__ */ jsx("path", { d: "M6 9l6 6 6-6" })
                }
              )
            ]
          }
        ),
        menuOpen && /* @__PURE__ */ jsx(
          "div",
          {
            className: "absolute right-0 bottom-8 z-10 w-30 rounded-[10px] bg-surface p-1 shadow-raised",
            style: {
              animation: "pop-in 200ms cubic-bezier(0.23,1,0.32,1) both",
              transformOrigin: "bottom right"
            },
            children: /* @__PURE__ */ jsx(GlideMenu, { className: "flex flex-col gap-px", highlightClassName: "inset-x-0 rounded-[6px] bg-field", children: options.map((item) => /* @__PURE__ */ jsx(
              "button",
              {
                "data-menu-row": true,
                type: "button",
                onClick: () => selectType(item),
                className: `relative z-10 flex h-6.5 w-full items-center rounded-[6px] px-2 text-left text-[12.5px] text-ink ${item === typeValue ? "bg-field group-hover/glide-menu:bg-transparent" : ""}`,
                children: item
              },
              item
            )) })
          }
        )
      ] })
    ] })
  ] });
}
export {
  FineTuneCard as default
};
