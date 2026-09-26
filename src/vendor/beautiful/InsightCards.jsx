// Adapted from the original publicly provided Beautiful UI source. See THIRD_PARTY.md.
"use client";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { Liveline } from "liveline";
import { useEffect, useMemo, useState } from "react";
const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
const formatPercent = (v) => `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
const formatMoney = (v) => `$${Math.round(v).toLocaleString("en-US")}`;
function makePoints(values, gap = 6) {
  const end = Math.floor(Date.now() / 1e3);
  return values.map((value, index) => ({
    time: end - (values.length - 1 - index) * gap,
    value
  }));
}
function smooth(values, perSegment = 9) {
  if (values.length < 3) return values.slice();
  const out = [];
  const n = values.length;
  for (let i = 0; i < n - 1; i += 1) {
    const p0 = values[Math.max(0, i - 1)];
    const p1 = values[i];
    const p2 = values[i + 1];
    const p3 = values[Math.min(n - 1, i + 2)];
    for (let s = 0; s < perSegment; s += 1) {
      const t = s / perSegment;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push(
        0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
      );
    }
  }
  out.push(values[n - 1]);
  return out;
}
function smoothPoints(values, spanSecs) {
  const dense = smooth(values);
  return makePoints(dense, spanSecs / (dense.length - 1));
}
function useDarkMode() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const update = () => setDark(root.classList.contains("dark"));
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return dark;
}
function Entity({ name, tone }) {
  return /* @__PURE__ */ jsxs("span", { className: "inline-flex items-center gap-1 align-baseline font-medium text-ink", children: [
    /* @__PURE__ */ jsx("span", { className: `inline-block size-2.5 rounded-full ${tone}` }),
    "@",
    name
  ] });
}
function Mono({ children, tone }) {
  return /* @__PURE__ */ jsx("code", { className: `font-mono text-[11.5px] ${tone === "red" ? "text-red" : "text-green"}`, children });
}
function chartIndexFromPointer(event, pointCount) {
  const rect = event.currentTarget.getBoundingClientRect();
  const progress = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  return Math.round(progress * (pointCount - 1));
}
function ChartTooltip({ rows }) {
  return /* @__PURE__ */ jsx("div", { className: "insight-chart-tooltip", children: rows.map((row) => /* @__PURE__ */ jsxs("span", { className: "insight-chart-tooltip-item", children: [
    /* @__PURE__ */ jsx("span", { className: "insight-chart-tooltip-dot", style: { background: row.color } }),
    row.value
  ] }, row.label)) });
}
const COMPARE_SERIES = [
  {
    name: "Mint Chip",
    values: [-2.9, -3.4, -3.05, -3.86, -3.52, -4.1, -3.82, -4.41],
    sub: "-$2,377.66",
    tone: "red",
    dot: "bg-orange",
    color: "#f68f3c",
    tooltipColor: "var(--orange)"
  },
  {
    name: "Pistachio",
    values: [0.22, 0.58, 0.42, 0.91, 0.76, 1.08, 0.96, 1.15],
    sub: "+$617.22",
    tone: "green",
    dot: "bg-accent",
    color: "#3d9aff",
    tooltipColor: "var(--accent)"
  }
];
function CompareCard({ series = COMPARE_SERIES }) {
  const dark = useDarkMode();
  const [hoverIndex, setHoverIndex] = useState(null);
  const points = useMemo(
    () => series.map((s) => smoothPoints(s.values, 42)),
    [series]
  );
  const pointCount = points[0]?.length ?? 0;
  const chartSeries = useMemo(
    () => series.map((s, i) => ({
      id: s.name,
      label: "",
      data: points[i],
      value: points[i].at(-1)?.value ?? (s.values.at(-1) ?? 0),
      color: s.color
    })),
    [series, points]
  );
  return /* @__PURE__ */ jsxs("div", { className: "min-h-[278px] rounded-card bg-surface p-3 shadow-hairline", children: [
    /* @__PURE__ */ jsx("div", { className: "flex items-center gap-4", children: series.map((s, i) => /* @__PURE__ */ jsxs("div", { className: "flex-1", children: [
      /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1.5 text-[11.5px] text-ink-2", children: [
        /* @__PURE__ */ jsx("span", { className: `size-2 rounded-full ${s.dot}` }),
        s.name
      ] }),
      /* @__PURE__ */ jsx("span", { className: `block text-[17px] font-semibold tracking-[-0.01em] tabular-nums ${s.tone === "red" ? "text-red" : "text-green"}`, children: formatPercent(points[i].at(-1)?.value ?? (s.values.at(-1) ?? 0)) }),
      /* @__PURE__ */ jsx(Mono, { tone: s.tone, children: s.sub })
    ] }, s.name)) }),
    /* @__PURE__ */ jsxs("div", { className: "mt-2 overflow-hidden rounded-control bg-inset shadow-hairline", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between border-b border-line px-2.5 py-1.5", children: [
        /* @__PURE__ */ jsx("span", { className: "text-[11px] text-ink-3 tabular-nums", children: "Trend snapshot" }),
        /* @__PURE__ */ jsx("span", { className: "rounded-full bg-field px-2 py-0.5 text-[10.5px] font-medium text-ink-2", children: "Snapshot" })
      ] }),
      /* @__PURE__ */ jsxs(
        "div",
        {
          className: "insight-chart-stage relative h-[166px]",
          onPointerDown: (event) => setHoverIndex(chartIndexFromPointer(event, pointCount)),
          onPointerMove: (event) => setHoverIndex(chartIndexFromPointer(event, pointCount)),
          onPointerLeave: () => setHoverIndex(null),
          onPointerCancel: () => setHoverIndex(null),
          onPointerUp: () => setHoverIndex(null),
          children: [
            /* @__PURE__ */ jsx(
              Liveline,
              {
                data: [],
                value: 0,
                series: chartSeries,
                theme: dark ? "dark" : "light",
                grid: false,
                pulse: false,
                window: 42,
                paused: true,
                scrub: false,
                cursor: "default",
                lineWidth: 2.25,
                padding: { top: 40, right: 0, bottom: 22, left: 0 },
                formatValue: formatPercent
              }
            ),
            hoverIndex !== null && /* @__PURE__ */ jsxs(Fragment, { children: [
              /* @__PURE__ */ jsx("span", { className: "insight-chart-cursor", style: { left: `${hoverIndex / (pointCount - 1) * 100}%` } }),
              /* @__PURE__ */ jsx("span", { className: "insight-chart-tooltip-anchor", style: { left: `${Math.min(Math.max(hoverIndex / (pointCount - 1) * 100, 28), 72)}%` }, children: /* @__PURE__ */ jsx(ChartTooltip, { rows: series.map((s, i) => ({ label: s.name, value: formatPercent(points[i][hoverIndex].value), color: s.tooltipColor })) }) })
            ] })
          ]
        }
      )
    ] })
  ] });
}
const ANOMALY_DATA = {
  spend: [274, 289, 264, 307, 331, 1210, 1718, 2112],
  usage: [18, 19, 17, 21, 22, 58, 81, 96]
};
function AnomalyCard({ data: anomaly = ANOMALY_DATA }) {
  const dark = useDarkMode();
  const [metric, setMetric] = useState("spend");
  const [hoverIndex, setHoverIndex] = useState(null);
  const spend = useMemo(
    () => makePoints(anomaly.spend, 7),
    [anomaly]
  );
  const usage = useMemo(
    () => makePoints(anomaly.usage, 7),
    [anomaly]
  );
  const data = metric === "spend" ? spend : usage;
  const value = data.at(-1)?.value ?? (metric === "spend" ? 2112 : 96);
  const threshold = metric === "spend" ? "$2,112" : "82 kWh";
  const moneyLabel = formatMoney(spend.at(-1)?.value ?? 2112);
  return /* @__PURE__ */ jsxs("div", { className: "min-h-[278px] rounded-card bg-surface p-3 shadow-hairline", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1.5 text-[12px] font-medium text-ink", children: [
        /* @__PURE__ */ jsx("svg", { width: "12", height: "12", viewBox: "0 0 24 24", fill: "none", stroke: "var(--red)", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ jsx("path", { d: "M12 19V5M5 12l7-7 7 7" }) }),
        "High freezer spend"
      ] }),
      /* @__PURE__ */ jsx("span", { className: "rounded-full bg-field px-2 py-0.5 text-[10.5px] font-medium text-ink-2", children: "Snapshot" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "mt-2 overflow-hidden rounded-control bg-inset shadow-hairline", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between border-b border-line px-2.5 py-1.5", children: [
        /* @__PURE__ */ jsx("span", { className: "text-[11px] text-ink-3 tabular-nums", children: hoverIndex !== null ? metric === "spend" ? formatMoney(data[hoverIndex].value) : `${Math.round(data[hoverIndex].value)} kWh` : `${threshold} threshold` }),
        /* @__PURE__ */ jsx("span", { className: "flex rounded-full bg-field p-0.5", children: ["spend", "usage"].map((item) => /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            "aria-pressed": metric === item,
            onClick: () => setMetric(item),
            className: `rounded-full px-2 py-0.5 text-[10.5px] font-medium transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.96] ${metric === item ? "bg-surface text-ink shadow-btn" : "text-ink-3 hover:text-ink-2"}`,
            children: item === "spend" ? "Spend" : "Usage"
          },
          item
        )) })
      ] }),
      /* @__PURE__ */ jsxs(
        "div",
        {
          className: "insight-chart-stage relative h-[166px]",
          onPointerDown: (event) => setHoverIndex(chartIndexFromPointer(event, data.length)),
          onPointerMove: (event) => setHoverIndex(chartIndexFromPointer(event, data.length)),
          onPointerLeave: () => setHoverIndex(null),
          onPointerCancel: () => setHoverIndex(null),
          onPointerUp: () => setHoverIndex(null),
          children: [
            /* @__PURE__ */ jsx(
              Liveline,
              {
                data,
                value,
                theme: dark ? "dark" : "light",
                color: "#ee5c61",
                grid: true,
                scrub: false,
                fill: false,
                pulse: false,
                momentum: false,
                paused: true,
                window: 49,
                lineWidth: 2.25,
                cursor: "crosshair",
                padding: { top: 34, right: 0, bottom: 22, left: 0 },
                formatValue: (v) => metric === "spend" ? formatMoney(v) : `${Math.round(v)} kWh`
              }
            ),
            hoverIndex !== null && /* @__PURE__ */ jsxs(Fragment, { children: [
              /* @__PURE__ */ jsx("span", { className: "insight-chart-cursor", style: { left: `${hoverIndex / (data.length - 1) * 100}%` } }),
              /* @__PURE__ */ jsx("span", { className: "insight-chart-tooltip-anchor", style: { left: `${Math.min(Math.max(hoverIndex / (data.length - 1) * 100, 28), 72)}%` }, children: /* @__PURE__ */ jsx(ChartTooltip, { rows: [{ label: metric === "spend" ? "Spend" : "Usage", value: metric === "spend" ? formatMoney(data[hoverIndex].value) : `${Math.round(data[hoverIndex].value)} kWh`, color: "var(--red)" }] }) })
            ] })
          ]
        }
      )
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "mt-1.5 flex items-baseline gap-2", children: [
      /* @__PURE__ */ jsxs("span", { className: "text-[17px] font-semibold tracking-[-0.01em] text-ink tabular-nums", children: [
        moneyLabel,
        " spent"
      ] }),
      /* @__PURE__ */ jsx(Mono, { tone: "red", children: "+$1,834.66" }),
      /* @__PURE__ */ jsx("span", { className: "text-[11px] text-ink-3", children: "vs 3 months" })
    ] })
  ] });
}
const ALLOCATION_SEGMENTS = [
  { name: "VAN", label: "Vanilla", pct: 72.5, amount: "$51,785", cls: "bg-orange", tone: "text-orange" },
  { name: "CHOC", label: "Chocolate", pct: 22.8, amount: "$16,278", cls: "bg-line-strong", tone: "text-ink-2" },
  { name: "MINT", label: "Mint", pct: 4.7, amount: "$3,357", cls: "bg-line", tone: "text-ink-3" }
];
function AllocationCard({ segments = ALLOCATION_SEGMENTS }) {
  const [selected, setSelected] = useState(segments[0].name);
  const active = segments.find((segment) => segment.name === selected) ?? segments[0];
  return /* @__PURE__ */ jsxs("div", { className: "min-h-[278px] rounded-card bg-surface p-3 shadow-hairline", children: [
    /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1.5 text-[12px] font-medium text-ink", children: [
      /* @__PURE__ */ jsx("span", { className: "flex size-3.5 items-center justify-center rounded-full bg-orange text-[8px] font-bold text-white", children: "V" }),
      "Vanilla allocation"
    ] }),
    /* @__PURE__ */ jsx("span", { className: "mt-1 block text-[20px] font-semibold tracking-[-0.01em] text-ink tabular-nums", children: active.amount }),
    /* @__PURE__ */ jsx(
      "div",
      {
        className: "mt-3 flex h-9 gap-0.5 overflow-hidden rounded-full bg-field p-0.5",
        role: "group",
        "aria-label": "Allocation segments",
        children: segments.map((s) => /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            "aria-pressed": selected === s.name,
            "aria-label": `${s.label}: ${s.pct}%`,
            onClick: () => setSelected(s.name),
            className: `relative h-full overflow-hidden rounded-full ${s.cls} transition-[opacity,transform,box-shadow] duration-300 active:scale-[0.98]`,
            style: {
              width: `${s.pct}%`,
              opacity: selected === s.name ? 1 : 0.58,
              boxShadow: selected === s.name ? "inset 0 0 0 1px rgba(255,255,255,0.22)" : void 0,
              transitionTimingFunction: EASE
            },
            children: /* @__PURE__ */ jsx(
              "span",
              {
                className: "absolute inset-y-1 left-1 rounded-full bg-white/20 transition-[width,opacity] duration-500",
                style: {
                  width: selected === s.name ? "calc(100% - 8px)" : "0%",
                  opacity: selected === s.name ? 1 : 0,
                  transitionTimingFunction: EASE
                }
              }
            )
          },
          s.name
        ))
      }
    ),
    /* @__PURE__ */ jsx("div", { className: "mt-2 flex items-center gap-1.5", children: segments.map((s) => /* @__PURE__ */ jsxs(
      "button",
      {
        type: "button",
        "aria-pressed": selected === s.name,
        onClick: () => setSelected(s.name),
        className: `flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] transition-[background-color,color,transform] duration-150 active:scale-[0.96] ${selected === s.name ? "bg-field text-ink" : "text-ink-2 hover:bg-hover hover:text-ink"}`,
        children: [
          /* @__PURE__ */ jsx("span", { className: `size-1.5 rounded-full ${s.cls}` }),
          s.name,
          " ",
          /* @__PURE__ */ jsxs("span", { className: "tabular-nums", children: [
            s.pct,
            "%"
          ] })
        ]
      },
      s.name
    )) }),
    /* @__PURE__ */ jsxs("div", { className: "mt-3 min-h-16 rounded-control bg-inset px-2.5 py-2 shadow-hairline", children: [
      /* @__PURE__ */ jsx("span", { className: `block text-[11.5px] font-medium ${active.tone}`, children: active.label }),
      /* @__PURE__ */ jsx("span", { className: "mt-1 block text-[11px] leading-relaxed text-ink-3", children: "Contribution snapshot across current inventory value. Segment selection changes the inspected group without moving the card." })
    ] })
  ] });
}
const PAGES = [
  {
    key: "compare",
    prose: /* @__PURE__ */ jsxs(Fragment, { children: [
      "The worst performer in your ",
      /* @__PURE__ */ jsx(Entity, { name: "Creamery", tone: "bg-orange" }),
      " is Rocky Road \u2014 down ",
      /* @__PURE__ */ jsx(Mono, { tone: "red", children: "-6%" }),
      " or ",
      /* @__PURE__ */ jsx(Mono, { tone: "red", children: "-$2,453.44" }),
      "."
    ] }),
    Card: CompareCard,
    pill: "Should I rebalance flavors?"
  },
  {
    key: "anomaly",
    prose: /* @__PURE__ */ jsxs(Fragment, { children: [
      "Unusually high freezer bill on ",
      /* @__PURE__ */ jsx("span", { className: "font-medium text-ink", children: "Dec 13" }),
      " \u2014",
      " ",
      /* @__PURE__ */ jsx(Mono, { tone: "red", children: "+$1,834.66" }),
      " above your average."
    ] }),
    Card: AnomalyCard,
    pill: "Get tips on cutting freezer costs"
  },
  {
    key: "allocation",
    prose: /* @__PURE__ */ jsxs(Fragment, { children: [
      "You\u2019re heavily invested in ",
      /* @__PURE__ */ jsx(Entity, { name: "Vanilla", tone: "bg-orange" }),
      " \u2014 it\u2019s",
      " ",
      /* @__PURE__ */ jsx("span", { className: "font-medium text-ink", children: "72.5%" }),
      " of your case."
    ] }),
    Card: AllocationCard,
    pill: "If we look at seasonals, what changes?"
  }
];
const DEFAULT_INSIGHT_LABELS = {
  title: "Insights"
};
function InsightCards({
  pages = PAGES,
  labels
} = {}) {
  const l = { ...DEFAULT_INSIGHT_LABELS, ...labels };
  const [page, setPage] = useState(0);
  const move = (direction) => {
    setPage((current) => (current + direction + pages.length) % pages.length);
  };
  const { prose, Card, pill } = pages[page];
  return /* @__PURE__ */ jsxs("div", { className: "min-h-[408px] w-full max-w-86", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsxs("span", { className: "flex items-baseline gap-1.5", children: [
        /* @__PURE__ */ jsx("span", { className: "text-[13px] font-semibold text-ink", children: l.title }),
        /* @__PURE__ */ jsx("span", { className: "text-[13px] text-ink-3 tabular-nums", children: pages.length })
      ] }),
      /* @__PURE__ */ jsx("span", { className: "flex items-center gap-0.5", children: ["M15 18l-6-6 6-6", "M9 6l6 6-6 6"].map((d, i) => /* @__PURE__ */ jsx(
        "button",
        {
          "aria-label": i === 0 ? "Previous insight" : "Next insight",
          onClick: () => move(i === 0 ? -1 : 1),
          className: "flex size-6 items-center justify-center rounded-[6px] text-ink-3\n                transition-[background-color,color,transform] duration-100 hover:bg-hover\n                hover:text-ink active:scale-[0.96]",
          children: /* @__PURE__ */ jsx("svg", { width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.2", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ jsx("path", { d }) })
        },
        i
      )) })
    ] }),
    /* @__PURE__ */ jsxs(
      "div",
      {
        className: "transition-[opacity,filter] duration-250",
        style: { opacity: 1, filter: "blur(0)" },
        children: [
          /* @__PURE__ */ jsx("p", { className: "mt-1.5 text-[12.5px] leading-relaxed text-ink-2", children: prose }),
          /* @__PURE__ */ jsx("div", { className: "mt-2", children: /* @__PURE__ */ jsx(Card, {}) }),
          /* @__PURE__ */ jsx(
            "button",
            {
              className: "mt-2 rounded-full bg-surface px-3 py-1.5 text-left text-[12px] text-ink\n            shadow-btn transition-colors duration-100 hover:bg-hover",
              children: pill
            }
          )
        ]
      }
    )
  ] });
}
export {
  InsightCards as default
};
