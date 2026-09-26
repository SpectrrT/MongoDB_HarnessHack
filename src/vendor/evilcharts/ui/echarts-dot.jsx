function withAlpha(color, alpha) {
  if (color.startsWith("#")) {
    let hex = color.slice(1);
    if (hex.length === 3)
      hex = hex.split("").map((c) => c + c).join("");
    const n = parseInt(hex, 16);
    return `rgba(${n >> 16 & 255}, ${n >> 8 & 255}, ${n & 255}, ${alpha})`;
  }
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const [r, g, b] = m[1].split(",").map((s) => parseFloat(s));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return color;
}
function dotItemStyle(variant, paint, background) {
  switch (variant) {
    case "border":
      return { color: paint, borderColor: background, borderWidth: 2 };
    case "colored-border":
      return { color: background, borderColor: paint, borderWidth: 1 };
    case "ping": {
      const halo = typeof paint === "string" ? withAlpha(paint, 0.28) : paint;
      return { color: paint, borderColor: halo, borderWidth: 10 };
    }
    case "default":
      return { color: paint, borderWidth: 0 };
    default:
      return {};
  }
}
const DOT_SIZES = {
  none: 0,
  default: 6,
  border: 8,
  "colored-border": 6,
  ping: 8
};
function dotStyle(variant, paint, background) {
  return { size: DOT_SIZES[variant], itemStyle: dotItemStyle(variant, paint, background) };
}
function sampleGradient(slots, t) {
  if (slots.length <= 1) return slots[0] ?? "rgba(120, 120, 120, 1)";
  const parse = (color) => color.match(/rgba?\(([^)]+)\)/)?.[1].split(",").map(Number) ?? [120, 120, 120, 1];
  const position = t * (slots.length - 1);
  const index = Math.min(Math.floor(position), slots.length - 2);
  const fraction = position - index;
  const [r1, g1, b1, a1 = 1] = parse(slots[index]);
  const [r2, g2, b2, a2 = 1] = parse(slots[index + 1]);
  const lerp = (from, to) => from + (to - from) * fraction;
  return `rgba(${Math.round(lerp(r1, r2))}, ${Math.round(lerp(g1, g2))}, ${Math.round(lerp(b1, b2))}, ${lerp(a1, a2).toFixed(3)})`;
}
export {
  DOT_SIZES,
  dotItemStyle,
  dotStyle,
  sampleGradient
};
