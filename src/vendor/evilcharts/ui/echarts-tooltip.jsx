import { indicatorBackground } from "./echarts-chart";
const roundnessClass = {
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl"
};
const tooltipVariantClass = {
  default: "bg-background",
  "frosted-glass": "bg-background/50 backdrop-blur-md"
};
function tooltipIndicatorHtml(key, colorsCount) {
  return `<div class="h-2.5 w-2.5 shrink-0 rounded-[2px]" style="background:${indicatorBackground(key, colorsCount)}"></div>`;
}
function tooltipRow({
  indicatorHtml,
  labelText,
  valueText,
  dimmed
}) {
  return `<div class="flex w-full flex-wrap items-center gap-2${dimmed}">
          ${indicatorHtml}
          <div class="flex flex-1 items-center justify-between gap-4 leading-none">
            <span class="text-muted-foreground">${labelText}</span>
            <span class="text-foreground font-mono font-medium tabular-nums">${valueText}</span>
          </div>
        </div>`;
}
function tooltipShell({
  label,
  body,
  roundness,
  variant
}) {
  return `<div class="grid min-w-32 items-start gap-1.5 border border-border/50 px-2.5 py-1.5 text-xs shadow-xl ${roundnessClass[roundness]} ${tooltipVariantClass[variant]}">
      <div class="font-medium text-primary">${label}</div>
      <div class="grid gap-1.5">${body}</div>
    </div>`;
}
function resolveTooltipPosition(position) {
  if (position === "variable") return void 0;
  return (point, _params, _dom, _rect, size) => [point[0] - size.contentSize[0] / 2, 8];
}
function tooltipBaseOption(params) {
  const { present, cursor, position, axisPointerColor, strokeWidth } = params;
  return {
    show: present,
    trigger: "axis",
    confine: true,
    displayTransition: false,
    backgroundColor: "transparent",
    borderWidth: 0,
    padding: 0,
    extraCssText: "box-shadow:none;",
    axisPointer: cursor ? {
      type: "line",
      lineStyle: {
        color: axisPointerColor,
        width: strokeWidth,
        type: [3, 3]
      }
    } : { type: "none" },
    position: resolveTooltipPosition(position)
  };
}
export {
  resolveTooltipPosition,
  roundnessClass,
  tooltipBaseOption,
  tooltipIndicatorHtml,
  tooltipRow,
  tooltipShell,
  tooltipVariantClass
};
