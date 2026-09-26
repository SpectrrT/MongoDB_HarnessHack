"use client";
import { jsx, jsxs } from "react/jsx-runtime";
import {
  DEFAULT_ECHARTS_RENDERER,
  buildChartCss,
  flattenColor,
  getColorsCount,
  resolveColors,
  withAlpha
} from "./ui/echarts-chart";
import {
  tooltipBaseOption,
  tooltipIndicatorHtml,
  tooltipRow,
  tooltipShell
} from "./ui/echarts-tooltip";
import {
  Brush,
  buildBrushDataZoom,
  syncBrushOverlay
} from "./ui/echarts-brush";
import {
  DataZoomComponent,
  GridComponent,
  TooltipComponent
} from "echarts/components";
import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState
} from "react";
import { LegendOverlay } from "./ui/echarts-legend";
import { BarChart } from "echarts/charts";
import { sampleGradient } from "./ui/echarts-dot";
import { motion, useReducedMotion } from "motion/react";
import * as echarts from "echarts/core";
echarts.use([BarChart, GridComponent, TooltipComponent, DataZoomComponent]);
const DEFAULT_BAR_RADIUS = 2;
const STROKE_WIDTH = 1;
const LOADING_ANIMATION_DURATION = 2e3;
const BAR_GROW_DURATION = 500;
const BAR_STAGGER = 50;
const LOADING_DEFAULT_BARS = 12;
const SELECTION_DIM = 0.3;
const HOVER_BLUR = 0.3;
const GLOW_BLUR = 18;
const GLOW_OPACITY = 0.65;
const EXPAND_COLLAPSED = 0.12;
const EXPAND_TAU = 70;
const BLOCK_SIZE = 8;
const BLOCK_GAP = 4;
const BLOCK_TRACK_OPACITY = 0.22;
const STACK_SEGMENT_GAP = 4;
const MAX_HIGHLIGHT_DIM = 0.16;
const STRIPPED_CAP_HEIGHT = 4;
const STRIPPED_BODY_ALPHA = 0.2;
const STRIPPED_CAP_MAX_FRACTION = 0.85;
const STRIPPED_FALLBACK_FRACTION = 0.12;
const GRID_LINE_OPACITY = 1;
const LOADING_SHIMMER_MAX_OPACITY = 0.22;
const LOADING_SHIMMER_BAND = 0.2;
const LOADING_SHIMMER_FEATHER = 0.2;
const BRUSH_FILL_OPACITY = 0.5;
const BRUSH_FILLER_OPACITY = 0;
const Bar = () => null;
const XAxis = () => null;
const YAxis = () => null;
const Grid = () => null;
const Tooltip = () => null;
const Legend = () => null;
function collectConfig(children) {
  const bars = [];
  let xAxis = { present: false, hideDots: false };
  let yAxis = { present: false, hideDots: false };
  let showGrid = false;
  let tooltip = {
    present: false,
    variant: "default",
    roundness: "lg",
    position: "variable"
  };
  let legend = {
    present: false,
    variant: "rounded-square",
    align: "right",
    verticalAlign: "top",
    isClickable: false
  };
  let brush = { present: false };
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const type = child.type;
    if (type === Bar) {
      const props = child.props;
      bars.push({
        dataKey: props.dataKey,
        variant: props.variant ?? "default",
        radius: props.radius,
        animationType: props.animationType,
        isClickable: props.isClickable ?? false,
        enableHoverHighlight: props.enableHoverHighlight ?? false,
        glowing: props.glowing ?? false,
        bufferBar: props.bufferBar ?? false
      });
    } else if (type === XAxis) {
      const props = child.props;
      xAxis = {
        present: true,
        dataKey: props.dataKey,
        tickFormatter: props.tickFormatter,
        label: props.label,
        hideDots: props.hideDots ?? false
      };
    } else if (type === YAxis) {
      const props = child.props;
      yAxis = {
        present: true,
        dataKey: props.dataKey,
        tickFormatter: props.tickFormatter,
        label: props.label,
        hideDots: props.hideDots ?? false
      };
    } else if (type === Grid) {
      showGrid = true;
    } else if (type === Tooltip) {
      const props = child.props;
      tooltip = {
        present: true,
        variant: props.variant ?? "default",
        roundness: props.roundness ?? "lg",
        defaultIndex: props.defaultIndex,
        position: props.position ?? "variable"
      };
    } else if (type === Legend) {
      const props = child.props;
      legend = {
        present: true,
        variant: props.variant ?? "rounded-square",
        align: props.align ?? "right",
        verticalAlign: props.verticalAlign ?? "top",
        isClickable: props.isClickable ?? false
      };
    } else if (type === Brush) {
      const props = child.props;
      brush = {
        present: true,
        height: props.height,
        formatLabel: props.formatLabel,
        onChange: props.onChange
      };
    }
  });
  return { bars, xAxis, yAxis, showGrid, tooltip, legend, brush };
}
const GRAY = "rgba(120, 120, 120, 1)";
function solidVerticalPaint(slots, alpha) {
  if (slots.length <= 1) {
    const base = slots[0] ?? GRAY;
    return alpha === 1 ? base : withAlpha(base, alpha);
  }
  const stops = slots.map((color, i) => ({
    offset: i / (slots.length - 1),
    color: withAlpha(color, alpha)
  }));
  return new echarts.graphic.LinearGradient(0, 0, 0, 1, stops);
}
function verticalFadePaint(slots) {
  const offsets = [0, 0.2, 0.45, 0.7, 0.9, 1];
  const alphaAt = (t) => t <= 0.2 ? 1 : t >= 0.9 ? 0 : 1 - (t - 0.2) / 0.7;
  const stops = offsets.map((t) => ({
    offset: t,
    color: withAlpha(sampleGradient(slots, t), alphaAt(t))
  }));
  return new echarts.graphic.LinearGradient(0, 0, 0, 1, stops);
}
function duotoneSplitPaint(base, leftAlpha, rightAlpha, isHorizontal) {
  const stops = [
    { offset: 0, color: withAlpha(base, leftAlpha) },
    { offset: 0.5, color: withAlpha(base, leftAlpha) },
    { offset: 0.5, color: withAlpha(base, rightAlpha) },
    { offset: 1, color: withAlpha(base, rightAlpha) }
  ];
  return isHorizontal ? new echarts.graphic.LinearGradient(0, 0, 0, 1, stops) : new echarts.graphic.LinearGradient(1, 0, 0, 0, stops);
}
function strippedDatumPaint(slots, isHorizontal, capFraction) {
  const f = Math.min(Math.max(capFraction, 0), 1);
  const cap = withAlpha(sampleGradient(slots, 0), 1);
  const bodyTop = withAlpha(sampleGradient(slots, f), STRIPPED_BODY_ALPHA);
  const bodyEnd = withAlpha(sampleGradient(slots, 1), STRIPPED_BODY_ALPHA);
  const stops = [
    { offset: 0, color: cap },
    { offset: f, color: cap },
    { offset: f, color: bodyTop },
    { offset: 1, color: bodyEnd }
  ];
  return isHorizontal ? new echarts.graphic.LinearGradient(1, 0, 0, 0, stops) : new echarts.graphic.LinearGradient(0, 0, 0, 1, stops);
}
function strippedCapFraction(value, valuePxPerUnit) {
  if (valuePxPerUnit == null) return STRIPPED_FALLBACK_FRACTION;
  const barPx = Math.abs(value) * valuePxPerUnit;
  if (!(barPx > 0)) return STRIPPED_FALLBACK_FRACTION;
  return Math.min(STRIPPED_CAP_HEIGHT / barPx, STRIPPED_CAP_MAX_FRACTION);
}
function measureValuePxPerUnit(chart, isHorizontal) {
  const finder = isHorizontal ? { xAxisIndex: 0 } : { yAxisIndex: 0 };
  try {
    const p0 = chart.convertToPixel(finder, 0);
    const p1 = chart.convertToPixel(finder, 1);
    if (typeof p0 !== "number" || typeof p1 !== "number") return null;
    const delta = Math.abs(p1 - p0);
    return Number.isFinite(delta) && delta > 0 ? delta : null;
  } catch {
    return null;
  }
}
function measureBarWidthPx(chart, isHorizontal, barCategoryGap) {
  const finder = isHorizontal ? { yAxisIndex: 0 } : { xAxisIndex: 0 };
  try {
    const p0 = chart.convertToPixel(finder, 0);
    const p1 = chart.convertToPixel(finder, 1);
    if (typeof p0 !== "number" || typeof p1 !== "number") return null;
    const pitch = Math.abs(p1 - p0);
    if (!Number.isFinite(pitch) || pitch <= 0) return null;
    const width = barCategoryGap != null ? pitch - barCategoryGap : pitch * 0.8;
    return width > 1 ? width : null;
  } catch {
    return null;
  }
}
function patternFill(kind, color, blockSize = BLOCK_SIZE) {
  if (typeof document === "undefined") return null;
  const dpr = Math.max(window.devicePixelRatio || 1, 1);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const size = (width, height) => {
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
  };
  const pattern = (rotation = 0) => ({
    image: canvas,
    repeat: "repeat",
    rotation,
    scaleX: 1 / dpr,
    scaleY: 1 / dpr
  });
  if (kind === "blocks") {
    size(1, blockSize + BLOCK_GAP);
    ctx.fillStyle = withAlpha(color, 1);
    ctx.fillRect(0, 0, 1, blockSize);
    return pattern();
  }
  if (kind === "hatched") {
    size(5, 5);
    ctx.fillStyle = withAlpha(color, 0.3);
    ctx.fillRect(0, 0, 5, 5);
    ctx.fillStyle = withAlpha(color, 1);
    ctx.fillRect(0, 0, 1.5, 5);
    return pattern(-Math.PI / 4);
  }
  size(5, 5);
  ctx.fillStyle = withAlpha(color, 1);
  ctx.fillRect(0, 0, 1, 5);
  return pattern(-Math.PI / 4);
}
function expandableDatumPaint(slots, fraction) {
  const base = slots[0] ?? GRAY;
  const half = Math.max(0, Math.min(1, fraction)) / 2;
  const left = 0.5 - half;
  const right = 0.5 + half;
  const clear = withAlpha(base, 0);
  return new echarts.graphic.LinearGradient(0, 0, 1, 0, [
    { offset: 0, color: clear },
    { offset: left, color: clear },
    { offset: left, color: base },
    { offset: right, color: base },
    { offset: right, color: clear },
    { offset: 1, color: clear }
  ]);
}
function barFillPaint(variant, slots, isHorizontal, blockSize = BLOCK_SIZE) {
  const base = slots[0] ?? GRAY;
  switch (variant) {
    case "gradient":
      return verticalFadePaint(slots);
    case "duotone":
      return duotoneSplitPaint(base, 0.4, 1, isHorizontal);
    case "duotone-reverse":
      return duotoneSplitPaint(base, 1, 0.4, isHorizontal);
    case "hatched":
      return patternFill("hatched", base) ?? solidVerticalPaint(slots, 1);
    case "blocks":
      return patternFill("blocks", base, blockSize) ?? solidVerticalPaint(slots, 1);
    case "expandable":
      return expandableDatumPaint(slots, EXPAND_COLLAPSED);
    case "stripped":
      return strippedDatumPaint(slots, isHorizontal, STRIPPED_FALLBACK_FRACTION);
    default:
      return solidVerticalPaint(slots, 1);
  }
}
function barBorderRadius(radius, variant, isHorizontal) {
  if (variant === "blocks" || variant === "expandable") return 0;
  if (variant !== "stripped") return radius;
  return isHorizontal ? [0, radius, radius, 0] : [radius, radius, 0, 0];
}
function selectionOpacity(selected, key) {
  return selected === null || selected === key ? 1 : SELECTION_DIM;
}
function barStaggerDelay(type, index, count) {
  if (type === "none" || count <= 0) return 0;
  const last = count - 1;
  const center = last / 2;
  let step;
  switch (type) {
    case "right-to-left":
      step = last - index;
      break;
    case "center-out":
      step = Math.abs(index - center);
      break;
    case "edges-in":
      step = center - Math.abs(index - center);
      break;
    default:
      step = index;
  }
  return step * BAR_STAGGER;
}
function buildChartLayout({
  legendSlot,
  showBrush,
  brushHeight,
  isHorizontal,
  categorySlot,
  valueSlot
}) {
  const legendTop = legendSlot.present && legendSlot.verticalAlign === "top";
  const legendBottom = legendSlot.present && legendSlot.verticalAlign === "bottom";
  const bottomAxisLabel = isHorizontal ? valueSlot.label : categorySlot.label;
  const brushGap = showBrush ? brushHeight + 30 + (bottomAxisLabel ? 22 : 0) : 0;
  return {
    grid: {
      left: 8,
      right: 8,
      top: legendTop ? 42 : 16,
      bottom: 8 + brushGap + (legendBottom ? 34 : 0)
    },
    brushBottom: legendBottom ? 34 : 6
  };
}
function buildMainAxes(ctx) {
  const {
    isHorizontal,
    showGrid,
    isLoading,
    isPercent,
    categories,
    loadingData,
    categorySlot,
    valueSlot
  } = ctx;
  const { tokens } = ctx.resolved;
  const axisLabelColor = tokens.mutedForeground;
  const splitLineColor = withAlpha(tokens.border, GRID_LINE_OPACITY);
  const tickDotColor = flattenColor(splitLineColor, tokens.background);
  const catData = isLoading ? loadingData().map((_, i) => i) : categories;
  const catFormatter = categorySlot.tickFormatter;
  const valFormatter = valueSlot.tickFormatter;
  const categoryNameGap = isHorizontal ? 38 : 30;
  const valueNameGap = isHorizontal ? 30 : 38;
  const categoryAxis = {
    type: "category",
    // Bars sit BETWEEN ticks — the opposite of the area chart's boundaryGap:false.
    boundaryGap: true,
    show: true,
    // The Recharts YAxis lists its first category at the TOP; ECharts' y category
    // axis defaults to bottom-up, so flip it when the category axis is on y.
    inverse: isHorizontal,
    data: catData,
    // Axis title — same size/color as the tick labels, pushed clear of them. The
    // category axis carries the label of whichever <XAxis>/<YAxis> child renders it.
    name: isLoading ? void 0 : categorySlot.label,
    nameLocation: "middle",
    nameGap: categoryNameGap,
    nameTextStyle: { color: axisLabelColor, fontSize: 10 },
    axisLine: { show: false },
    // Tick DOTS: a near-zero-length tick whose round caps form a true circle, in
    // the gridline gray (flattened opaque so the caps don't stack).
    axisTick: {
      show: !isLoading && categorySlot.present && !categorySlot.hideDots,
      length: 0.5,
      // Bars use boundaryGap, so ECharts would drop each tick on the BOUNDARY
      // between two categories — a dot floating between labels rather than under
      // one. Align them to the labels instead.
      alignWithLabel: true,
      lineStyle: { color: tickDotColor, width: 3, cap: "round" }
    },
    splitLine: { show: false },
    axisLabel: {
      show: !isLoading && categorySlot.present,
      color: axisLabelColor,
      fontSize: 10,
      margin: 8,
      formatter: catFormatter ? (value, index) => catFormatter(value, index) : void 0
    }
  };
  const valueAxis = {
    type: "value",
    show: valueSlot.present || showGrid,
    max: isPercent ? 1 : void 0,
    // Axis title — same styling as the category axis; the value axis carries the
    // label of the other of the two <XAxis>/<YAxis> children.
    name: isLoading ? void 0 : valueSlot.label,
    nameLocation: "middle",
    nameGap: valueNameGap,
    nameTextStyle: { color: axisLabelColor, fontSize: 10 },
    axisLine: { show: false },
    // Same tick dots as the category axis, beside each value label.
    axisTick: {
      show: valueSlot.present && !isLoading && !valueSlot.hideDots,
      length: 0.5,
      // Inert here — ECharts only honors it for CATEGORY ticks, and this axis is
      // always type:"value". Carried so both axes' tick config stays identical.
      lineStyle: { color: tickDotColor, width: 3, cap: "round" }
    },
    splitLine: {
      // Hidden while loading — the skeleton floats on a clean canvas.
      show: showGrid && !isLoading,
      lineStyle: { color: splitLineColor, type: [3, 3], width: 1 }
    },
    axisLabel: {
      // Hidden while loading — skeleton values are meaningless, and the Recharts
      // axes unmount during loading too.
      show: valueSlot.present && !isLoading,
      color: axisLabelColor,
      fontSize: 10,
      margin: 8,
      formatter: isPercent ? (value) => `${Math.round(value * 100)}%` : valFormatter ? (value, index) => valFormatter(String(value), index) : void 0
    }
  };
  return isHorizontal ? { xAxis: valueAxis, yAxis: categoryAxis } : { xAxis: categoryAxis, yAxis: valueAxis };
}
function createTooltipFormatter(ctx) {
  const { config, selectedDataKey, tooltipSlot } = ctx;
  return (params) => {
    const rows = Array.isArray(params) ? params : [params];
    if (!rows.length) return "";
    const first = rows[0];
    const axisValue = first.axisValue ?? first.name ?? "";
    const label = String(axisValue);
    const body = rows.map((param) => {
      const p = param;
      if (String(p.seriesId ?? "").startsWith("__")) return "";
      const key = p.seriesId ?? p.seriesName ?? "";
      const item = config[key];
      const colorsCount = item ? getColorsCount(item) : 1;
      const labelText = typeof item?.label === "string" ? item.label : p.seriesName ?? key;
      const dimmed = selectedDataKey != null && selectedDataKey !== key ? " opacity-30" : "";
      const value = typeof p.value === "number" ? p.value.toLocaleString() : String(p.value ?? "");
      return tooltipRow({
        indicatorHtml: tooltipIndicatorHtml(key, colorsCount),
        labelText,
        valueText: value,
        dimmed
      });
    }).join("");
    return tooltipShell({
      label,
      body,
      roundness: tooltipSlot.roundness,
      variant: tooltipSlot.variant
    });
  };
}
function buildTooltipOption(ctx) {
  const { tooltipSlot, isLoading } = ctx;
  const { tokens } = ctx.resolved;
  return {
    ...tooltipBaseOption({
      present: tooltipSlot.present && !isLoading,
      // The twin disables the cursor (`cursor={false}`) — no shadow, no line —
      // so the axisPointer color/width below go unused; only `position` applies.
      cursor: false,
      tokens,
      position: tooltipSlot.position,
      axisPointerColor: tokens.border,
      strokeWidth: STROKE_WIDTH
    }),
    formatter: createTooltipFormatter(ctx)
  };
}
function buildBrushOption(ctx, brushBottom) {
  const { data, bars, isStacked, selectedDataKey, hasSelection, brushHeight, categories } = ctx;
  const { tokens } = ctx.resolved;
  const miniGrid = {
    left: 8,
    right: 8,
    bottom: brushBottom,
    height: brushHeight,
    // No visible axes here — opt out of label containment so the mini chart
    // spans the full brush frame.
    outerBoundsMode: "none"
  };
  const miniXAxis = {
    type: "category",
    gridIndex: 1,
    boundaryGap: true,
    show: false,
    data: categories,
    axisPointer: { show: false }
  };
  const miniYAxis = { type: "value", gridIndex: 1, show: false };
  const miniSeries = bars.map((bar) => {
    const key = bar.dataKey;
    const base = (ctx.resolved.series[key] ?? [])[0] ?? GRAY;
    const dim = hasSelection && selectedDataKey !== key ? SELECTION_DIM : 1;
    return {
      id: `__mini-${key}`,
      type: "bar",
      xAxisIndex: 1,
      yAxisIndex: 1,
      data: data.map((row) => Number(row[key]) || 0),
      stack: isStacked ? "__mini-total" : void 0,
      silent: true,
      barCategoryGap: "20%",
      emphasis: { disabled: true },
      tooltip: { show: false },
      itemStyle: { color: base, opacity: BRUSH_FILL_OPACITY * dim, borderRadius: 1 },
      z: 0,
      animation: false
    };
  });
  const dataZoom = buildBrushDataZoom({
    brushBottom,
    brushHeight,
    brushRange: ctx.brushRange,
    fillerColor: withAlpha(tokens.foreground, BRUSH_FILLER_OPACITY)
  });
  return { miniGrid, miniXAxis, miniYAxis, miniSeries, dataZoom };
}
function buildLoadingOption(ctx, frame) {
  const { tokens } = ctx.resolved;
  return {
    animation: false,
    grid: frame.grid,
    xAxis: frame.xAxis,
    yAxis: frame.yAxis,
    tooltip: { show: false },
    series: [
      {
        id: "__loading",
        type: "bar",
        data: ctx.loadingData(),
        barCategoryGap: "30%",
        silent: true,
        // Invisible until the first shimmer tick positions the clip window.
        itemStyle: {
          color: withAlpha(tokens.foreground, 0),
          borderRadius: barBorderRadius(DEFAULT_BAR_RADIUS, "default", ctx.isHorizontal)
        },
        z: 1
      }
    ]
  };
}
function buildBarSeries(ctx) {
  const {
    data,
    config,
    bars,
    seriesKeys,
    animationType,
    isHorizontal,
    isStacked,
    isPercent,
    selectedDataKey,
    hasSelection,
    barGap,
    barCategoryGap,
    resolved
  } = ctx;
  const lastIndex = data.length - 1;
  const rowTotals = isPercent ? data.map((row) => seriesKeys.reduce((sum, key) => sum + (Number(row[key]) || 0), 0)) : [];
  const series = bars.map((bar) => {
    const key = bar.dataKey;
    const slots = resolved.series[key] ?? [GRAY];
    const base = slots[0] ?? GRAY;
    const isSelected = selectedDataKey === key;
    const dim = selectionOpacity(selectedDataKey, key);
    const resolvedRadius = bar.radius ?? ctx.barRadius;
    const borderRadius = barBorderRadius(resolvedRadius, bar.variant, isHorizontal);
    const blockSize = ctx.barWidthPx ?? BLOCK_SIZE;
    const fill = barFillPaint(bar.variant, slots, isHorizontal, blockSize);
    const barAnim = bar.animationType ?? animationType;
    const isStripped = bar.variant === "stripped";
    const isExpandable = bar.variant === "expandable";
    const mutedFill = withAlpha(resolved.tokens.mutedForeground, MAX_HIGHLIGHT_DIM);
    const isMuted = (i) => ctx.maxHighlightIndex != null && i !== ctx.maxHighlightIndex;
    const expandOf = (i) => ctx.expand.key === key ? ctx.expand.progress.get(i) ?? EXPAND_COLLAPSED : EXPAND_COLLAPSED;
    const expandHovered = ctx.expand.key === key ? ctx.expand.hovered : null;
    const isBlocks = bar.variant === "blocks";
    const blockTrack = isBlocks ? patternFill(
      "blocks",
      withAlpha(resolved.tokens.mutedForeground, BLOCK_TRACK_OPACITY),
      blockSize
    ) : null;
    const values = data.map((row, i) => {
      const value = Number(row[key]) || 0;
      if (!isPercent) return value;
      const total = rowTotals[i];
      return total ? value / total : 0;
    });
    const bufferStyle = bar.bufferBar ? {
      color: patternFill("buffer", base) ?? "transparent",
      borderColor: base,
      borderWidth: STROKE_WIDTH,
      borderRadius
    } : null;
    const glowAt = (i) => ({
      shadowBlur: GLOW_BLUR,
      shadowColor: withAlpha(
        sampleGradient(slots, values.length > 1 ? i / (values.length - 1) : 0),
        GLOW_OPACITY
      )
    });
    const glowFor = bar.glowing ? glowAt : ctx.maxHighlightIndex != null ? (i) => i === ctx.maxHighlightIndex ? glowAt(i) : {} : null;
    const dataPoints = isStripped || isExpandable || glowFor || ctx.maxHighlightIndex != null || bufferStyle && lastIndex >= 0 ? values.map((value, i) => {
      const isBuffer = !!bufferStyle && i === lastIndex;
      if (!isBuffer && !glowFor && !isStripped && !isExpandable && !isMuted(i)) return value;
      return {
        value,
        ...isExpandable ? { label: { show: i === expandHovered } } : {},
        itemStyle: {
          // The stripped cap is per datum: its fixed pixel height becomes a
          // fraction of THIS bar's own height, so the cap is a constant pixel
          // height across bars. The buffer tip (bare hatched) still wins on
          // the last datum.
          ...isStripped && !isBuffer ? {
            color: strippedDatumPaint(
              slots,
              isHorizontal,
              strippedCapFraction(value, ctx.valuePxPerUnit)
            )
          } : {},
          ...isExpandable && !isBuffer ? { color: expandableDatumPaint(slots, expandOf(i)) } : {},
          ...isBuffer && bufferStyle ? bufferStyle : {},
          ...glowFor ? glowFor(i) : {},
          // Last so it overrides the variant's own paint.
          ...isMuted(i) ? { color: mutedFill } : {}
        }
      };
    }) : values;
    return {
      id: key,
      name: typeof config[key]?.label === "string" ? config[key]?.label : key,
      type: "bar",
      data: dataPoints,
      stack: isStacked ? "total" : void 0,
      barGap,
      barCategoryGap,
      cursor: bar.isClickable ? "pointer" : "default",
      // Selected series ride on top; when a selection is active the rest sink below.
      z: isSelected ? 3 : hasSelection ? 1 : 2,
      // The hovered bar names its value above itself (Recharts twin parity).
      label: isExpandable ? {
        show: false,
        position: "top",
        color: resolved.tokens.foreground,
        fontFamily: "var(--font-mono, monospace)",
        fontSize: 11
      } : void 0,
      showBackground: isBlocks,
      backgroundStyle: blockTrack ? { color: blockTrack, borderRadius } : void 0,
      itemStyle: {
        color: fill,
        borderRadius,
        opacity: dim
        // The glow lives on each datum's itemStyle (per-bar sampled shadowColor),
        // not here — a single series-level shadowColor can't follow a gradient.
      },
      // Hover-highlight uses ECharts-native focus/blur: `self` keeps only the
      // hovered bar lit and dims every other, matching the twin's per-bar dim.
      // A click-selection OWNS the dim while it is active, so hover highlighting
      // switches off entirely whenever a selection exists (this option rebuilds on
      // every selection change, and the notMerge push clears any live blur) and
      // resumes once the selection clears. Otherwise emphasis is disabled so
      // hovering leaves the bar untouched.
      emphasis: bar.enableHoverHighlight && !hasSelection ? { focus: "self", blurScope: "coordinateSystem" } : { disabled: true },
      blur: bar.enableHoverHighlight && !hasSelection ? { itemStyle: { opacity: HOVER_BLUR } } : void 0,
      // The grow-in envelope. Only takes effect on the reveal push (top-level
      // `animation: true`); every later push sends `animation: false`, so the
      // per-datum stagger is dormant then.
      animationDuration: BAR_GROW_DURATION,
      animationEasing: "cubicOut",
      animationDelay: (idx) => barStaggerDelay(barAnim, idx, data.length)
    };
  });
  const gapUnits = (isStacked || isPercent) && series.length > 1 && ctx.valuePxPerUnit ? STACK_SEGMENT_GAP / ctx.valuePxPerUnit : 0;
  if (!gapUnits) return series;
  const spaced = [];
  series.forEach((entry, i) => {
    spaced.push(entry);
    if (i === series.length - 1) return;
    spaced.push({
      id: `__stackgap-${i}`,
      type: "bar",
      stack: isStacked ? "total" : void 0,
      data: data.map(() => gapUnits),
      itemStyle: { color: "transparent" },
      silent: true,
      tooltip: { show: false },
      legendHoverLink: false,
      emphasis: { disabled: true },
      animation: false,
      z: 1
    });
  });
  return spaced;
}
function EChartsBarChart({
  data,
  config,
  renderer = DEFAULT_ECHARTS_RENDERER,
  xDataKey,
  className,
  stackType = "default",
  layout = "vertical",
  barRadius = DEFAULT_BAR_RADIUS,
  animation = true,
  animationType = "left-to-right",
  barGap,
  barCategoryGap,
  defaultSelectedDataKey = null,
  onSelectionChange,
  enableMaxValueHighlight = false,
  isLoading = false,
  loadingBars = LOADING_DEFAULT_BARS,
  chartOptions,
  children
}) {
  const rawId = useId();
  const chartId = `chart-${rawId.replace(/:/g, "")}`;
  const containerRef = useRef(null);
  const mountRef = useRef(null);
  const echartsRef = useRef(null);
  const live = useRef({
    resolved: null,
    hasRevealed: false,
    revealEndsAt: 0,
    valuePxPerUnit: null,
    barWidthPx: null,
    expand: { key: null, hovered: null, progress: /* @__PURE__ */ new Map() },
    expandRaf: 0,
    animateExpand: () => {
    },
    loadingRows: null,
    categories: [],
    dataLength: 0,
    brushRange: { start: 0, end: 100 },
    brushGeom: null,
    brushOverlay: null,
    brushHover: { inside: false, left: false, right: false },
    handlers: {
      onBrushChange: void 0,
      // set per-render from the <Brush> child's onChange
      clickableKeys: /* @__PURE__ */ new Set(),
      brushFormatLabel: void 0,
      // set per-render from the <Brush> child's formatLabel
      seriesKeys: [],
      hasStripped: false,
      hasBlocks: false,
      hasStackGap: false,
      expandableKey: null,
      isHorizontal: false
    },
    repush: () => {
    },
    patchStrippedCaps: () => {
    }
  }).current;
  const loadingData = useCallback(
    () => live.loadingRows ??= getLoadingBarData(loadingBars),
    [live, loadingBars]
  );
  const shouldReduceMotion = useReducedMotion();
  const [selectedDataKey, setSelectedDataKey] = useState(defaultSelectedDataKey);
  const collected = useMemo(() => collectConfig(children), [children]);
  const {
    bars,
    xAxis: xAxisSlot,
    yAxis: yAxisSlot,
    showGrid,
    tooltip: tooltipSlot,
    legend: legendSlot,
    brush: brushSlot
  } = collected;
  const showBrush = brushSlot.present;
  const brushHeight = brushSlot.height ?? 56;
  const isHorizontal = layout === "horizontal";
  const isPercent = stackType === "percent";
  const isStacked = stackType === "stacked" || isPercent;
  const categorySlot = isHorizontal ? yAxisSlot : xAxisSlot;
  const valueSlot = isHorizontal ? xAxisSlot : yAxisSlot;
  const seriesKeys = useMemo(() => bars.map((bar) => bar.dataKey), [bars]);
  const categoryKey = useMemo(() => {
    if (categorySlot.dataKey) return categorySlot.dataKey;
    if (xDataKey) return xDataKey;
    const firstRow = data[0];
    if (firstRow) {
      const claimed = new Set(seriesKeys);
      const found = Object.keys(firstRow).find((key) => !claimed.has(key));
      if (found) return found;
    }
    return "";
  }, [categorySlot.dataKey, xDataKey, data, seriesKeys]);
  const effectiveAnimation = bars[0]?.animationType ?? animationType;
  const maxHighlightIndex = useMemo(() => {
    if (!enableMaxValueHighlight || !data.length || !seriesKeys.length) return null;
    let best = 0;
    let bestTotal = -Infinity;
    data.forEach((row, i) => {
      const total = seriesKeys.reduce((sum, key) => sum + (Number(row[key]) || 0), 0);
      if (total > bestTotal) {
        bestTotal = total;
        best = i;
      }
    });
    return best;
  }, [enableMaxValueHighlight, data, seriesKeys]);
  const css = useMemo(() => buildChartCss(chartId, config), [chartId, config]);
  const hasSelection = selectedDataKey !== null;
  const clickableKeys = useMemo(
    () => new Set(bars.filter((bar) => bar.isClickable).map((bar) => bar.dataKey)),
    [bars]
  );
  const hasStrippedBars = !isLoading && bars.some((bar) => bar.variant === "stripped");
  live.handlers = {
    onBrushChange: brushSlot.onChange,
    clickableKeys,
    brushFormatLabel: brushSlot.formatLabel,
    seriesKeys,
    hasStripped: hasStrippedBars,
    hasBlocks: bars.some((bar) => bar.variant === "blocks"),
    hasStackGap: (stackType === "stacked" || stackType === "percent") && bars.length > 1,
    expandableKey: bars.find((bar) => bar.variant === "expandable")?.dataKey ?? null,
    barCategoryGap,
    isHorizontal
  };
  live.dataLength = data.length;
  const toggleSelection = useCallback(
    (key) => {
      setSelectedDataKey((prev) => {
        const next = prev === key ? null : key;
        onSelectionChange?.(next);
        return next;
      });
    },
    [onSelectionChange]
  );
  const brushEnabled = showBrush && !isHorizontal;
  const syncBrushOverlayNow = useCallback(() => {
    const chart = echartsRef.current;
    if (!chart) return;
    const geom = live.brushGeom;
    const tokens = live.resolved?.tokens;
    if (!geom || !tokens) {
      syncBrushOverlay(chart, live, null);
      return;
    }
    const range = live.brushRange;
    const categories = live.categories;
    const format = live.handlers.brushFormatLabel;
    const lastIndex = Math.max(categories.length - 1, 0);
    const startIndex = Math.round(range.start / 100 * lastIndex);
    const endIndex = Math.round(range.end / 100 * lastIndex);
    const labels = format && categories.length ? {
      start: format(categories[startIndex] ?? "", startIndex),
      end: format(categories[endIndex] ?? "", endIndex)
    } : null;
    syncBrushOverlay(chart, live, {
      range,
      geom,
      size: { width: chart.getWidth(), height: chart.getHeight() },
      tokens,
      labels,
      showLabels: live.brushHover.inside,
      hover: live.brushHover
    });
  }, [live]);
  const buildOption = useCallback(() => {
    const resolved = live.resolved;
    if (!resolved) return {};
    const categories = data.map((row) => String(row[categoryKey]));
    live.categories = categories;
    const ctx = {
      data,
      config,
      bars,
      seriesKeys,
      animationType,
      barRadius,
      isHorizontal,
      isStacked,
      isPercent,
      selectedDataKey,
      hasSelection,
      showGrid,
      categorySlot,
      valueSlot,
      tooltipSlot,
      legendSlot,
      isLoading,
      loadingData,
      showBrush: brushEnabled,
      brushHeight,
      barGap,
      barCategoryGap,
      resolved,
      categories,
      brushRange: live.brushRange,
      valuePxPerUnit: live.valuePxPerUnit,
      barWidthPx: live.barWidthPx,
      expand: live.expand,
      maxHighlightIndex
    };
    const { grid, brushBottom } = buildChartLayout(ctx);
    live.brushGeom = brushEnabled ? { bottom: brushBottom, height: brushHeight } : null;
    const { xAxis, yAxis } = buildMainAxes(ctx);
    if (isLoading) return buildLoadingOption(ctx, { grid, xAxis, yAxis });
    const brush = brushEnabled ? buildBrushOption(ctx, brushBottom) : null;
    return {
      animation: false,
      grid: brush ? [grid, brush.miniGrid] : grid,
      xAxis: brush ? [xAxis, brush.miniXAxis] : xAxis,
      yAxis: brush ? [yAxis, brush.miniYAxis] : yAxis,
      tooltip: buildTooltipOption(ctx),
      dataZoom: brush?.dataZoom,
      series: [...buildBarSeries(ctx), ...brush?.miniSeries ?? []]
    };
  }, [
    live,
    data,
    config,
    bars,
    seriesKeys,
    categoryKey,
    animationType,
    barRadius,
    isHorizontal,
    isStacked,
    isPercent,
    selectedDataKey,
    hasSelection,
    showGrid,
    categorySlot,
    valueSlot,
    tooltipSlot,
    legendSlot,
    isLoading,
    loadingData,
    brushEnabled,
    brushHeight,
    barGap,
    barCategoryGap,
    maxHighlightIndex
  ]);
  useEffect(() => {
    const mount = mountRef.current;
    const container = containerRef.current;
    if (!mount || !container) return;
    const chart = echarts.init(mount, null, { renderer });
    echartsRef.current = chart;
    const resizeObserver = new ResizeObserver(() => {
      if (mount.clientWidth === chart.getWidth() && mount.clientHeight === chart.getHeight()) {
        return;
      }
      chart.resize();
      live.repush();
    });
    resizeObserver.observe(mount);
    const themeObserver = new MutationObserver(() => {
      live.repush();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"]
    });
    chart.getZr().on("mousemove", (event) => {
      const { expandableKey } = live.handlers;
      if (!expandableKey) return;
      const point = [event.offsetX, event.offsetY];
      if (!chart.containPixel({ gridIndex: 0 }, point)) {
        live.animateExpand(expandableKey, null);
        return;
      }
      const converted = chart.convertFromPixel({ gridIndex: 0 }, point);
      const index = Array.isArray(converted) ? converted[0] : converted;
      live.animateExpand(expandableKey, typeof index === "number" ? Math.round(index) : null);
    });
    chart.getZr().on("globalout", () => {
      const { expandableKey } = live.handlers;
      if (expandableKey) live.animateExpand(expandableKey, null);
    });
    chart.on("click", (params) => {
      const { clickableKeys: clickable, seriesKeys: keys } = live.handlers;
      const p = params;
      const id = p.seriesId ?? (typeof p.seriesIndex === "number" ? keys[p.seriesIndex] : void 0);
      if (typeof id === "string" && clickable.has(id)) toggleSelection(id);
    });
    chart.on("datazoom", () => {
      const option = chart.getOption();
      const zoom = option.dataZoom?.[0];
      if (!zoom) return;
      live.brushRange = { start: zoom.start ?? 0, end: zoom.end ?? 100 };
      syncBrushOverlayNow();
      const { onBrushChange: onChange } = live.handlers;
      if (!onChange) return;
      const len = live.dataLength;
      const startIndex = Math.round((zoom.start ?? 0) / 100 * (len - 1));
      const endIndex = Math.round((zoom.end ?? 100) / 100 * (len - 1));
      onChange({ startIndex, endIndex });
    });
    chart.on("finished", () => {
      const { hasStripped, isHorizontal: horiz } = live.handlers;
      if (!hasStripped || performance.now() < live.revealEndsAt) return;
      const measured = measureValuePxPerUnit(chart, horiz);
      if (measured == null) return;
      if (live.valuePxPerUnit != null && Math.abs(measured - live.valuePxPerUnit) < 0.5) return;
      live.valuePxPerUnit = measured;
      live.patchStrippedCaps();
    });
    const zr = chart.getZr();
    const applyHover = (next) => {
      const prev = live.brushHover;
      if (prev.inside === next.inside && prev.left === next.left && prev.right === next.right) {
        return;
      }
      live.brushHover = next;
      syncBrushOverlayNow();
    };
    const onZrMove = (event) => {
      const geom = live.brushGeom;
      if (!geom) return;
      const x = event.offsetX ?? -1;
      const y = event.offsetY ?? -1;
      const top = chart.getHeight() - geom.bottom - geom.height;
      const inside = y >= top - 4 && y <= top + geom.height + 4;
      const trackLeft = 8;
      const trackWidth = Math.max(chart.getWidth() - 16, 1);
      const { start, end } = live.brushRange;
      const selectionLeft = trackLeft + trackWidth * start / 100;
      const selectionRight = trackLeft + trackWidth * end / 100;
      applyHover({
        inside,
        left: inside && Math.abs(x - selectionLeft) <= 8,
        right: inside && Math.abs(x - selectionRight) <= 8
      });
    };
    const onZrOut = () => applyHover({ inside: false, left: false, right: false });
    zr.on("mousemove", onZrMove);
    zr.on("globalout", onZrOut);
    return () => {
      zr.off("mousemove", onZrMove);
      zr.off("globalout", onZrOut);
      resizeObserver.disconnect();
      themeObserver.disconnect();
      if (live.expandRaf) {
        cancelAnimationFrame(live.expandRaf);
        live.expandRaf = 0;
      }
      chart.dispose();
      echartsRef.current = null;
      live.brushOverlay = null;
      live.brushHover = { inside: false, left: false, right: false };
      live.expand = { key: null, hovered: null, progress: /* @__PURE__ */ new Map() };
      live.animateExpand = () => {
      };
      live.valuePxPerUnit = null;
      live.barWidthPx = null;
      live.hasRevealed = false;
    };
  }, [renderer]);
  useEffect(() => {
    const chart = echartsRef.current;
    const container = containerRef.current;
    if (!chart || !container) return;
    live.resolved = resolveColors(container, config, seriesKeys);
    const push = (withEntrance) => {
      const measured = measureValuePxPerUnit(chart, isHorizontal);
      if (measured != null) live.valuePxPerUnit = measured;
      const apply = () => {
        const option = buildOption();
        const merged = chartOptions ? { ...option, ...chartOptions } : option;
        Object.assign(merged, {
          animation: withEntrance,
          animationDuration: BAR_GROW_DURATION,
          animationDurationUpdate: 0
        });
        chart.setOption(merged, { notMerge: true });
      };
      apply();
      let needsRebuild = false;
      if (live.handlers.hasBlocks) {
        const width = measureBarWidthPx(chart, isHorizontal, barCategoryGap);
        if (width != null && (live.barWidthPx == null || Math.abs(width - live.barWidthPx) > 0.5)) {
          live.barWidthPx = width;
          needsRebuild = true;
        }
      }
      if (live.handlers.hasStackGap || live.handlers.hasStripped) {
        const scale = measureValuePxPerUnit(chart, isHorizontal);
        if (scale != null && (live.valuePxPerUnit == null || live.valuePxPerUnit !== scale)) {
          live.valuePxPerUnit = scale;
          needsRebuild = true;
        }
      }
      if (needsRebuild) apply();
      const maxStagger = data.length > 1 ? (data.length - 1) * BAR_STAGGER : 0;
      live.revealEndsAt = withEntrance ? performance.now() + BAR_GROW_DURATION + maxStagger : 0;
      syncBrushOverlayNow();
    };
    live.animateExpand = (key, index) => {
      const expandKeys = new Set(
        bars.filter((bar) => bar.variant === "expandable").map((bar) => bar.dataKey)
      );
      if (!expandKeys.size) return;
      const next = index != null && key != null ? index : null;
      if (live.expand.hovered === next && (key == null || live.expand.key === key)) return;
      if (key != null) live.expand.key = key;
      live.expand.hovered = next;
      if (next != null && !live.expand.progress.has(next)) {
        live.expand.progress.set(next, EXPAND_COLLAPSED);
      }
      if (live.expandRaf) return;
      const patchOnce = () => {
        const option = buildOption();
        const series = Array.isArray(option.series) ? option.series : option.series ? [option.series] : [];
        const patch = series.filter(
          (s) => typeof s?.id === "string" && expandKeys.has(s.id)
        );
        if (patch.length) chart.setOption({ series: patch }, { silent: true, lazyUpdate: true });
      };
      let last = performance.now();
      const step = () => {
        const now = performance.now();
        const dt = Math.min(64, now - last);
        last = now;
        const k = 1 - Math.exp(-dt / EXPAND_TAU);
        let moving = false;
        for (const [i, value] of live.expand.progress) {
          const target = i === live.expand.hovered ? 1 : EXPAND_COLLAPSED;
          const eased = value + (target - value) * k;
          if (Math.abs(target - eased) < 4e-3) {
            if (target === EXPAND_COLLAPSED) live.expand.progress.delete(i);
            else live.expand.progress.set(i, target);
          } else {
            live.expand.progress.set(i, eased);
            moving = true;
          }
        }
        patchOnce();
        live.expandRaf = moving ? requestAnimationFrame(step) : 0;
      };
      live.expandRaf = requestAnimationFrame(step);
    };
    live.patchStrippedCaps = () => {
      const option = buildOption();
      const series = Array.isArray(option.series) ? option.series : option.series ? [option.series] : [];
      const strippedKeys = new Set(
        bars.filter((bar) => bar.variant === "stripped").map((bar) => bar.dataKey)
      );
      const patch = series.filter(
        (s) => typeof s?.id === "string" && strippedKeys.has(s.id)
      );
      if (patch.length) chart.setOption({ series: patch }, { silent: true, lazyUpdate: true });
    };
    if (isLoading) live.hasRevealed = false;
    const shouldReveal = !live.hasRevealed && !isLoading;
    if (shouldReveal) live.hasRevealed = true;
    const revealEnabled = animation && shouldReveal && effectiveAnimation !== "none" && !shouldReduceMotion;
    push(revealEnabled);
    live.repush = () => {
      live.resolved = resolveColors(container, config, seriesKeys);
      push(false);
    };
  }, [
    renderer,
    live,
    buildOption,
    chartOptions,
    isLoading,
    animation,
    effectiveAnimation,
    shouldReduceMotion,
    config,
    seriesKeys,
    data.length,
    bars,
    isHorizontal,
    barCategoryGap,
    syncBrushOverlayNow
  ]);
  useEffect(() => {
    const chart = echartsRef.current;
    const index = tooltipSlot.defaultIndex;
    if (!chart || isLoading || !tooltipSlot.present || index == null) return;
    const timer = setTimeout(() => {
      chart.dispatchAction({ type: "showTip", seriesIndex: 0, dataIndex: index });
    }, 300);
    return () => clearTimeout(timer);
  }, [
    renderer,
    tooltipSlot.present,
    tooltipSlot.defaultIndex,
    isLoading,
    data.length,
    seriesKeys.length
  ]);
  useEffect(() => {
    const chart = echartsRef.current;
    if (!chart || !isLoading) return;
    let raf = 0;
    let lastPhase = 0;
    const start = performance.now();
    const tick = (now) => {
      const phase = ((now - start) / LOADING_ANIMATION_DURATION % 1 + 1) % 1;
      if (phase < lastPhase) live.loadingRows = getLoadingBarData(loadingBars);
      lastPhase = phase;
      const foreground = live.resolved?.tokens.foreground ?? GRAY;
      const w = chart.getWidth();
      const h = chart.getHeight();
      if (!w || !h) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const maxT = (w + h) / (2 * w);
      const center = phase * (maxT + 2 * LOADING_SHIMMER_BAND) - LOADING_SHIMMER_BAND;
      const fill = new echarts.graphic.LinearGradient(
        0,
        0,
        w,
        w,
        shimmerWindowStops(center, foreground, LOADING_SHIMMER_MAX_OPACITY),
        true
      );
      chart.setOption(
        { series: [{ id: "__loading", data: loadingData(), itemStyle: { color: fill } }] },
        { silent: true, lazyUpdate: true }
      );
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [renderer, live, isLoading, loadingBars, loadingData]);
  const legendStyle = {
    position: "absolute",
    left: 16,
    right: 16,
    pointerEvents: "auto",
    ...legendSlot.verticalAlign === "top" ? { top: 12 } : legendSlot.verticalAlign === "bottom" ? { bottom: brushEnabled ? brushHeight + 16 : 12 } : { top: "50%", transform: "translateY(-50%)" }
  };
  return /* @__PURE__ */ jsxs(
    "div",
    {
      ref: containerRef,
      "data-chart": chartId,
      className: `relative flex flex-col text-xs ${className ?? ""}`,
      children: [
        /* @__PURE__ */ jsx("style", { dangerouslySetInnerHTML: { __html: css } }),
        /* @__PURE__ */ jsx("div", { className: "relative min-h-0 w-full flex-1", children: /* @__PURE__ */ jsx("div", { ref: mountRef, className: "h-full min-h-0 w-full" }) }),
        legendSlot.present && !isLoading && /* @__PURE__ */ jsx(
          LegendOverlay,
          {
            seriesKeys,
            config,
            variant: legendSlot.variant,
            align: legendSlot.align,
            verticalAlign: legendSlot.verticalAlign,
            selectedKey: selectedDataKey,
            hoveredKey: null,
            isClickable: legendSlot.isClickable,
            onToggle: toggleSelection,
            style: legendStyle
          }
        ),
        isLoading && /* @__PURE__ */ jsx("div", { className: "pointer-events-none absolute inset-0 z-20 flex items-center justify-center", children: /* @__PURE__ */ jsxs(
          motion.div,
          {
            initial: shouldReduceMotion ? false : { opacity: 0, scale: 0.92 },
            animate: { opacity: 1, scale: 1 },
            transition: { duration: 0.25, ease: "easeOut" },
            className: "text-primary bg-background flex items-center justify-center gap-2 rounded-md border px-2 py-0.5 text-sm",
            children: [
              /* @__PURE__ */ jsx("div", { className: "border-border border-t-primary h-3 w-3 animate-spin rounded-full border" }),
              /* @__PURE__ */ jsx("span", { children: "Loading" })
            ]
          }
        ) })
      ]
    }
  );
}
function getLoadingBarData(bars) {
  const rows = [];
  let value = 40 + Math.random() * 25;
  for (let i = 0; i < bars; i++) {
    value = Math.min(85, Math.max(20, value + (Math.random() - 0.5) * 30));
    rows.push(Math.round(value));
  }
  return rows;
}
function shimmerWindowStops(center, color, peak) {
  const half = LOADING_SHIMMER_BAND;
  const feather = LOADING_SHIMMER_FEATHER;
  const alphaAt = (x) => {
    const dist = Math.abs(x - center);
    if (dist <= half - feather) return peak;
    if (dist >= half) return 0;
    return peak * Math.sin((1 - (dist - (half - feather)) / feather) * Math.PI / 2);
  };
  const offsets = [
    0,
    center - half,
    center - half + feather,
    center,
    center + half - feather,
    center + half,
    1
  ].filter((x) => x >= 0 && x <= 1).sort((a, b) => a - b);
  const stops = [];
  for (const offset of offsets) {
    if (stops.length === 0 || offset - stops[stops.length - 1].offset > 1e-4) {
      stops.push({ offset, color: withAlpha(color, alphaAt(offset)) });
    }
  }
  return stops;
}
EChartsBarChart.Bar = Bar;
EChartsBarChart.XAxis = XAxis;
EChartsBarChart.YAxis = YAxis;
EChartsBarChart.Grid = Grid;
EChartsBarChart.Tooltip = Tooltip;
EChartsBarChart.Legend = Legend;
EChartsBarChart.Brush = Brush;
export {
  EChartsBarChart
};
