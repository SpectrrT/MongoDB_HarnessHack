// Adapted from the original publicly provided Beautiful UI source. See THIRD_PARTY.md.
"use client";
import { jsx, jsxs } from "react/jsx-runtime";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import GlideMenu from "../../components/primitives";
const DEFAULT_COLUMN_WIDTHS = {
  company: 270,
  categories: 275,
  last: 190,
  strength: 210,
  links: 175,
  ai: 240
};
const STRENGTH = {
  strong: { label: "Very strong", color: "var(--green)", rank: 3 },
  weak: { label: "Weak", color: "var(--orange)", rank: 2 },
  veryweak: { label: "Very weak", color: "var(--red)", rank: 1 },
  none: { label: "No communication", color: "var(--ink-3)", rank: 0 }
};
const TAG_PALETTE = {
  amber: { base: "oklch(0.76 0.13 70)" },
  lime: { base: "oklch(0.77 0.16 122)" },
  yellow: { base: "oklch(0.80 0.15 101)" },
  purple: { base: "oklch(0.62 0.18 293)" },
  orange: { base: "oklch(0.71 0.16 48)" },
  cyan: { base: "oklch(0.72 0.10 221)" },
  red: { base: "oklch(0.64 0.19 27)" },
  magenta: { base: "oklch(0.66 0.21 323)" },
  green: { base: "oklch(0.70 0.13 162)" },
  pink: { base: "oklch(0.67 0.19 3)" }
};
const TAG_COLORS = {
  B2B: TAG_PALETTE.amber,
  B2C: TAG_PALETTE.lime,
  Cafe: TAG_PALETTE.red,
  Catering: TAG_PALETTE.magenta,
  "Dairy-free": TAG_PALETTE.cyan,
  Gelato: TAG_PALETTE.purple,
  Imports: TAG_PALETTE.orange,
  Local: TAG_PALETTE.green,
  Seasonal: TAG_PALETTE.yellow,
  Sorbet: TAG_PALETTE.pink,
  Vegan: TAG_PALETTE.lime,
  Wholesale: TAG_PALETTE.amber
};
const INITIAL_ROWS = [
  { id: "aurora", name: "Aurora Scoops \u2014 Reykjav\xEDk", tags: ["Gelato", "Seasonal"], last: "9 days ago", strength: "strong", website: "aurora-scoops.example.com" },
  { id: "kumo", name: "Kumo Creamery \u2014 Tokyo", tags: ["B2C", "Cafe", "Vegan"], last: "3 weeks ago", strength: "strong", website: "kumo-creamery.example.com" },
  { id: "sol-nieve", name: "Sol y Nieve \u2014 Buenos Aires", tags: ["Gelato", "Local"], last: "2 months ago", strength: "weak", website: "sol-y-nieve.example.com" },
  { id: "maple-orbit", name: "Maple Orbit \u2014 Montr\xE9al", tags: ["B2B", "Wholesale", "Seasonal"], last: "15 days ago", strength: "weak", website: "maple-orbit.example.com" },
  { id: "blue-fig", name: "Blue Fig Gelato \u2014 Florence", tags: ["Gelato", "Cafe"], last: "over 1 year ago", strength: "veryweak", website: "blue-fig.example.com" },
  { id: "sahara-swirl", name: "Sahara Swirl \u2014 Marrakech", tags: ["Sorbet", "Local"], last: "5 months ago", strength: "veryweak" },
  { id: "cloudberry", name: "Cloudberry Cone \u2014 Helsinki", tags: ["Dairy-free", "Seasonal"], last: "No contact", strength: "none", website: "cloudberry-cone.example.com" },
  { id: "palm-sugar", name: "Palm Sugar Creamery \u2014 Bangkok", tags: ["B2C", "Vegan"], last: "3 months ago", strength: "veryweak", website: "palm-sugar.example.com" },
  { id: "cape-vanilla", name: "Cape Vanilla Co. \u2014 Cape Town", tags: ["Wholesale", "Imports"], last: "over 1 year ago", strength: "veryweak", website: "cape-vanilla.example.com" },
  { id: "andes-snow", name: "Andes Snow Creamery \u2014 Quito", tags: ["Gelato", "Catering"], last: "almost 2 years ago", strength: "veryweak" },
  { id: "tasman-sea", name: "Tasman Sea Gelato \u2014 Hobart", tags: ["Gelato", "Local"], last: "2 months ago", strength: "weak", website: "tasman-sea.example.com" },
  { id: "silk-road", name: "Silk Road Sorbet \u2014 Tbilisi", tags: ["Sorbet", "Imports"], last: "about 1 month ago", strength: "weak", website: "silk-road.example.com" },
  { id: "rosewater", name: "Rosewater Kulfi \u2014 Jaipur", tags: ["B2C", "Seasonal"], last: "2 months ago", strength: "veryweak" },
  { id: "lumen", name: "Lumen Soft Serve \u2014 Copenhagen", tags: ["Dairy-free", "Cafe"], last: "8 months ago", strength: "weak", website: "lumen-soft-serve.example.com" },
  { id: "cacao-norte", name: "Cacao Norte \u2014 Oaxaca", tags: ["B2B", "Local", "Wholesale"], last: "about 2 years ago", strength: "none", website: "cacao-norte.example.com" },
  { id: "pine-pistachio", name: "Pine & Pistachio \u2014 Istanbul", tags: ["Gelato", "Catering"], last: "about 1 month ago", strength: "veryweak" },
  { id: "ember-cone", name: "Ember Cone Company \u2014 Seoul", tags: ["B2C", "Vegan"], last: "15 days ago", strength: "weak", website: "ember-cone.example.com" },
  { id: "coral-coast", name: "Coral Coast Sorbet \u2014 Honolulu", tags: ["Sorbet", "Local"], last: "9 days ago", strength: "strong", website: "coral-coast.example.com" },
  { id: "sunbird", name: "Sunbird Gelateria \u2014 Lisbon", tags: ["Gelato", "Cafe"], last: "over 2 years ago", strength: "none", website: "sunbird.example.com" },
  { id: "mooncake", name: "Mooncake Ice Cream \u2014 Singapore", tags: ["B2B", "Wholesale"], last: "about 1 month ago", strength: "veryweak", website: "mooncake-ice-cream.example.com" },
  { id: "juniper", name: "Juniper & Cream \u2014 Vancouver", tags: ["Dairy-free", "Catering"], last: "No contact", strength: "none" },
  { id: "mango-moon", name: "Mango Moon Gelato \u2014 Nairobi", tags: ["Sorbet", "Vegan"], last: "almost 2 years ago", strength: "veryweak", website: "mango-moon.example.com" },
  { id: "fjord-fizz", name: "Fjord Fizz Ice \u2014 Oslo", tags: ["Dairy-free", "Seasonal"], last: "No contact", strength: "none" },
  { id: "pampa", name: "Pampa Creamery \u2014 C\xF3rdoba", tags: ["B2C", "Local"], last: "12 months ago", strength: "veryweak", website: "pampa-creamery.example.com" },
  { id: "lotus-leaf", name: "Lotus Leaf Scoops \u2014 Hanoi", tags: ["Vegan", "Cafe"], last: "15 days ago", strength: "weak" },
  { id: "saffron-sky", name: "Saffron Sky Kulfi \u2014 Dubai", tags: ["Imports", "Catering"], last: "almost 2 years ago", strength: "veryweak", website: "saffron-sky.example.com" },
  { id: "alpine-churn", name: "Alpine Churn \u2014 Z\xFCrich", tags: ["B2B", "Gelato", "Wholesale"], last: "4 days ago", strength: "strong", website: "alpine-churn.example.com" },
  { id: "monsoon-mango", name: "Monsoon Mango \u2014 Mumbai", tags: ["Sorbet", "Vegan", "Catering"], last: "18 days ago", strength: "weak", website: "monsoon-mango.example.com" },
  { id: "cedar-spoon", name: "Cedar Spoon \u2014 Beirut", tags: ["Cafe", "Local", "Seasonal"], last: "6 days ago", strength: "strong", website: "cedar-spoon.example.com" },
  { id: "baltic-berry", name: "Baltic Berry \u2014 Tallinn", tags: ["Dairy-free", "Seasonal", "B2C"], last: "5 weeks ago", strength: "weak", website: "baltic-berry.example.com" },
  { id: "delta-dairy", name: "Delta Dairy Works \u2014 New Orleans", tags: ["B2B", "Wholesale", "Local"], last: "2 days ago", strength: "strong", website: "delta-dairy.example.com" },
  { id: "yuzu-yard", name: "Yuzu Yard \u2014 Kyoto", tags: ["Sorbet", "Cafe", "Seasonal"], last: "11 days ago", strength: "strong", website: "yuzu-yard.example.com" },
  { id: "copper-cone", name: "Copper Cone \u2014 Melbourne", tags: ["Gelato", "Cafe", "B2C"], last: "about 1 month ago", strength: "weak", website: "copper-cone.example.com" },
  { id: "mint-medina", name: "Mint Medina \u2014 Tunis", tags: ["Dairy-free", "Vegan", "Local"], last: "No contact", strength: "none" },
  { id: "glacier-grove", name: "Glacier Grove \u2014 Anchorage", tags: ["Seasonal", "Local", "Catering"], last: "7 weeks ago", strength: "weak", website: "glacier-grove.example.com" },
  { id: "orchard-cloud", name: "Orchard Cloud \u2014 Lyon", tags: ["Gelato", "Seasonal", "Cafe"], last: "5 days ago", strength: "strong", website: "orchard-cloud.example.com" },
  { id: "tamarind-tide", name: "Tamarind Tide \u2014 Chennai", tags: ["Vegan", "Sorbet", "B2C"], last: "9 months ago", strength: "veryweak", website: "tamarind-tide.example.com" },
  { id: "amber-scoop", name: "Amber Scoop \u2014 Prague", tags: ["Gelato", "B2B"], last: "over 1 year ago", strength: "none" },
  { id: "boreal-batch", name: "Boreal Batch \u2014 Yellowknife", tags: ["Dairy-free", "Local", "Seasonal"], last: "8 days ago", strength: "strong", website: "boreal-batch.example.com" },
  { id: "coconut-commons", name: "Coconut Commons \u2014 Manila", tags: ["Vegan", "B2C", "Cafe"], last: "24 days ago", strength: "weak", website: "coconut-commons.example.com" },
  { id: "dolomite-dairy", name: "Dolomite Dairy \u2014 Bolzano", tags: ["Gelato", "Wholesale"], last: "3 days ago", strength: "strong", website: "dolomite-dairy.example.com" },
  { id: "equator-cream", name: "Equator Cream \u2014 Kampala", tags: ["B2B", "Catering", "Local"], last: "10 months ago", strength: "veryweak", website: "equator-cream.example.com" },
  { id: "hibiscus-house", name: "Hibiscus House \u2014 Accra", tags: ["Sorbet", "Cafe"], last: "6 weeks ago", strength: "weak", website: "hibiscus-house.example.com" },
  { id: "lagoon-ladle", name: "Lagoon Ladle \u2014 Venice", tags: ["Gelato", "Seasonal", "Catering"], last: "7 days ago", strength: "strong", website: "lagoon-ladle.example.com" },
  { id: "midnight-milk", name: "Midnight Milk \u2014 Troms\xF8", tags: ["Dairy-free", "Vegan", "Wholesale"], last: "No contact", strength: "none" },
  { id: "nomad-nougat", name: "Nomad Nougat \u2014 Ulaanbaatar", tags: ["Imports", "B2B"], last: "almost 2 years ago", strength: "none", website: "nomad-nougat.example.com" },
  { id: "olive-snow", name: "Olive Snow \u2014 Athens", tags: ["Gelato", "Cafe", "Local"], last: "4 days ago", strength: "strong", website: "olive-snow.example.com" },
  { id: "pacific-pear", name: "Pacific Pear \u2014 Valpara\xEDso", tags: ["Sorbet", "Seasonal"], last: "2 months ago", strength: "weak", website: "pacific-pear.example.com" },
  { id: "quartz-cone", name: "Quartz Cone \u2014 Denver", tags: ["B2C", "Wholesale"], last: "10 days ago", strength: "strong", website: "quartz-cone.example.com" },
  { id: "red-lantern", name: "Red Lantern Creamery \u2014 Taipei", tags: ["Cafe", "Vegan"], last: "about 1 month ago", strength: "weak", website: "red-lantern.example.com" },
  { id: "salt-silk", name: "Salt & Silk \u2014 Muscat", tags: ["Imports", "Catering", "Gelato"], last: "8 months ago", strength: "veryweak", website: "salt-and-silk.example.com" },
  { id: "tropic-churn", name: "Tropic Churn \u2014 San Juan", tags: ["Sorbet", "Local", "B2C"], last: "6 days ago", strength: "strong", website: "tropic-churn.example.com" },
  { id: "umber-cream", name: "Umber Cream \u2014 Warsaw", tags: ["B2B", "Wholesale", "Cafe"], last: "5 weeks ago", strength: "weak", website: "umber-cream.example.com" },
  { id: "vanilla-vale", name: "Vanilla Vale \u2014 Antananarivo", tags: ["Imports", "Local"], last: "No contact", strength: "none" },
  { id: "willow-whip", name: "Willow Whip \u2014 Portland", tags: ["Dairy-free", "Vegan", "Cafe"], last: "3 days ago", strength: "strong", website: "willow-whip.example.com" },
  { id: "zenith-gelato", name: "Zenith Gelato \u2014 Auckland", tags: ["Gelato", "Seasonal"], last: "3 weeks ago", strength: "weak", website: "zenith-gelato.example.com" },
  { id: "apricot-atlas", name: "Apricot Atlas \u2014 Algiers", tags: ["Sorbet", "Imports"], last: "11 months ago", strength: "veryweak", website: "apricot-atlas.example.com" },
  { id: "black-sesame", name: "Black Sesame Social \u2014 Bandung", tags: ["Vegan", "Cafe", "B2C"], last: "9 days ago", strength: "strong", website: "black-sesame.example.com" },
  { id: "crimson-clover", name: "Crimson Clover \u2014 Brussels", tags: ["Gelato", "Wholesale", "Catering"], last: "2 months ago", strength: "weak", website: "crimson-clover.example.com" },
  { id: "dragonfruit-dock", name: "Dragonfruit Dock \u2014 Shenzhen", tags: ["Sorbet", "B2B", "Wholesale"], last: "No contact", strength: "none" }
];
const AI_LABEL = "Competitors";
const COMPETITOR_POOL = [
  "Frost & Ladle",
  "Polar Pint Co.",
  "Meltwater Creamery",
  "Cirrus Scoops",
  "Golden Churn",
  "Velvet Freeze",
  "North Cone Collective",
  "Sundae Syndicate"
];
const competitorsFor = (index) => `${COMPETITOR_POOL[index % 8]}, ${COMPETITOR_POOL[(index + 3) % 8]}`;
function Icon({ children, size = 14, strokeWidth = 1.8 }) {
  return /* @__PURE__ */ jsx("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children });
}
const TYPE_GLYPHS = {
  Text: /* @__PURE__ */ jsx("path", { d: "M4 6h16M4 12h10M4 18h7" }),
  File: /* @__PURE__ */ jsxs("g", { children: [
    /* @__PURE__ */ jsx("path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" }),
    /* @__PURE__ */ jsx("path", { d: "M14 2v6h6" })
  ] }),
  Collection: /* @__PURE__ */ jsxs("g", { children: [
    /* @__PURE__ */ jsx("ellipse", { cx: "12", cy: "5", rx: "8", ry: "3" }),
    /* @__PURE__ */ jsx("path", { d: "M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" })
  ] }),
  "Single select": /* @__PURE__ */ jsxs("g", { children: [
    /* @__PURE__ */ jsx("circle", { cx: "12", cy: "12", r: "9" }),
    /* @__PURE__ */ jsx("path", { d: "m8.5 12 2.4 2.4 4.6-4.9" })
  ] }),
  "Multi select": /* @__PURE__ */ jsxs("g", { children: [
    /* @__PURE__ */ jsx("path", { d: "M11 6h9M11 12h9M11 18h9" }),
    /* @__PURE__ */ jsx("path", { d: "M4 6l1.5 1.5L8 5M4 12l1.5 1.5L8 11M4 18l1.5 1.5L8 17" })
  ] }),
  URL: /* @__PURE__ */ jsxs("g", { children: [
    /* @__PURE__ */ jsx("path", { d: "M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" }),
    /* @__PURE__ */ jsx("path", { d: "M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1" })
  ] }),
  Reference: /* @__PURE__ */ jsx("path", { d: "M7 17 17 7M9 7h8v8" }),
  JSON: /* @__PURE__ */ jsxs("g", { children: [
    /* @__PURE__ */ jsx("path", { d: "M8 4c-2 0-2 2-2 3s.5 3-2 3c2.5 0 2 2 2 3s0 3 2 3" }),
    /* @__PURE__ */ jsx("path", { d: "M16 4c2 0 2 2 2 3s-.5 3 2 3c-2.5 0-2 2-2 3s0 3-2 3" })
  ] }),
  "File splitter": /* @__PURE__ */ jsxs("g", { children: [
    /* @__PURE__ */ jsx("rect", { x: "8", y: "8", width: "12", height: "12", rx: "2" }),
    /* @__PURE__ */ jsx("path", { d: "M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" })
  ] }),
  Date: /* @__PURE__ */ jsxs("g", { children: [
    /* @__PURE__ */ jsx("rect", { x: "3", y: "5", width: "18", height: "16", rx: "2.5" }),
    /* @__PURE__ */ jsx("path", { d: "M8 3v4M16 3v4M3 10h18" })
  ] })
};
const TOOL_GLYPHS = {
  model: /* @__PURE__ */ jsx("path", { d: "M12 3l1.7 5.1a2 2 0 0 0 1.2 1.2L20 11l-5.1 1.7a2 2 0 0 0-1.2 1.2L12 19l-1.7-5.1a2 2 0 0 0-1.2-1.2L4 11l5.1-1.7a2 2 0 0 0 1.2-1.2z" }),
  web: /* @__PURE__ */ jsxs("g", { children: [
    /* @__PURE__ */ jsx("circle", { cx: "12", cy: "12", r: "9" }),
    /* @__PURE__ */ jsx("path", { d: "M3 12h18M12 3a13.5 13.5 0 0 1 3.5 9 13.5 13.5 0 0 1-3.5 9 13.5 13.5 0 0 1-3.5-9A13.5 13.5 0 0 1 12 3z" })
  ] }),
  user: /* @__PURE__ */ jsxs("g", { children: [
    /* @__PURE__ */ jsx("circle", { cx: "12", cy: "8", r: "4" }),
    /* @__PURE__ */ jsx("path", { d: "M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" })
  ] })
};
const COLUMN_META = {
  Company: { type: "Text", tool: "User input", toolKind: "user" },
  Categories: { type: "Multi select", tool: "Sprinkles 5", toolKind: "model", inputs: "Company", prompt: { before: "Tag each ", chip: "Company", after: " with its market categories." } },
  "Last interaction": { type: "Date", tool: "User input", toolKind: "user" },
  "Connection strength": { type: "Single select", tool: "Sprinkles 5", toolKind: "model", inputs: "Last interaction", prompt: { before: "Score the relationship from ", chip: "Last interaction", after: "." } },
  Links: { type: "URL", tool: "Web search", toolKind: "web", inputs: "Company", prompt: { before: "Find the website for ", chip: "Company", after: "." } },
  [AI_LABEL]: { type: "Text", tool: "Web search", toolKind: "web", inputs: "Company", prompt: { before: "Find competitors for ", chip: "Company" } }
};
const NEW_PROPERTY_TYPES = ["Text", "File", "Collection", "Single select", "Multi select", "URL", "Reference", "JSON", "File splitter"];
const MODEL_OPTIONS = ["Sprinkles 5", "Sprinkles 4.2", "Sprinkles Mini"];
const INPUT_OPTIONS = ["Company", "Categories", "Last interaction", "Connection strength", "Links"];
function Checkbox({ checked, mixed = false, onChange, label }) {
  return /* @__PURE__ */ jsxs("label", { className: "records-checkbox", title: label, onClick: (event) => event.stopPropagation(), children: [
    /* @__PURE__ */ jsx("input", { type: "checkbox", checked, onChange, "aria-label": label }),
    /* @__PURE__ */ jsx("span", { className: `records-checkbox-box ${checked || mixed ? "is-active" : ""}`, children: mixed ? /* @__PURE__ */ jsx("span", { className: "records-checkbox-dash" }) : checked ? /* @__PURE__ */ jsx(Icon, { size: 12, children: /* @__PURE__ */ jsx("path", { d: "m5 12 4 4L19 6" }) }) : null })
  ] });
}
function Tag({ name }) {
  const color = TAG_COLORS[name] ?? { base: "var(--ink-3)" };
  return /* @__PURE__ */ jsx(
    "span",
    {
      className: "records-tag",
      style: { "--tag-base": color.base },
      children: name
    }
  );
}
function TagList({ tags }) {
  const containerRef = useRef(null);
  const measureRef = useRef(null);
  const [visibleCount, setVisibleCount] = useState(tags.length);
  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;
    const update = () => {
      const available = container.clientWidth;
      const tagWidths = Array.from(measure.querySelectorAll("[data-tag-measure]"), (tag) => tag.offsetWidth);
      const moreWidth = measure.querySelector("[data-more-measure]")?.offsetWidth ?? 0;
      let used = 0;
      let count = 0;
      for (let index = 0; index < tagWidths.length; index += 1) {
        const nextUsed = used + (count > 0 ? 4 : 0) + tagWidths[index];
        const hiddenAfter = tags.length - (index + 1);
        const totalWithOverflow = nextUsed + (hiddenAfter > 0 ? 4 + moreWidth : 0);
        if (totalWithOverflow > available) break;
        used = nextUsed;
        count += 1;
      }
      setVisibleCount(count);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [tags]);
  const hiddenCount = tags.length - visibleCount;
  return /* @__PURE__ */ jsxs("div", { ref: containerRef, className: "records-tags", title: tags.join(", "), "aria-label": `Categories: ${tags.join(", ")}`, children: [
    /* @__PURE__ */ jsxs("div", { ref: measureRef, className: "records-tags-measure", "aria-hidden": true, children: [
      tags.map((tag) => /* @__PURE__ */ jsx("span", { "data-tag-measure": true, children: /* @__PURE__ */ jsx(Tag, { name: tag }) }, tag)),
      /* @__PURE__ */ jsxs("span", { "data-more-measure": true, className: "records-more-tag", children: [
        "+",
        tags.length
      ] })
    ] }),
    tags.slice(0, visibleCount).map((tag) => /* @__PURE__ */ jsx(Tag, { name: tag }, tag)),
    hiddenCount > 0 && /* @__PURE__ */ jsxs("span", { className: "records-more-tag", children: [
      "+",
      hiddenCount
    ] })
  ] });
}
function CalcCell() {
  return /* @__PURE__ */ jsxs("span", { className: "records-calc", children: [
    /* @__PURE__ */ jsx("span", { className: "records-muted", children: "Calculating\u2026" }),
    /* @__PURE__ */ jsx("span", { className: "records-pulse" })
  ] });
}
function MiniSwitch({ on, onToggle, label }) {
  return /* @__PURE__ */ jsx(
    "button",
    {
      type: "button",
      role: "switch",
      "aria-checked": on,
      "aria-label": label,
      onClick: onToggle,
      className: "relative h-4.5 w-7.5 shrink-0 rounded-full transition-colors duration-150",
      style: { background: on ? "var(--accent)" : "var(--line-strong)" },
      children: /* @__PURE__ */ jsx(
        "span",
        {
          className: "absolute top-0.5 left-0.5 size-3.5 rounded-full bg-white shadow-btn transition-transform duration-150",
          style: { transform: on ? "translateX(12px)" : "translateX(0)", transitionTimingFunction: "cubic-bezier(0.23,1,0.32,1)" }
        }
      )
    }
  );
}
function HeaderCell({ label, icon, sortKey, sort, onSort, onResizeStart, resizing = false, className = "", selected = false, onPick }) {
  return /* @__PURE__ */ jsxs("th", { className: `records-header-cell ${selected ? "is-colsel" : ""} ${className}`, children: [
    /* @__PURE__ */ jsxs("button", { type: "button", className: "records-header-button", onClick: onPick, children: [
      /* @__PURE__ */ jsx("span", { className: "records-header-icon", children: icon }),
      /* @__PURE__ */ jsx("span", { className: "truncate", children: label }),
      sortKey && /* @__PURE__ */ jsx(
        "span",
        {
          role: "button",
          tabIndex: 0,
          "aria-label": `Sort by ${label}`,
          onClick: (event) => {
            event.stopPropagation();
            onSort(sortKey);
          },
          onKeyDown: (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              event.stopPropagation();
              onSort(sortKey);
            }
          },
          className: `records-sort ${sort.key === sortKey ? "is-visible" : ""}`,
          style: { transform: sort.key === sortKey && sort.dir === -1 ? "rotate(180deg)" : void 0 },
          children: /* @__PURE__ */ jsx(Icon, { size: 12, children: /* @__PURE__ */ jsx("path", { d: "M12 5v14M5 12l7 7 7-7" }) })
        }
      )
    ] }),
    /* @__PURE__ */ jsx(
      "span",
      {
        role: "separator",
        "aria-orientation": "vertical",
        "aria-label": `Resize ${label} column`,
        className: `records-resize-handle ${resizing ? "is-resizing" : ""}`,
        onPointerDown: onResizeStart
      }
    )
  ] });
}
function ConfigRow({ label, children }) {
  return /* @__PURE__ */ jsxs("div", { className: "relative flex h-8 items-center justify-between", children: [
    /* @__PURE__ */ jsx("span", { className: "text-[13px] text-ink-3", children: label }),
    children
  ] });
}
function ConfigPicker({
  label,
  options,
  selected,
  onSelect
}) {
  return /* @__PURE__ */ jsxs(
    "div",
    {
      role: "menu",
      "aria-label": label,
      className: "absolute left-full top-0 z-30 ml-5 w-[210px] rounded-[12px] bg-surface p-1.5 shadow-overlay",
      style: { animation: "pop-in 140ms cubic-bezier(0.23,1,0.32,1) both", transformOrigin: "top left" },
      children: [
        /* @__PURE__ */ jsx("div", { className: "px-2 pb-1 pt-0.5 text-[11.5px] font-medium text-ink-3", children: label }),
        /* @__PURE__ */ jsx(GlideMenu, { className: "flex flex-col gap-px", children: options.map((option) => /* @__PURE__ */ jsxs(
          "button",
          {
            "data-menu-row": true,
            type: "button",
            role: "menuitemradio",
            "aria-checked": selected === option.label,
            onClick: () => onSelect(option.label),
            className: "relative z-10 flex h-8 w-full items-center gap-1.5 rounded-[8px] px-1.5 text-left text-[13px] font-medium text-ink",
            children: [
              /* @__PURE__ */ jsx("span", { className: "flex size-4 shrink-0 items-center justify-center text-ink-2", children: option.icon }),
              /* @__PURE__ */ jsx("span", { className: "min-w-0 flex-1 truncate", children: option.label }),
              /* @__PURE__ */ jsx("span", { className: selected === option.label ? "text-ink" : "invisible", children: /* @__PURE__ */ jsx(Icon, { size: 14, strokeWidth: 2.2, children: /* @__PURE__ */ jsx("path", { d: "m5 12 4 4L19 6" }) }) })
            ]
          },
          option.label
        )) })
      ]
    }
  );
}
function InputPicker({
  options,
  selected,
  onToggle
}) {
  return /* @__PURE__ */ jsxs(
    "div",
    {
      role: "menu",
      "aria-label": "Calculation inputs",
      className: "absolute left-full top-0 z-30 ml-5 w-[220px] rounded-[12px] bg-surface p-1.5 shadow-overlay",
      style: { animation: "pop-in 140ms cubic-bezier(0.23,1,0.32,1) both", transformOrigin: "top left" },
      children: [
        /* @__PURE__ */ jsx("div", { className: "px-2 pb-1 pt-0.5 text-[11.5px] font-medium text-ink-3", children: "Use values from" }),
        /* @__PURE__ */ jsx(GlideMenu, { className: "flex flex-col gap-px", children: options.map((option) => {
          const checked = selected.includes(option);
          return /* @__PURE__ */ jsxs(
            "button",
            {
              "data-menu-row": true,
              type: "button",
              role: "menuitemcheckbox",
              "aria-checked": checked,
              onClick: () => onToggle(option),
              className: "relative z-10 flex h-8 w-full items-center gap-1.5 rounded-[8px] px-1.5 text-left text-[13px] font-medium text-ink",
              children: [
                /* @__PURE__ */ jsx("span", { className: `flex size-4 shrink-0 items-center justify-center rounded-[5px] border ${checked ? "border-accent bg-accent text-white" : "border-line-strong text-transparent"}`, children: /* @__PURE__ */ jsx(Icon, { size: 11, strokeWidth: 2.4, children: /* @__PURE__ */ jsx("path", { d: "m5 12 4 4L19 6" }) }) }),
                /* @__PURE__ */ jsx("span", { className: "min-w-0 flex-1 truncate", children: option })
              ]
            },
            option
          );
        }) })
      ]
    }
  );
}
function RecordsTable({ rows = INITIAL_ROWS, fill = false }) {
  const [selected, setSelected] = useState(/* @__PURE__ */ new Set());
  const [sort, setSort] = useState({ key: "name", dir: 1 });
  const [columnWidths, setColumnWidths] = useState(DEFAULT_COLUMN_WIDTHS);
  const [actionColumnWidth, setActionColumnWidth] = useState(100);
  const [columnWidthsLocked, setColumnWidthsLocked] = useState(false);
  const [resizingColumn, setResizingColumn] = useState(null);
  const initialColumnWidthsRef = useRef(null);
  const tableRef = useRef(null);
  const [prop, setProp] = useState(null);
  const [grounding, setGrounding] = useState(false);
  const [groundingHelpOpen, setGroundingHelpOpen] = useState(false);
  const [configMenu, setConfigMenu] = useState(null);
  const [columnOverrides, setColumnOverrides] = useState({});
  const [inputSelections, setInputSelections] = useState({});
  const [pinnedColumns, setPinnedColumns] = useState(/* @__PURE__ */ new Set());
  const [moreSettingsOpen, setMoreSettingsOpen] = useState(false);
  const [advancedSettings, setAdvancedSettings] = useState({ required: false, allowEmpty: true, confidence: false });
  const [addOpen, setAddOpen] = useState(null);
  const [tableMenuOpen, setTableMenuOpen] = useState(null);
  const [aiAdded, setAiAdded] = useState(false);
  const [aiDone, setAiDone] = useState(false);
  const [pendingOpenAi, setPendingOpenAi] = useState(false);
  const aiThRef = useRef(null);
  const ignoreScrollRef = useRef(false);
  const [calc, setCalc] = useState(null);
  useLayoutEffect(() => {
    if (columnWidthsLocked || !tableRef.current) return;
    const headers = Array.from(tableRef.current.querySelectorAll("thead th"));
    if (headers.length < 6) return;
    const measured = {
      company: headers[0].getBoundingClientRect().width,
      categories: headers[1].getBoundingClientRect().width,
      last: headers[2].getBoundingClientRect().width,
      strength: headers[3].getBoundingClientRect().width,
      links: headers[4].getBoundingClientRect().width,
      ai: DEFAULT_COLUMN_WIDTHS.ai
    };
    initialColumnWidthsRef.current = measured;
    setColumnWidths(measured);
    setActionColumnWidth(headers[headers.length - 1].getBoundingClientRect().width);
    setColumnWidthsLocked(true);
  }, [columnWidthsLocked]);
  const visibleRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const value = sort.key === "name" ? a.name.localeCompare(b.name) : sort.key === "last" ? a.last.localeCompare(b.last) : STRENGTH[a.strength].rank - STRENGTH[b.strength].rank;
      return value * sort.dir;
    });
  }, [rows, sort]);
  useEffect(() => {
    if (!calc) return;
    if (calc.resolved > visibleRows.length) {
      if (calc.col === AI_LABEL) setAiDone(true);
      setCalc(null);
      return;
    }
    const t = setTimeout(() => setCalc((current) => current ? { ...current, resolved: current.resolved + 1 } : current), 110);
    return () => clearTimeout(t);
  }, [calc, visibleRows.length]);
  useEffect(() => {
    if (!pendingOpenAi || !aiThRef.current) return;
    const scroller = aiThRef.current.closest(".records-scroll");
    if (scroller) {
      ignoreScrollRef.current = true;
      scroller.scrollLeft = scroller.scrollWidth;
    }
    const rect = aiThRef.current.getBoundingClientRect();
    setProp({ col: AI_LABEL, x: Math.min(rect.left, window.innerWidth - 336), y: rect.bottom + 6 });
    setPendingOpenAi(false);
  }, [pendingOpenAi, aiAdded]);
  useEffect(() => {
    if (!prop && !addOpen && !tableMenuOpen) return;
    const close = (event) => {
      if (!event.target.closest("[data-recpop]")) {
        setProp(null);
        setConfigMenu(null);
        setGroundingHelpOpen(false);
        setMoreSettingsOpen(false);
        setAddOpen(null);
        setTableMenuOpen(null);
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [prop, addOpen, tableMenuOpen]);
  const openProp = (col) => (event) => {
    const th = event.currentTarget.closest("th");
    if (!th) return;
    setAddOpen(null);
    setTableMenuOpen(null);
    setConfigMenu(null);
    setGroundingHelpOpen(false);
    setMoreSettingsOpen(false);
    setProp((current) => {
      if (current?.col === col) return null;
      const rect = th.getBoundingClientRect();
      return { col, x: Math.min(rect.left, window.innerWidth - 336), y: rect.bottom + 6 };
    });
  };
  const isCalc = (col, index) => !!calc && calc.col === col && index >= calc.resolved;
  const allSelected = visibleRows.length > 0 && visibleRows.every((row) => selected.has(row.id));
  const partiallySelected = !allSelected && visibleRows.some((row) => selected.has(row.id));
  const toggleSort = (key) => setSort((current) => current.key === key ? { key, dir: current.dir * -1 } : { key, dir: 1 });
  const startColumnResize = (key, minWidth = 120) => (event) => {
    event.preventDefault();
    event.stopPropagation();
    setProp(null);
    setConfigMenu(null);
    setGroundingHelpOpen(false);
    setMoreSettingsOpen(false);
    setAddOpen(null);
    setTableMenuOpen(null);
    const startX = event.clientX;
    const startWidth = columnWidths[key];
    const previousCursor = document.body.style.cursor;
    const previousSelection = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    setResizingColumn(key);
    const move = (moveEvent) => {
      const width = Math.max(minWidth, startWidth + moveEvent.clientX - startX);
      setColumnWidths((current) => ({ ...current, [key]: width }));
    };
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousSelection;
      setResizingColumn(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  };
  const toggleRow = (id) => setSelected((current) => {
    const next = new Set(current);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const toggleAll = () => setSelected((current) => {
    const next = new Set(current);
    if (allSelected) visibleRows.forEach((row) => next.delete(row.id));
    else visibleRows.forEach((row) => next.add(row.id));
    return next;
  });
  const meta = prop ? { ...COLUMN_META[prop.col], ...columnOverrides[prop.col] } : null;
  const selectedInputs = prop && meta ? inputSelections[prop.col] ?? (meta.inputs ? [meta.inputs] : []) : [];
  const tableWidth = columnWidths.company + columnWidths.categories + columnWidths.last + columnWidths.strength + columnWidths.links + (aiAdded ? columnWidths.ai : 0) + actionColumnWidth;
  return /* @__PURE__ */ jsxs("div", { className: `records-shell${fill ? " is-fill" : ""}`, children: [
    /* @__PURE__ */ jsx(
      "div",
      {
        className: "records-scroll",
        tabIndex: 0,
        "aria-label": "Companies table. Scroll horizontally and vertically to view all columns and records.",
        onScroll: () => {
          if (ignoreScrollRef.current) {
            ignoreScrollRef.current = false;
            return;
          }
          setProp(null);
          setConfigMenu(null);
          setGroundingHelpOpen(false);
          setMoreSettingsOpen(false);
          setAddOpen(null);
          setTableMenuOpen(null);
        },
        children: /* @__PURE__ */ jsxs("table", { ref: tableRef, className: "records-table", style: { width: columnWidthsLocked ? tableWidth : "100%", minWidth: tableWidth }, children: [
          /* @__PURE__ */ jsxs("colgroup", { children: [
            /* @__PURE__ */ jsx("col", { className: "records-company-col", style: { width: columnWidths.company } }),
            /* @__PURE__ */ jsx("col", { className: "records-category-col", style: { width: columnWidths.categories } }),
            /* @__PURE__ */ jsx("col", { className: "records-last-col", style: { width: columnWidths.last } }),
            /* @__PURE__ */ jsx("col", { className: "records-strength-col", style: { width: columnWidths.strength } }),
            /* @__PURE__ */ jsx("col", { className: "records-link-col", style: { width: columnWidths.links } }),
            aiAdded && /* @__PURE__ */ jsx("col", { style: { width: columnWidths.ai } }),
            /* @__PURE__ */ jsx("col", { style: { width: 100 } })
          ] }),
          /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
            /* @__PURE__ */ jsxs("th", { className: `records-header-cell records-sticky-cell ${prop?.col === "Company" ? "is-colsel" : ""}`, children: [
              /* @__PURE__ */ jsxs("div", { className: "records-company-header", style: { cursor: "pointer" }, onClick: (event) => openProp("Company")(event), children: [
                /* @__PURE__ */ jsx(Checkbox, { checked: allSelected, mixed: partiallySelected, onChange: toggleAll, label: "Select all companies" }),
                /* @__PURE__ */ jsx("span", { children: "Company" })
              ] }),
              /* @__PURE__ */ jsx("span", { role: "separator", "aria-orientation": "vertical", "aria-label": "Resize Company column", className: `records-resize-handle ${resizingColumn === "company" ? "is-resizing" : ""}`, onPointerDown: startColumnResize("company", 180) })
            ] }),
            /* @__PURE__ */ jsx(HeaderCell, { label: "Categories", selected: prop?.col === "Categories", onPick: openProp("Categories"), sort, onSort: toggleSort, onResizeStart: startColumnResize("categories"), resizing: resizingColumn === "categories", icon: /* @__PURE__ */ jsx(Icon, { size: 15, children: TYPE_GLYPHS["Multi select"] }) }),
            /* @__PURE__ */ jsx(HeaderCell, { label: "Last interaction", selected: prop?.col === "Last interaction", onPick: openProp("Last interaction"), sortKey: "last", sort, onSort: toggleSort, onResizeStart: startColumnResize("last"), resizing: resizingColumn === "last", icon: /* @__PURE__ */ jsx(Icon, { size: 15, children: TYPE_GLYPHS.Date }) }),
            /* @__PURE__ */ jsx(HeaderCell, { label: "Connection strength", selected: prop?.col === "Connection strength", onPick: openProp("Connection strength"), sortKey: "strength", sort, onSort: toggleSort, onResizeStart: startColumnResize("strength"), resizing: resizingColumn === "strength", icon: /* @__PURE__ */ jsx(Icon, { size: 15, children: TYPE_GLYPHS["Single select"] }) }),
            /* @__PURE__ */ jsx(HeaderCell, { label: "Links", selected: prop?.col === "Links", onPick: openProp("Links"), sort, onSort: toggleSort, onResizeStart: startColumnResize("links"), resizing: resizingColumn === "links", icon: /* @__PURE__ */ jsx(Icon, { size: 15, children: TYPE_GLYPHS.URL }) }),
            aiAdded && /* @__PURE__ */ jsxs("th", { ref: aiThRef, className: `records-header-cell ${prop?.col === AI_LABEL ? "is-colsel" : ""}`, children: [
              /* @__PURE__ */ jsxs("button", { type: "button", className: "records-header-button", onClick: openProp(AI_LABEL), children: [
                /* @__PURE__ */ jsx("span", { className: "records-header-icon", children: /* @__PURE__ */ jsx(Icon, { size: 15, children: TYPE_GLYPHS.Text }) }),
                /* @__PURE__ */ jsx("span", { className: "truncate", children: AI_LABEL })
              ] }),
              /* @__PURE__ */ jsx("span", { role: "separator", "aria-orientation": "vertical", "aria-label": `Resize ${AI_LABEL} column`, className: `records-resize-handle ${resizingColumn === "ai" ? "is-resizing" : ""}`, onPointerDown: startColumnResize("ai") })
            ] }),
            /* @__PURE__ */ jsx("th", { className: "records-header-cell", children: /* @__PURE__ */ jsxs("div", { className: "flex h-[35px] items-center gap-1 px-2", children: [
              /* @__PURE__ */ jsx(
                "button",
                {
                  type: "button",
                  "aria-label": "New property",
                  "data-recpop": true,
                  onClick: (event) => {
                    setProp(null);
                    setTableMenuOpen(null);
                    const rect = event.currentTarget.getBoundingClientRect();
                    setAddOpen((current) => current ? null : { x: Math.min(rect.left, window.innerWidth - 276), y: rect.bottom + 6 });
                  },
                  className: "flex size-7 items-center justify-center rounded-[7px] text-ink-2 transition-colors duration-100 hover:bg-hover hover:text-ink",
                  children: /* @__PURE__ */ jsx(Icon, { size: 15, strokeWidth: 2, children: /* @__PURE__ */ jsx("path", { d: "M12 5v14M5 12h14" }) })
                }
              ),
              /* @__PURE__ */ jsx(
                "button",
                {
                  type: "button",
                  "aria-label": "Table options",
                  "aria-expanded": !!tableMenuOpen,
                  "data-recpop": true,
                  onClick: (event) => {
                    setProp(null);
                    setAddOpen(null);
                    const rect = event.currentTarget.getBoundingClientRect();
                    setTableMenuOpen((current) => current ? null : {
                      x: Math.max(8, Math.min(rect.right - 220, window.innerWidth - 228)),
                      y: rect.bottom + 6
                    });
                  },
                  className: "flex size-7 items-center justify-center rounded-[7px] text-ink-3 transition-colors duration-100 hover:bg-hover hover:text-ink",
                  children: /* @__PURE__ */ jsxs("svg", { width: "15", height: "15", viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": true, children: [
                    /* @__PURE__ */ jsx("circle", { cx: "5", cy: "12", r: "1.6" }),
                    /* @__PURE__ */ jsx("circle", { cx: "12", cy: "12", r: "1.6" }),
                    /* @__PURE__ */ jsx("circle", { cx: "19", cy: "12", r: "1.6" })
                  ] })
                }
              )
            ] }) })
          ] }) }),
          /* @__PURE__ */ jsx("tbody", { "data-sound-silent": true, children: visibleRows.map((row, index) => {
            const selectedRow = selected.has(row.id);
            const strength = STRENGTH[row.strength];
            return /* @__PURE__ */ jsxs("tr", { className: `records-row ${selectedRow ? "is-selected" : ""}`, children: [
              /* @__PURE__ */ jsxs("td", { className: `records-cell records-sticky-cell records-company-cell ${prop?.col === "Company" ? "is-colsel" : ""}`, children: [
                /* @__PURE__ */ jsx("span", { className: "records-rownum", children: index + 1 }),
                /* @__PURE__ */ jsx(Checkbox, { checked: selectedRow, onChange: () => toggleRow(row.id), label: `Select ${row.name}` }),
                /* @__PURE__ */ jsx("span", { className: "records-company-mark", children: row.name.slice(0, 1).toUpperCase() }),
                /* @__PURE__ */ jsx("a", { href: row.website ? `https://${row.website}` : "#", onClick: (event) => !row.website && event.preventDefault(), title: row.name, className: `records-company-name ${row.website ? "has-link" : ""}`, children: row.name })
              ] }),
              /* @__PURE__ */ jsx("td", { className: `records-cell ${prop?.col === "Categories" ? "is-colsel" : ""}`, children: isCalc("Categories", index) ? /* @__PURE__ */ jsx(CalcCell, {}) : /* @__PURE__ */ jsx(TagList, { tags: row.tags }) }),
              /* @__PURE__ */ jsx("td", { className: `records-cell ${row.last === "No contact" ? "records-muted" : ""} ${prop?.col === "Last interaction" ? "is-colsel" : ""}`, children: isCalc("Last interaction", index) ? /* @__PURE__ */ jsx(CalcCell, {}) : row.last }),
              /* @__PURE__ */ jsx("td", { className: `records-cell ${prop?.col === "Connection strength" ? "is-colsel" : ""}`, children: isCalc("Connection strength", index) ? /* @__PURE__ */ jsx(CalcCell, {}) : /* @__PURE__ */ jsxs("span", { className: "records-strength", children: [
                /* @__PURE__ */ jsx("span", { className: "records-strength-dot", style: { background: strength.color } }),
                strength.label
              ] }) }),
              /* @__PURE__ */ jsx("td", { className: `records-cell ${prop?.col === "Links" ? "is-colsel" : ""}`, children: isCalc("Links", index) ? /* @__PURE__ */ jsx(CalcCell, {}) : row.website ? /* @__PURE__ */ jsxs("a", { className: "records-link", href: `https://${row.website}`, title: row.website, target: "_blank", rel: "noreferrer", children: [
                /* @__PURE__ */ jsx("span", { className: "records-link-label", children: row.website }),
                /* @__PURE__ */ jsx(Icon, { size: 12, children: /* @__PURE__ */ jsx("path", { d: "M14 5h5v5M19 5l-8 8" }) })
              ] }) : /* @__PURE__ */ jsx("span", { className: "records-muted", children: "\u2014" }) }),
              aiAdded && /* @__PURE__ */ jsx("td", { className: `records-cell ${prop?.col === AI_LABEL ? "is-colsel" : ""}`, children: calc?.col === AI_LABEL ? index < calc.resolved ? competitorsFor(index) : /* @__PURE__ */ jsx(CalcCell, {}) : aiDone ? competitorsFor(index) : /* @__PURE__ */ jsx("span", { className: "records-muted", children: "\u2014" }) }),
              /* @__PURE__ */ jsx("td", { className: "records-cell" })
            ] }, row.id);
          }) }),
          /* @__PURE__ */ jsx("tfoot", { children: /* @__PURE__ */ jsxs("tr", { className: "records-calculation-row", children: [
            /* @__PURE__ */ jsx("td", { className: "records-cell records-sticky-cell", children: /* @__PURE__ */ jsxs("span", { className: "records-footer-value records-calculation-label", children: [
              /* @__PURE__ */ jsx("span", { className: "records-calculation-number", children: rows.length }),
              " count"
            ] }) }),
            /* @__PURE__ */ jsx("td", { className: "records-cell", children: /* @__PURE__ */ jsxs("button", { type: "button", className: "records-add-calculation", children: [
              /* @__PURE__ */ jsx(Icon, { size: 15, children: /* @__PURE__ */ jsx("path", { d: "M12 5v14M5 12h14" }) }),
              "Add calculation"
            ] }) }),
            /* @__PURE__ */ jsx("td", { className: "records-cell records-muted", children: /* @__PURE__ */ jsx("span", { className: "records-footer-value", children: "\u2014" }) }),
            /* @__PURE__ */ jsx("td", { className: "records-cell", children: /* @__PURE__ */ jsxs("span", { className: "records-footer-value records-average", children: [
              /* @__PURE__ */ jsx("span", { className: "records-strength-dot", style: { background: "var(--orange)" } }),
              Math.round(rows.reduce((sum, row) => sum + STRENGTH[row.strength].rank, 0) / rows.length / 3 * 100),
              "% average"
            ] }) }),
            /* @__PURE__ */ jsx("td", { className: "records-cell", children: /* @__PURE__ */ jsxs("span", { className: "records-footer-value records-muted", children: [
              rows.filter((row) => row.website).length,
              " links"
            ] }) }),
            aiAdded && /* @__PURE__ */ jsx("td", { className: "records-cell records-muted", children: /* @__PURE__ */ jsx("span", { className: "records-footer-value", children: aiDone ? `${rows.length} filled` : "\u2014" }) }),
            /* @__PURE__ */ jsx("td", { className: "records-cell" })
          ] }) })
        ] })
      }
    ),
    prop && meta && /* @__PURE__ */ jsxs(
      "div",
      {
        "data-recpop": true,
        className: "fixed z-50 w-[320px] rounded-[14px] bg-surface px-3 pt-3 pb-1.5 shadow-overlay",
        style: { top: prop.y, left: prop.x, animation: "pop-in 160ms cubic-bezier(0.23,1,0.32,1) both", transformOrigin: "top left" },
        children: [
          /* @__PURE__ */ jsx("div", { className: "pb-2 text-[13.5px] font-medium text-ink", children: prop.col }),
          /* @__PURE__ */ jsxs(ConfigRow, { label: "Type", children: [
            /* @__PURE__ */ jsxs(
              "button",
              {
                type: "button",
                "aria-haspopup": "menu",
                "aria-expanded": configMenu === "type",
                onClick: () => setConfigMenu((current) => current === "type" ? null : "type"),
                className: "flex items-center gap-1.5 rounded-[6px] px-1.5 py-1 text-[13px] font-medium text-ink transition-colors duration-100 hover:bg-hover",
                children: [
                  /* @__PURE__ */ jsx("span", { className: "text-ink-2", children: /* @__PURE__ */ jsx(Icon, { size: 14, children: TYPE_GLYPHS[meta.type] ?? TYPE_GLYPHS.Text }) }),
                  meta.type,
                  /* @__PURE__ */ jsx("span", { className: "text-ink-3", children: /* @__PURE__ */ jsx(Icon, { size: 12, strokeWidth: 2.2, children: /* @__PURE__ */ jsx("path", { d: "M9 6l6 6-6 6" }) }) })
                ]
              }
            ),
            configMenu === "type" && /* @__PURE__ */ jsx(
              ConfigPicker,
              {
                label: "Property type",
                selected: meta.type,
                options: NEW_PROPERTY_TYPES.map((type) => ({ label: type, icon: /* @__PURE__ */ jsx(Icon, { size: 15, children: TYPE_GLYPHS[type] }) })),
                onSelect: (type) => {
                  setColumnOverrides((current) => ({ ...current, [prop.col]: { ...current[prop.col], type } }));
                  setConfigMenu(null);
                }
              }
            )
          ] }),
          /* @__PURE__ */ jsxs(ConfigRow, { label: "Tool", children: [
            /* @__PURE__ */ jsxs(
              "button",
              {
                type: "button",
                "aria-haspopup": "menu",
                "aria-expanded": configMenu === "tool",
                onClick: () => setConfigMenu((current) => current === "tool" ? null : "tool"),
                className: "flex items-center gap-1.5 rounded-[6px] px-1.5 py-1 text-[13px] font-medium text-ink transition-colors duration-100 hover:bg-hover",
                children: [
                  /* @__PURE__ */ jsx("span", { className: meta.toolKind === "model" ? "text-accent" : "text-ink-2", children: meta.toolKind === "model" ? /* @__PURE__ */ jsx("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": true, children: TOOL_GLYPHS.model }) : /* @__PURE__ */ jsx(Icon, { size: 14, children: TOOL_GLYPHS[meta.toolKind] }) }),
                  meta.tool,
                  /* @__PURE__ */ jsx("span", { className: "text-ink-3", children: /* @__PURE__ */ jsx(Icon, { size: 12, strokeWidth: 2.2, children: /* @__PURE__ */ jsx("path", { d: "M9 6l6 6-6 6" }) }) })
                ]
              }
            ),
            configMenu === "tool" && /* @__PURE__ */ jsx(
              ConfigPicker,
              {
                label: "Model",
                selected: meta.tool,
                options: MODEL_OPTIONS.map((model) => ({
                  label: model,
                  icon: /* @__PURE__ */ jsx("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": true, children: TOOL_GLYPHS.model })
                })),
                onSelect: (tool) => {
                  setColumnOverrides((current) => ({ ...current, [prop.col]: { ...current[prop.col], tool, toolKind: "model" } }));
                  setConfigMenu(null);
                }
              }
            )
          ] }),
          /* @__PURE__ */ jsxs(ConfigRow, { label: "Grounding", children: [
            /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsx(MiniSwitch, { label: "Grounding", on: grounding, onToggle: () => setGrounding((current) => !current) }),
              /* @__PURE__ */ jsx(
                "button",
                {
                  type: "button",
                  "aria-label": "About grounding",
                  "aria-expanded": groundingHelpOpen,
                  onClick: () => setGroundingHelpOpen((open) => !open),
                  className: "flex size-6 items-center justify-center rounded-[6px] text-ink-3 transition-colors duration-100 hover:bg-hover hover:text-ink",
                  children: /* @__PURE__ */ jsx(Icon, { size: 13, children: /* @__PURE__ */ jsxs("g", { children: [
                    /* @__PURE__ */ jsx("circle", { cx: "12", cy: "12", r: "9" }),
                    /* @__PURE__ */ jsx("path", { d: "M12 8h.01M11 12h1v4h1" })
                  ] }) })
                }
              )
            ] }),
            groundingHelpOpen && /* @__PURE__ */ jsx("div", { className: "absolute right-0 top-[30px] z-30 w-[230px] rounded-[10px] px-3 py-2.5 text-[12px] leading-relaxed shadow-overlay", style: { color: "var(--tooltip-fg)", background: "var(--tooltip-bg)" }, role: "status", children: "Grounding lets the model verify generated values against connected sources." })
          ] }),
          /* @__PURE__ */ jsxs(ConfigRow, { label: "Inputs", children: [
            /* @__PURE__ */ jsxs(
              "button",
              {
                type: "button",
                "aria-haspopup": "menu",
                "aria-expanded": configMenu === "inputs",
                onClick: () => setConfigMenu((current) => current === "inputs" ? null : "inputs"),
                className: "flex max-w-[220px] items-center gap-1.5 rounded-[6px] px-1.5 py-1 text-[13px] text-ink-2 transition-colors duration-100 hover:bg-hover hover:text-ink",
                children: [
                  selectedInputs.length ? /* @__PURE__ */ jsxs("span", { className: "flex min-w-0 items-center gap-1", children: [
                    selectedInputs.slice(0, 2).map((input) => /* @__PURE__ */ jsx("span", { className: "max-w-[92px] truncate rounded-[5px] bg-accent-tint px-1.5 py-0.5 text-[12px] font-medium text-accent-ink", children: input }, input)),
                    selectedInputs.length > 2 && /* @__PURE__ */ jsxs("span", { className: "text-[11px] font-medium text-ink-3", children: [
                      "+",
                      selectedInputs.length - 2
                    ] })
                  ] }) : /* @__PURE__ */ jsx("span", { children: "Select inputs" }),
                  /* @__PURE__ */ jsx("span", { className: "shrink-0 text-ink-3", children: /* @__PURE__ */ jsx(Icon, { size: 12, strokeWidth: 2.2, children: /* @__PURE__ */ jsx("path", { d: "M9 6l6 6-6 6" }) }) })
                ]
              }
            ),
            configMenu === "inputs" && /* @__PURE__ */ jsx(
              InputPicker,
              {
                selected: selectedInputs,
                options: INPUT_OPTIONS.filter((input) => input !== prop.col),
                onToggle: (input) => {
                  setInputSelections((current) => {
                    const existing = current[prop.col] ?? (meta.inputs ? [meta.inputs] : []);
                    const next = existing.includes(input) ? existing.filter((item) => item !== input) : [...existing, input];
                    return { ...current, [prop.col]: next };
                  });
                }
              }
            )
          ] }),
          /* @__PURE__ */ jsx(
            "div",
            {
              contentEditable: true,
              suppressContentEditableWarning: true,
              role: "textbox",
              "aria-label": `${prop.col} calculation prompt`,
              "aria-multiline": "true",
              spellCheck: true,
              className: "mt-2 min-h-[88px] cursor-text rounded-[10px] bg-inset p-3 text-[13px] leading-relaxed shadow-hairline outline-none transition-[box-shadow] duration-150 focus:shadow-[0_0_0_2px_var(--accent)]",
              children: meta.prompt ? /* @__PURE__ */ jsxs("span", { className: "text-ink", children: [
                meta.prompt.before,
                meta.prompt.chip && /* @__PURE__ */ jsx("span", { contentEditable: false, className: "rounded-[5px] bg-accent-tint px-1.5 py-0.5 text-[12px] font-medium text-accent-ink", children: meta.prompt.chip }),
                meta.prompt.after
              ] }) : /* @__PURE__ */ jsx("span", { className: "text-ink-3", children: "Set a prompt (press @ to mention an input)" })
            }
          ),
          /* @__PURE__ */ jsxs(
            "button",
            {
              type: "button",
              disabled: !!calc,
              onClick: () => {
                setCalc({ col: prop.col, resolved: 0 });
                setProp(null);
              },
              className: "mt-2.5 flex h-9 w-full items-center justify-center gap-2 rounded-[9px] text-[12.5px] font-medium text-ink shadow-btn transition-[background-color,transform] duration-150 hover:bg-hover active:scale-[0.98] disabled:opacity-60",
              children: [
                /* @__PURE__ */ jsx(Icon, { size: 14, strokeWidth: 1.9, children: /* @__PURE__ */ jsx("path", { d: "M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" }) }),
                "Go calculate"
              ]
            }
          ),
          /* @__PURE__ */ jsxs(GlideMenu, { className: "mt-3 flex flex-col gap-0.5 border-t border-line pt-2", highlightClassName: "-inset-x-1.5 rounded-[8px] bg-hover", children: [
            /* @__PURE__ */ jsxs(
              "button",
              {
                "data-menu-row": true,
                type: "button",
                "aria-pressed": pinnedColumns.has(prop.col),
                onClick: () => setPinnedColumns((current) => {
                  const next = new Set(current);
                  next.has(prop.col) ? next.delete(prop.col) : next.add(prop.col);
                  return next;
                }),
                className: "relative z-10 -mx-1.5 flex h-8 items-center gap-2.5 rounded-[8px] px-1.5 text-left text-[13px] leading-none text-ink transition-transform duration-150 active:scale-[0.96]",
                children: [
                  /* @__PURE__ */ jsx("span", { className: pinnedColumns.has(prop.col) ? "text-accent" : "text-ink-2", children: /* @__PURE__ */ jsx(Icon, { size: 15, children: /* @__PURE__ */ jsx("path", { d: "M12 17v5M8 3h8l-1 7 3 3H6l3-3-1-7z" }) }) }),
                  pinnedColumns.has(prop.col) ? "Unpin" : "Pin"
                ]
              }
            ),
            /* @__PURE__ */ jsxs(
              "button",
              {
                "data-menu-row": true,
                type: "button",
                "aria-expanded": moreSettingsOpen,
                onClick: () => setMoreSettingsOpen((open) => !open),
                className: "relative z-10 -mx-1.5 flex h-8 items-center gap-2.5 rounded-[8px] px-1.5 text-left text-[13px] leading-none text-ink transition-transform duration-150 active:scale-[0.96]",
                children: [
                  /* @__PURE__ */ jsx("span", { className: moreSettingsOpen ? "text-ink" : "text-ink-2", children: /* @__PURE__ */ jsx(Icon, { size: 15, children: /* @__PURE__ */ jsxs("g", { children: [
                    /* @__PURE__ */ jsx("circle", { cx: "12", cy: "12", r: "3" }),
                    /* @__PURE__ */ jsx("path", { d: "M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" })
                  ] }) }) }),
                  /* @__PURE__ */ jsx("span", { className: "flex-1", children: "More settings" }),
                  /* @__PURE__ */ jsx("span", { className: `text-ink-3 transition-transform duration-150 ${moreSettingsOpen ? "rotate-90" : ""}`, children: /* @__PURE__ */ jsx(Icon, { size: 12, strokeWidth: 2.2, children: /* @__PURE__ */ jsx("path", { d: "M9 6l6 6-6 6" }) }) })
                ]
              }
            ),
            prop.col === AI_LABEL && /* @__PURE__ */ jsxs(
              "button",
              {
                "data-menu-row": true,
                type: "button",
                onClick: () => {
                  setAiAdded(false);
                  setAiDone(false);
                  setProp(null);
                },
                className: "relative z-10 -mx-1.5 flex h-8 items-center gap-2.5 rounded-[8px] px-1.5 text-left text-[13px] leading-none text-ink transition-transform duration-150 active:scale-[0.96]",
                children: [
                  /* @__PURE__ */ jsx("span", { className: "text-ink-2", children: /* @__PURE__ */ jsx(Icon, { size: 15, children: /* @__PURE__ */ jsxs("g", { children: [
                    /* @__PURE__ */ jsx("path", { d: "M10.6 5.1A9.8 9.8 0 0 1 12 5c7 0 10 7 10 7a16.3 16.3 0 0 1-2.1 3M6.6 6.6A16 16 0 0 0 2 12s3 7 10 7a9.7 9.7 0 0 0 5.4-1.6M3 3l18 18" }),
                    /* @__PURE__ */ jsx("path", { d: "M9.9 9.9a3 3 0 0 0 4.2 4.2" })
                  ] }) }) }),
                  "Hide from view"
                ]
              }
            )
          ] }),
          moreSettingsOpen && /* @__PURE__ */ jsxs("div", { className: "mt-2 border-t border-line pt-2", style: { animation: "fade-up 160ms cubic-bezier(0.23,1,0.32,1) both" }, children: [
            /* @__PURE__ */ jsx("div", { className: "pb-1 text-[11.5px] font-medium text-ink-3", children: "Behavior" }),
            /* @__PURE__ */ jsx(ConfigRow, { label: "Required value", children: /* @__PURE__ */ jsx(MiniSwitch, { label: "Required value", on: advancedSettings.required, onToggle: () => setAdvancedSettings((current) => ({ ...current, required: !current.required })) }) }),
            /* @__PURE__ */ jsx(ConfigRow, { label: "Allow empty results", children: /* @__PURE__ */ jsx(MiniSwitch, { label: "Allow empty results", on: advancedSettings.allowEmpty, onToggle: () => setAdvancedSettings((current) => ({ ...current, allowEmpty: !current.allowEmpty })) }) }),
            /* @__PURE__ */ jsx(ConfigRow, { label: "Show confidence", children: /* @__PURE__ */ jsx(MiniSwitch, { label: "Show confidence", on: advancedSettings.confidence, onToggle: () => setAdvancedSettings((current) => ({ ...current, confidence: !current.confidence })) }) })
          ] })
        ]
      }
    ),
    addOpen && /* @__PURE__ */ jsxs(
      "div",
      {
        "data-recpop": true,
        className: "fixed z-50 w-[260px] rounded-[14px] bg-surface p-1.5 shadow-overlay",
        style: { top: addOpen.y, left: addOpen.x, animation: "pop-in 160ms cubic-bezier(0.23,1,0.32,1) both", transformOrigin: "top left" },
        children: [
          /* @__PURE__ */ jsx("div", { className: "px-2 pb-1 pt-1 text-[12px] font-medium text-ink-3", children: "New property" }),
          /* @__PURE__ */ jsx(GlideMenu, { className: "flex flex-col gap-px", children: NEW_PROPERTY_TYPES.map((type) => /* @__PURE__ */ jsxs(
            "button",
            {
              "data-menu-row": true,
              type: "button",
              onClick: () => {
                setAddOpen(null);
                setAiDone(false);
                setAiAdded(true);
                setPendingOpenAi(true);
              },
              className: "relative z-10 flex h-9 w-full items-center gap-2.5 rounded-[8px] px-2 text-left text-[13px] text-ink",
              children: [
                /* @__PURE__ */ jsx("span", { className: "text-ink-2", children: /* @__PURE__ */ jsx(Icon, { size: 15, children: TYPE_GLYPHS[type] }) }),
                type
              ]
            },
            type
          )) })
        ]
      }
    ),
    tableMenuOpen && /* @__PURE__ */ jsxs(
      "div",
      {
        "data-recpop": true,
        className: "fixed z-50 w-[220px] rounded-[14px] bg-surface p-1.5 shadow-overlay",
        style: { top: tableMenuOpen.y, left: tableMenuOpen.x, animation: "pop-in 160ms cubic-bezier(0.23,1,0.32,1) both", transformOrigin: "top right" },
        children: [
          /* @__PURE__ */ jsx("div", { className: "px-2 pb-1 pt-1 text-[12px] font-medium text-ink-3", children: "Table options" }),
          /* @__PURE__ */ jsxs(GlideMenu, { className: "flex flex-col gap-px", children: [
            /* @__PURE__ */ jsxs(
              "button",
              {
                "data-menu-row": true,
                type: "button",
                onClick: () => {
                  const position = tableMenuOpen;
                  setTableMenuOpen(null);
                  setAddOpen({ x: Math.min(position.x, window.innerWidth - 276), y: position.y });
                },
                className: "relative z-10 flex h-9 w-full items-center gap-2.5 rounded-[8px] px-2 text-left text-[13px] text-ink",
                children: [
                  /* @__PURE__ */ jsx("span", { className: "text-ink-2", children: /* @__PURE__ */ jsx(Icon, { size: 15, strokeWidth: 2, children: /* @__PURE__ */ jsx("path", { d: "M12 5v14M5 12h14" }) }) }),
                  "Add property"
                ]
              }
            ),
            /* @__PURE__ */ jsxs(
              "button",
              {
                "data-menu-row": true,
                type: "button",
                onClick: () => {
                  setColumnWidths({ company: 220, categories: 220, last: 155, strength: 180, links: 160, ai: 200 });
                  setTableMenuOpen(null);
                },
                className: "relative z-10 flex h-9 w-full items-center gap-2.5 rounded-[8px] px-2 text-left text-[13px] text-ink",
                children: [
                  /* @__PURE__ */ jsx("span", { className: "text-ink-2", children: /* @__PURE__ */ jsx(Icon, { size: 15, children: /* @__PURE__ */ jsx("path", { d: "M4 8h16M7 4 3 8l4 4M17 4l4 4-4 4M4 16h16" }) }) }),
                  "Compact columns"
                ]
              }
            ),
            /* @__PURE__ */ jsxs(
              "button",
              {
                "data-menu-row": true,
                type: "button",
                onClick: () => {
                  setColumnWidths({ ...initialColumnWidthsRef.current ?? DEFAULT_COLUMN_WIDTHS });
                  setTableMenuOpen(null);
                },
                className: "relative z-10 flex h-9 w-full items-center gap-2.5 rounded-[8px] px-2 text-left text-[13px] text-ink",
                children: [
                  /* @__PURE__ */ jsx("span", { className: "text-ink-2", children: /* @__PURE__ */ jsx(Icon, { size: 15, children: /* @__PURE__ */ jsx("path", { d: "M3 12a9 9 0 1 0 3-6.7M3 4v6h6" }) }) }),
                  "Reset column widths"
                ]
              }
            ),
            /* @__PURE__ */ jsx("div", { className: "my-1 h-px bg-line" }),
            /* @__PURE__ */ jsxs(
              "button",
              {
                "data-menu-row": true,
                type: "button",
                onClick: () => {
                  setSelected(/* @__PURE__ */ new Set());
                  setTableMenuOpen(null);
                },
                className: "relative z-10 flex h-9 w-full items-center gap-2.5 rounded-[8px] px-2 text-left text-[13px] text-ink",
                children: [
                  /* @__PURE__ */ jsx("span", { className: "text-ink-2", children: /* @__PURE__ */ jsx(Icon, { size: 15, children: /* @__PURE__ */ jsx("path", { d: "M5 5l14 14M19 5 5 19" }) }) }),
                  "Clear selection"
                ]
              }
            )
          ] })
        ]
      }
    )
  ] });
}
export {
  RecordsTable as default
};
