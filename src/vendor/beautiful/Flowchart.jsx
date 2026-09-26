// Adapted from the original publicly provided Beautiful UI source. See THIRD_PARTY.md.
"use client";
import { jsx, jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import { useLayoutEffect } from "react";
const PURPLE = "#9a5cff";
const AMBER = "#f09a2f";
const mix = (hue, pct, base = "var(--surface)") => `color-mix(in srgb, ${hue} ${pct}%, ${base})`;
const PAD_Y = 24;
const ROW_GAP = 64;
const PILL_OFFSET = 30;
const NODES = [
  {
    id: "trigger",
    row: 0,
    x: 0.5,
    w: 300,
    kind: { label: "Trigger", hue: PURPLE },
    hue: PURPLE,
    title: "New order created",
    caption: "Trigger when a new order is created"
  },
  {
    id: "cond",
    row: 1,
    x: 0.5,
    w: 356,
    kind: { label: "If / Else", hue: AMBER },
    condition: true
  }
];
const EDGES = [{ from: "trigger", to: "cond" }];
const EST_H = { trigger: 92, cond: 134 };
const PROPERTIES = ["flavor", "topping", "size", "scoops"];
const FLAVORS = [
  { name: "Rocky Road", tag: "Classic" },
  { name: "Mint Chip", tag: "Classic" },
  { name: "Pistachio", tag: "Seasonal" },
  { name: "Bubblegum", tag: "Retro" }
];
const TOPPINGS = [
  { name: "Brown butter bourbon brittle crunch" },
  { name: "Rainbow sprinkles" },
  { name: "Hot fudge" },
  { name: "Candied pecans" }
];
function ConeIcon({ size = 16 }) {
  return /* @__PURE__ */ jsxs("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", children: [
    /* @__PURE__ */ jsx("path", { d: "m7 11 4.08 10.35a1 1 0 0 0 1.84 0L17 11" }),
    /* @__PURE__ */ jsx("path", { d: "M17 7A5 5 0 0 0 7 7" }),
    /* @__PURE__ */ jsx("path", { d: "M17 7a2 2 0 0 1 0 4H7a2 2 0 0 1 0-4" })
  ] });
}
function Chevron() {
  return /* @__PURE__ */ jsx("svg", { width: "11", height: "11", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.4", strokeLinecap: "round", strokeLinejoin: "round", className: "shrink-0 text-ink-3", children: /* @__PURE__ */ jsx("path", { d: "m6 9 6 6 6-6" }) });
}
function Handle() {
  return /* @__PURE__ */ jsx("svg", { width: "10", height: "16", viewBox: "0 0 10 16", className: "shrink-0 cursor-grab text-ink-3/70", children: [3, 8, 13].flatMap((y) => [
    /* @__PURE__ */ jsx("circle", { cx: "3", cy: y, r: "1.1", fill: "currentColor" }, `l${y}`),
    /* @__PURE__ */ jsx("circle", { cx: "7.5", cy: y, r: "1.1", fill: "currentColor" }, `r${y}`)
  ]) });
}
function CheckIcon() {
  return /* @__PURE__ */ jsx("svg", { width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ jsx("path", { d: "M20 6L9 17l-5-5" }) });
}
function Menu({
  items,
  value,
  width,
  align,
  onPick
}) {
  const [hovered, setHovered] = useState(null);
  const rowRefs = useRef([]);
  const [box, setBox] = useState(null);
  const valueIndex = items.findIndex((item) => item.name === value);
  useLayoutEffect(() => {
    const row = rowRefs.current[hovered ?? valueIndex];
    if (row) setBox({ top: row.offsetTop, height: row.offsetHeight });
  }, [hovered, valueIndex]);
  return /* @__PURE__ */ jsxs(
    "div",
    {
      onMouseLeave: () => setHovered(null),
      className: `absolute bottom-full z-20 mb-1.5 rounded-[10px] bg-surface p-1 shadow-raised ${width}
        ${align === "right" ? "right-0" : "left-0"}`,
      style: {
        animation: "pop-in 180ms cubic-bezier(0.23,1,0.32,1) both",
        transformOrigin: align === "right" ? "bottom right" : "bottom left"
      },
      children: [
        /* @__PURE__ */ jsx(
          "span",
          {
            "aria-hidden": true,
            className: "pointer-events-none absolute inset-x-1 rounded-[6px] bg-hover",
            style: {
              top: box?.top ?? 0,
              height: box?.height ?? 0,
              opacity: box && hovered !== null ? 1 : 0,
              transition: "top 220ms cubic-bezier(0.23,1,0.32,1), height 220ms cubic-bezier(0.23,1,0.32,1), opacity 150ms ease"
            }
          }
        ),
        items.map((item, i) => /* @__PURE__ */ jsxs(
          "button",
          {
            type: "button",
            ref: (el) => {
              rowRefs.current[i] = el;
            },
            onMouseEnter: () => setHovered(i),
            onClick: () => onPick(item.name),
            className: "relative z-10 flex h-7.5 w-full cursor-pointer items-center gap-2 rounded-[6px] px-2 text-left",
            children: [
              /* @__PURE__ */ jsx("span", { className: "min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink", children: item.name }),
              item.tag && /* @__PURE__ */ jsx("span", { className: "shrink-0 text-[11px] text-ink-3", children: item.tag }),
              /* @__PURE__ */ jsx("span", { className: `shrink-0 text-ink ${item.name === value ? "" : "invisible"}`, children: /* @__PURE__ */ jsx(CheckIcon, {}) })
            ]
          },
          item.name
        ))
      ]
    }
  );
}
function SourceChip() {
  return /* @__PURE__ */ jsxs(
    "span",
    {
      "data-ui": true,
      className: "inline-flex h-6 shrink-0 items-center gap-1 rounded-[6px] bg-surface px-1.5 text-[12px] font-medium text-ink shadow-btn",
      children: [
        /* @__PURE__ */ jsx("span", { className: "text-ink-2", children: /* @__PURE__ */ jsx(ConeIcon, { size: 12 }) }),
        "order"
      ]
    }
  );
}
function SelectChip({
  id,
  value,
  dot,
  items,
  width,
  align = "left",
  open,
  onToggle,
  onPick
}) {
  return /* @__PURE__ */ jsxs("span", { "data-ui": true, className: "relative inline-flex min-w-0", children: [
    /* @__PURE__ */ jsxs(
      "button",
      {
        type: "button",
        "aria-expanded": open,
        onClick: () => onToggle(id),
        className: `inline-flex h-6 min-w-0 cursor-pointer items-center gap-1 rounded-[6px] px-1.5
          text-[12px] font-medium text-ink transition-colors duration-100
          ${open ? "bg-hover-2" : "bg-field hover:bg-hover-2"}`,
        children: [
          dot && /* @__PURE__ */ jsx("span", { className: "size-1.5 shrink-0 rounded-full", style: { background: AMBER } }),
          /* @__PURE__ */ jsx("span", { className: "min-w-0 truncate", children: value }),
          /* @__PURE__ */ jsx(Chevron, {})
        ]
      }
    ),
    open && /* @__PURE__ */ jsx(
      Menu,
      {
        items,
        value,
        width,
        align,
        onPick: (name) => onPick(id, name)
      }
    )
  ] });
}
function ConditionBody() {
  const [values, setValues] = useState({
    prop1: "flavor",
    val1: "Rocky Road",
    prop2: "topping",
    val2: "Brown butter bourbon brittle crunch"
  });
  const [open, setOpen] = useState(null);
  useEffect(() => {
    if (!open) return;
    const close = (event) => {
      if (!event.target.closest("[data-ui]")) setOpen(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const toggle = (id) => setOpen((current) => current === id ? null : id);
  const pick = (id, name) => {
    setValues((current) => ({ ...current, [id]: name }));
    setOpen(null);
  };
  const chip = (id, items, width, extra) => /* @__PURE__ */ jsx(
    SelectChip,
    {
      id,
      value: values[id],
      items,
      width,
      open: open === id,
      onToggle: toggle,
      onPick: pick,
      ...extra
    }
  );
  return /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-1.5 px-3 py-2.5", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex min-w-0 items-center gap-1.5", children: [
      /* @__PURE__ */ jsx(Handle, {}),
      /* @__PURE__ */ jsx("span", { className: "w-7 text-[12.5px] text-ink-2", children: "If" }),
      /* @__PURE__ */ jsx(SourceChip, {}),
      chip("prop1", PROPERTIES.map((name) => ({ name })), "w-36"),
      /* @__PURE__ */ jsx("span", { className: "text-[12.5px] text-ink-2", children: "is" }),
      chip("val1", FLAVORS, "w-44", { dot: true, align: "right" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1.5", children: [
      /* @__PURE__ */ jsx(Handle, {}),
      /* @__PURE__ */ jsx("span", { className: "w-7 text-[12.5px] text-ink-2", children: "and" }),
      /* @__PURE__ */ jsx(SourceChip, {}),
      chip("prop2", PROPERTIES.map((name) => ({ name })), "w-36"),
      /* @__PURE__ */ jsx("span", { className: "text-[12.5px] text-ink-2", children: "is" }),
      /* @__PURE__ */ jsx("span", { className: "max-w-full pl-[49px]", children: chip("val2", TOPPINGS, "w-64", { dot: true }) })
    ] })
  ] });
}
function StepBody({ node }) {
  return /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2.5 p-2.5", children: [
    /* @__PURE__ */ jsx(
      "span",
      {
        className: "flex size-9 shrink-0 items-center justify-center rounded-[8px]",
        style: {
          background: mix(node.hue, 12),
          color: node.hue,
          boxShadow: `0 0 0 1px ${mix(node.hue, 20)}`
        },
        children: /* @__PURE__ */ jsx(ConeIcon, {})
      }
    ),
    /* @__PURE__ */ jsxs("span", { className: "min-w-0 text-left", children: [
      /* @__PURE__ */ jsx("span", { className: "block truncate text-[13px] font-semibold leading-tight text-ink", children: node.title }),
      /* @__PURE__ */ jsx("span", { className: "mt-0.5 block text-[12px] leading-snug text-ink-2", children: node.caption })
    ] })
  ] });
}
function Flowchart({ steps = NODES } = {}) {
  const canvasRef = useRef(null);
  const nodeRefs = useRef(/* @__PURE__ */ new Map());
  const [width, setWidth] = useState(0);
  const [heights, setHeights] = useState(EST_H);
  const [selected, setSelected] = useState(null);
  const [offsets, setOffsets] = useState({});
  const drag = useRef(null);
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const measure = () => {
      setWidth(canvas.clientWidth);
      setHeights((prev) => {
        const next = { ...prev };
        let changed = false;
        nodeRefs.current.forEach((el, id) => {
          const h = el.offsetHeight;
          if (h && Math.abs(h - (next[id] ?? 0)) > 0.5) {
            next[id] = h;
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    nodeRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
  const rows = [...new Set(steps.map((n) => n.row))].sort((a, b) => a - b);
  const rowH = rows.map(
    (r) => Math.max(...steps.filter((n) => n.row === r).map((n) => heights[n.id] ?? 90))
  );
  const rowY = [];
  rows.forEach((_, i) => {
    rowY[i] = i === 0 ? PAD_Y : rowY[i - 1] + rowH[i - 1] + ROW_GAP;
  });
  const canvasH = rowY[rows.length - 1] + rowH[rows.length - 1] + PAD_Y;
  const cw = width || 480;
  const place = (n) => {
    const w = Math.min(n.w, cw * 0.92);
    const off = offsets[n.id];
    return {
      w,
      cx: n.x * cw + (off?.dx ?? 0),
      top: rowY[rows.indexOf(n.row)] + (off?.dy ?? 0)
    };
  };
  const anchors = (n) => {
    const { cx, top } = place(n);
    return {
      top: { x: cx, y: top + (n.kind ? PILL_OFFSET : 0) },
      bottom: { x: cx, y: top + (heights[n.id] ?? 90) }
    };
  };
  const bezier = (edge) => {
    const from = anchors(steps.find((n) => n.id === edge.from)).bottom;
    const to = anchors(steps.find((n) => n.id === edge.to)).top;
    const k = Math.min(Math.max(Math.abs(to.y - from.y) * 0.55, 24), 84);
    return `M ${from.x} ${from.y} C ${from.x} ${from.y + k}, ${to.x} ${to.y - k}, ${to.x} ${to.y}`;
  };
  const onPointerDown = (node) => (event) => {
    if (event.target.closest("[data-ui]")) return;
    const off = offsets[node.id];
    drag.current = {
      id: node.id,
      startX: event.clientX,
      startY: event.clientY,
      baseDx: off?.dx ?? 0,
      baseDy: off?.dy ?? 0,
      moved: false
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (node) => (event) => {
    const d = drag.current;
    if (!d || d.id !== node.id) return;
    const dx = d.baseDx + event.clientX - d.startX;
    const dy = d.baseDy + event.clientY - d.startY;
    if (!d.moved && Math.hypot(dx - d.baseDx, dy - d.baseDy) < 3) return;
    d.moved = true;
    const { w } = place(node);
    const h = heights[node.id] ?? 90;
    const baseCx = node.x * cw;
    const baseTop = rowY[rows.indexOf(node.row)];
    const cx = Math.min(Math.max(baseCx + dx, w / 2 + 8), cw - w / 2 - 8);
    const top = Math.min(Math.max(baseTop + dy, 8), canvasH - h - 8);
    setOffsets((current) => ({ ...current, [node.id]: { dx: cx - baseCx, dy: top - baseTop } }));
  };
  const onPointerUp = (node) => () => {
    const d = drag.current;
    if (d?.id === node.id) {
      if (d.moved) setTimeout(() => drag.current = null, 0);
      else drag.current = null;
    }
  };
  const wasDragged = () => drag.current?.moved === true;
  const isLit = (edge) => selected === edge.from || selected === edge.to;
  return /* @__PURE__ */ jsxs(
    "div",
    {
      ref: canvasRef,
      className: "relative w-full select-none overflow-hidden rounded-card bg-page shadow-hairline",
      style: {
        height: canvasH,
        backgroundImage: "radial-gradient(var(--line-strong) 1px, transparent 1.25px)",
        backgroundSize: "22px 22px",
        backgroundPosition: "center"
      },
      children: [
        /* @__PURE__ */ jsx("svg", { width: cw, height: canvasH, className: "pointer-events-none absolute inset-0", children: EDGES.map((edge) => /* @__PURE__ */ jsx(
          "path",
          {
            d: bezier(edge),
            fill: "none",
            stroke: isLit(edge) ? "var(--accent)" : "var(--line-strong)",
            strokeWidth: "1.25",
            className: "transition-[stroke] duration-150"
          },
          `${edge.from}-${edge.to}`
        )) }),
        steps.map((node) => {
          const { w, cx, top } = place(node);
          const active = selected === node.id;
          return /* @__PURE__ */ jsxs(
            "div",
            {
              ref: (el) => {
                if (el) nodeRefs.current.set(node.id, el);
                else nodeRefs.current.delete(node.id);
              },
              onPointerDown: onPointerDown(node),
              onPointerMove: onPointerMove(node),
              onPointerUp: onPointerUp(node),
              className: "absolute flex -translate-x-1/2 touch-none flex-col items-start gap-1.5",
              style: { left: cx, top, width: w, zIndex: drag.current?.id === node.id ? 2 : 1 },
              children: [
                node.kind && /* @__PURE__ */ jsx(
                  "span",
                  {
                    className: "inline-flex h-6 items-center rounded-[6px] px-2 text-[11.5px] font-medium",
                    style: {
                      background: mix(node.kind.hue, 14, "var(--page)"),
                      color: mix(node.kind.hue, 80, "var(--ink)")
                    },
                    children: node.kind.label
                  }
                ),
                node.condition ? /* @__PURE__ */ jsx("div", { className: "w-full rounded-[18px] bg-surface shadow-card transition-shadow duration-150 hover:shadow-raised", children: /* @__PURE__ */ jsx(ConditionBody, {}) }) : /* @__PURE__ */ jsx(
                  "button",
                  {
                    type: "button",
                    onClick: () => {
                      if (wasDragged()) return;
                      setSelected(active ? null : node.id);
                    },
                    "aria-pressed": active,
                    className: `w-full cursor-pointer rounded-[18px] bg-surface text-left outline-none
                  transition-shadow duration-150 focus-visible:shadow-[0_0_0_1.5px_var(--accent)]
                  ${active ? "shadow-[0_0_0_1.5px_var(--accent),0_2px_10px_rgba(0,0,0,0.045)]" : "shadow-card hover:shadow-raised"}`,
                    children: /* @__PURE__ */ jsx(StepBody, { node })
                  }
                )
              ]
            },
            node.id
          );
        })
      ]
    }
  );
}
export {
  Flowchart as default
};
