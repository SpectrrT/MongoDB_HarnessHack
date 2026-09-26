import { withAlpha } from "./echarts-chart";
import * as echarts from "echarts/core";
const BRUSH_BORDER_OPACITY = 1;
const Brush = () => null;
function syncBrushOverlay(chart, store, params) {
  const zr = chart.getZr();
  if (!zr) return;
  if (!params) {
    if (store.brushOverlay) {
      const { grips, ...rest } = store.brushOverlay;
      [...Object.values(rest), ...grips].forEach((el) => zr.remove(el));
      store.brushOverlay = null;
    }
    return;
  }
  if (!store.brushOverlay) {
    const rect = (z) => new echarts.graphic.Rect({ silent: true, z, shape: {} });
    const els2 = {
      dimLeft: rect(100),
      dimRight: rect(100),
      frame: rect(101),
      pillLeft: rect(102),
      pillRight: rect(102),
      grips: Array.from(
        { length: 6 },
        () => new echarts.graphic.Circle({ silent: true, z: 103, shape: {} })
      ),
      labelStart: new echarts.graphic.Text({ silent: true, z: 104 }),
      labelEnd: new echarts.graphic.Text({ silent: true, z: 104 })
    };
    const { grips, ...rest } = els2;
    [...Object.values(rest), ...grips].forEach((el) => zr.add(el));
    store.brushOverlay = els2;
  }
  const els = store.brushOverlay;
  const { range, geom, size, tokens, labels, showLabels, hover } = params;
  const trackLeft = 8;
  const trackRight = Math.max(size.width - 8, trackLeft);
  const trackWidth = trackRight - trackLeft;
  const top = size.height - geom.bottom - geom.height;
  const centerY = top + geom.height / 2;
  const selectionLeft = trackLeft + trackWidth * range.start / 100;
  const selectionRight = trackLeft + trackWidth * range.end / 100;
  const dimFill = withAlpha(tokens.background, 0.7);
  els.dimLeft.setShape({
    x: trackLeft,
    y: top,
    width: Math.max(selectionLeft - trackLeft, 0),
    height: geom.height
  });
  els.dimLeft.setStyle({ fill: dimFill });
  els.dimRight.setShape({
    x: selectionRight,
    y: top,
    width: Math.max(trackRight - selectionRight, 0),
    height: geom.height
  });
  els.dimRight.setStyle({ fill: dimFill });
  els.frame.setShape({
    x: selectionLeft,
    y: top,
    width: Math.max(selectionRight - selectionLeft, 0),
    height: geom.height,
    r: 6
  });
  els.frame.setStyle({
    fill: "none",
    stroke: withAlpha(tokens.border, BRUSH_BORDER_OPACITY),
    lineWidth: 1
  });
  const pill = (el, x, hovered) => {
    el.setShape({ x: x - 3, y: centerY - 8, width: 6, height: 16, r: 3 });
    el.setStyle({ fill: hovered ? tokens.foreground : tokens.mutedForeground });
  };
  pill(els.pillLeft, selectionLeft, hover.left);
  pill(els.pillRight, selectionRight, hover.right);
  const gripFill = withAlpha(tokens.background, 0.7);
  [-4, 0, 4].forEach((offset, i) => {
    els.grips[i].setShape({ cx: selectionLeft, cy: centerY + offset, r: 1 });
    els.grips[i].setStyle({ fill: gripFill });
    els.grips[i + 3].setShape({ cx: selectionRight, cy: centerY + offset, r: 1 });
    els.grips[i + 3].setStyle({ fill: gripFill });
  });
  const label = (el, text, x, align) => {
    el.setStyle({
      text,
      x: align === "left" ? Math.max(x + 6, trackLeft + 2) : Math.min(x - 6, trackRight - 2),
      y: top + geom.height,
      align,
      verticalAlign: "middle",
      fill: tokens.background,
      backgroundColor: tokens.foreground,
      padding: [2, 5],
      borderRadius: 4,
      font: "500 9px system-ui, sans-serif"
    });
    el.attr("invisible", !showLabels || !text);
  };
  label(els.labelStart, labels?.start ?? "", selectionLeft, "left");
  label(els.labelEnd, labels?.end ?? "", selectionRight, "right");
}
function buildBrushDataZoom(params) {
  const { brushBottom, brushHeight, brushRange, fillerColor } = params;
  return [
    {
      type: "slider",
      show: true,
      xAxisIndex: [0],
      left: 8,
      right: 8,
      bottom: brushBottom,
      height: brushHeight,
      // Carry the live range through every rebuild — a notMerge push
      // without start/end would reset the zoom to the full extent.
      start: brushRange.start,
      end: brushRange.end,
      brushSelect: false,
      // Range labels are overlay pills below the frame (see
      // syncBrushOverlay) — the native detail text renders INSIDE the
      // track, which is not the evil-brush look.
      showDetail: false,
      backgroundColor: "transparent",
      // The visible frame is the graphic overlay riding the selection —
      // the component's own static border stays hidden.
      borderColor: "transparent",
      fillerColor,
      dataBackground: { lineStyle: { opacity: 0 }, areaStyle: { opacity: 0 } },
      selectedDataBackground: { lineStyle: { opacity: 0 }, areaStyle: { opacity: 0 } },
      // Interaction only — the visible pills are graphic overlays (see
      // syncBrushOverlay). Kept generous for an easy grab target.
      handleIcon: "path://M -3 -5 L -3 5 A 3 3 0 0 0 3 5 L 3 -5 A 3 3 0 0 0 -3 -5 Z",
      handleSize: "35%",
      handleStyle: { opacity: 0 },
      moveHandleSize: 0,
      emphasis: { handleStyle: { opacity: 0 } }
    },
    { type: "inside", xAxisIndex: [0] }
  ];
}
export {
  BRUSH_BORDER_OPACITY,
  Brush,
  buildBrushDataZoom,
  syncBrushOverlay
};
