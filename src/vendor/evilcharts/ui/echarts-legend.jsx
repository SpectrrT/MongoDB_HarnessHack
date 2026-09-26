"use client";
import { jsx, jsxs } from "react/jsx-runtime";
import { getColorsCount, indicatorBackground } from "./echarts-chart";
function legendFillStyle(key, colorsCount) {
  if (colorsCount <= 1) return { backgroundColor: `var(--color-${key}-0)` };
  return { background: indicatorBackground(key, colorsCount) };
}
function legendOutlineStyle(key, colorsCount) {
  const mask = {
    WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
    WebkitMaskComposite: "xor",
    mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
    maskComposite: "exclude"
  };
  return { ...legendFillStyle(key, colorsCount), ...mask };
}
function LegendIndicator({
  variant,
  dataKey,
  colorsCount
}) {
  const fill = legendFillStyle(dataKey, colorsCount);
  const outline = legendOutlineStyle(dataKey, colorsCount);
  switch (variant) {
    case "square":
      return /* @__PURE__ */ jsx("div", { className: "h-2 w-2 shrink-0", style: fill });
    case "circle":
      return /* @__PURE__ */ jsx("div", { className: "h-2 w-2 shrink-0 rounded-full", style: fill });
    case "circle-outline":
      return /* @__PURE__ */ jsx("div", { className: "h-2.5 w-2.5 shrink-0 rounded-full p-[1.5px]", style: outline });
    case "vertical-bar":
      return /* @__PURE__ */ jsx("div", { className: "h-3 w-1 shrink-0 rounded-[2px]", style: fill });
    case "horizontal-bar":
      return /* @__PURE__ */ jsx("div", { className: "h-1 w-3 shrink-0 rounded-[2px]", style: fill });
    case "rounded-square-outline":
      return /* @__PURE__ */ jsx("div", { className: "h-2.5 w-2.5 shrink-0 rounded-[3px] p-[1.5px]", style: outline });
    case "rounded-square":
    default:
      return /* @__PURE__ */ jsx("div", { className: "h-2 w-2 shrink-0 rounded-[2px]", style: fill });
  }
}
function LegendOverlay({
  seriesKeys,
  config,
  variant,
  align,
  selectedKey,
  hoveredKey,
  isClickable,
  onToggle,
  style
}) {
  const legendJustify = align === "left" ? "justify-start" : align === "center" ? "justify-center" : "justify-end";
  return /* @__PURE__ */ jsx("div", { style, className: `flex items-center gap-4 select-none ${legendJustify}`, children: seriesKeys.map((key) => {
    const item = config[key];
    const colorsCount = item ? getColorsCount(item) : 1;
    const isSelected = (selectedKey === null || selectedKey === key) && (hoveredKey === null || hoveredKey === key);
    return (
      // No entrance here — the Recharts legend appears instantly, and a
      // fade-in reads as disconnected from the canvas draw-in.
      /* @__PURE__ */ jsxs(
        "div",
        {
          className: `flex items-center gap-1.5 transition-opacity ${!isSelected ? "opacity-30" : ""} ${isClickable ? "cursor-pointer" : ""}`,
          onClick: () => {
            if (isClickable) onToggle(key);
          },
          children: [
            /* @__PURE__ */ jsx(LegendIndicator, { variant, dataKey: key, colorsCount }),
            item?.label
          ]
        },
        key
      )
    );
  }) });
}
export {
  LegendIndicator,
  LegendOverlay,
  legendFillStyle,
  legendOutlineStyle
};
