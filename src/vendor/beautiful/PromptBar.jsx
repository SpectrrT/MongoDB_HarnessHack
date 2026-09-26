// Adapted from the original publicly provided Beautiful UI source. See THIRD_PARTY.md.
"use client";
import { jsx, jsxs } from "react/jsx-runtime";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createShader, playSweep, accentChain, ACCENTS } from "glimm";
const RAINBOW = accentChain([
  ACCENTS.red,
  ACCENTS.orange,
  ACCENTS.yellow,
  ACCENTS.green,
  ACCENTS.cyan,
  ACCENTS.blue,
  ACCENTS.purple
]);
function Icon({ children, size = 15, strokeWidth = 1.8 }) {
  return /* @__PURE__ */ jsx("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children });
}
const GLYPHS = {
  clip: /* @__PURE__ */ jsx("path", { d: "m21.4 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" }),
  chart: /* @__PURE__ */ jsx("path", { d: "M4 20V10M10 20V4M16 20v-7M22 20H2" }),
  layers: /* @__PURE__ */ jsxs("g", { children: [
    /* @__PURE__ */ jsx("path", { d: "M12 2 2 7l10 5 10-5-10-5z" }),
    /* @__PURE__ */ jsx("path", { d: "M2 17l10 5 10-5M2 12l10 5 10-5" })
  ] }),
  globe: /* @__PURE__ */ jsxs("g", { children: [
    /* @__PURE__ */ jsx("circle", { cx: "12", cy: "12", r: "10" }),
    /* @__PURE__ */ jsx("path", { d: "M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" })
  ] })
};
const BRANDS = {
  figma: /* @__PURE__ */ jsxs("svg", { width: "11", height: "16", viewBox: "0 0 38 57", "aria-hidden": "true", children: [
    /* @__PURE__ */ jsx("path", { d: "M9.5 57A9.5 9.5 0 0 0 19 47.5V38H9.5a9.5 9.5 0 0 0 0 19z", fill: "#0ACF83" }),
    /* @__PURE__ */ jsx("path", { d: "M0 28.5A9.5 9.5 0 0 1 9.5 19H19v19H9.5A9.5 9.5 0 0 1 0 28.5z", fill: "#A259FF" }),
    /* @__PURE__ */ jsx("path", { d: "M0 9.5A9.5 9.5 0 0 1 9.5 0H19v19H9.5A9.5 9.5 0 0 1 0 9.5z", fill: "#F24E1E" }),
    /* @__PURE__ */ jsx("path", { d: "M19 0h9.5a9.5 9.5 0 1 1 0 19H19V0z", fill: "#FF7262" }),
    /* @__PURE__ */ jsx("path", { d: "M38 28.5a9.5 9.5 0 1 1-19 0 9.5 9.5 0 0 1 19 0z", fill: "#1ABCFE" })
  ] }),
  slack: /* @__PURE__ */ jsxs("svg", { width: "15", height: "15", viewBox: "0 0 127 127", "aria-hidden": "true", children: [
    /* @__PURE__ */ jsx("path", { d: "M27.2 80c0 7.3-5.9 13.2-13.2 13.2C6.7 93.2.8 87.3.8 80c0-7.3 5.9-13.2 13.2-13.2h13.2V80zm6.6 0c0-7.3 5.9-13.2 13.2-13.2 7.3 0 13.2 5.9 13.2 13.2v33c0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V80z", fill: "#E01E5A" }),
    /* @__PURE__ */ jsx("path", { d: "M47 27.2c-7.3 0-13.2-5.9-13.2-13.2C33.8 6.7 39.7.8 47 .8c7.3 0 13.2 5.9 13.2 13.2v13.2H47zm0 6.7c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H13.9C6.6 60.3.7 54.4.7 47.1c0-7.3 5.9-13.2 13.2-13.2H47z", fill: "#36C5F0" }),
    /* @__PURE__ */ jsx("path", { d: "M99.9 47.1c0-7.3 5.9-13.2 13.2-13.2 7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H99.9V47.1zm-6.6 0c0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V13.9C66.9 6.6 72.8.7 80.1.7c7.3 0 13.2 5.9 13.2 13.2v33.2z", fill: "#2EB67D" }),
    /* @__PURE__ */ jsx("path", { d: "M80.1 99.8c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V99.8h13.2zm0-6.6c-7.3 0-13.2-5.9-13.2-13.2 0-7.3 5.9-13.2 13.2-13.2h33.1c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H80.1z", fill: "#ECB22E" })
  ] }),
  gmail: /* @__PURE__ */ jsxs("svg", { width: "15", height: "12", viewBox: "0 0 256 193", "aria-hidden": "true", children: [
    /* @__PURE__ */ jsx("path", { d: "M58.182 192.05V93.14L27.507 65.077 0 49.504v125.091c0 9.658 7.825 17.455 17.455 17.455h40.727Z", fill: "#4285F4" }),
    /* @__PURE__ */ jsx("path", { d: "M197.818 192.05h40.727c9.659 0 17.455-7.826 17.455-17.455V49.505l-31.156 17.837-27.026 25.798v98.91Z", fill: "#34A853" }),
    /* @__PURE__ */ jsx("path", { d: "m58.182 93.14-4.174-38.647 4.174-36.989L128 69.868l69.818-52.364 4.669 34.992-4.669 40.644L128 145.504 58.182 93.14Z", fill: "#EA4335" }),
    /* @__PURE__ */ jsx("path", { d: "M197.818 17.504V93.14L256 49.504V26.231c0-21.585-24.64-33.89-41.89-20.945l-16.292 12.218Z", fill: "#FBBC04" }),
    /* @__PURE__ */ jsx("path", { d: "m0 49.504 26.759 20.07L58.182 93.14V17.504L41.89 5.286C24.61-7.66 0 4.646 0 26.23v23.273Z", fill: "#C5221F" })
  ] })
};
const SOURCES = [
  { key: "attach", name: "Add photos & files", desc: "Upload from your computer", glyph: "clip", attach: true },
  { key: "scoop", name: "Scoop Data", desc: "Sales & churn metrics", glyph: "chart" },
  { key: "flavors", name: "Flavor records", desc: "26 makers, tags, links", glyph: "layers" },
  { key: "web", name: "Web search", desc: "Real-time news and info", glyph: "globe" },
  { key: "figma", name: "Figma", desc: "Design-to-code workflows", brand: "figma" },
  { key: "slack", name: "Slack", desc: "Read and manage Slack", brand: "slack" },
  { key: "gmail", name: "Gmail", desc: "Read and manage Gmail", brand: "gmail", connect: true }
];
const COMMANDS = [
  { key: "compare", name: "/compare", desc: "Flavor vs. last summer" },
  { key: "churn-plan", name: "/churn-plan", desc: "Draft a churn schedule" },
  { key: "restock", name: "/restock", desc: "Build a reorder list" },
  { key: "draft-email", name: "/draft-email", desc: "Write a supplier email" },
  { key: "summarize", name: "/summarize", desc: "Digest the thread so far" }
];
const MODELS = [
  { key: "sprinkles-5", name: "Sprinkles 5", tag: "Flagship" },
  { key: "vanilla-1", name: "Vanilla 1", tag: "Basic" },
  { key: "freezer-burn", name: "Freezer Burn 0.4", tag: "Stale" }
];
const FILES = ["flavor-chart.png", "summer-menu.pdf", "pos-export.csv"];
const DICTATION = "Compare pistachio weekends to last summer";
const AUTO_STEPS = [
  { draft: "", connect: false, model: "vanilla-1", hold: 1100 },
  { draft: "@", active: 0, hold: 900 },
  { draft: "@", active: 1, hold: 620 },
  { draft: "@", active: 4, hold: 620 },
  { draft: "@", active: 6, hold: 700 },
  { draft: "@", active: 6, connect: true, hold: 1e3 },
  { draft: "", hold: 700 },
  { draft: "/", active: 0, hold: 900 },
  { draft: "/", active: 1, hold: 620 },
  { draft: "/", active: 3, hold: 1e3 },
  { draft: "", hold: 800 },
  // open the model picker and upgrade to the flagship → rainbow sweep
  { draft: "", modelOpen: true, hold: 1200 },
  { draft: "", model: "sprinkles-5", hold: 2400 },
  { draft: "", hold: 900 }
];
function parseToken(draft) {
  const match = /(^|\s)([@/])([\w-]*)$/.exec(draft);
  if (!match) return null;
  return {
    kind: match[2] === "@" ? "at" : "slash",
    query: match[3].toLowerCase(),
    start: match.index + match[1].length
  };
}
function PromptBar({
  variant = "Rounded",
  local = true,
  tall = false,
  placeholder,
  onSend,
  models,
  modelValue,
  onModelChange,
  disabled = false,
  controls
}) {
  const pill = variant === "Pill";
  const [draft, setDraft] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const modelOptions = models?.length ? models : MODELS;
  const [pickedModel, setPickedModel] = useState(modelOptions[1] || modelOptions[0]);
  const model = modelOptions.find((m) => m.key === modelValue) || pickedModel;
  const setModel = (next) => {
    setPickedModel(next);
    onModelChange?.(next.key);
  };
  const [attachments, setAttachments] = useState([]);
  const [connected, setConnected] = useState(false);
  const [active, setActive] = useState(0);
  const [listening, setListening] = useState(false);
  const [auto, setAuto] = useState(local);
  const [autoStep, setAutoStep] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const wide = expanded || tall;
  const [rowBox, setRowBox] = useState(null);
  const [engaged, setEngaged] = useState(false);
  const [modelBox, setModelBox] = useState(null);
  const [modelHovered, setModelHovered] = useState(null);
  const [modelMenuLeft, setModelMenuLeft] = useState(0);
  const [modelMenuBottom, setModelMenuBottom] = useState(0);
  const composerAnchorRef = useRef(null);
  const controlsRef = useRef(null);
  const inputRef = useRef(null);
  const measureRef = useRef(null);
  const modelRef = useRef(null);
  const rowRefs = useRef([]);
  const modelRowRefs = useRef([]);
  const glimmRef = useRef(null);
  const shaderRef = useRef(null);
  const sweepingRef = useRef(false);
  const takeOver = (event) => {
    setAuto(false);
    if (auto && event.target === inputRef.current) setDraft("");
  };
  const token = dismissed ? null : parseToken(draft);
  const menu = local ? plusOpen ? "at" : token?.kind ?? null : null;
  const query = plusOpen ? "" : token?.query ?? "";
  const rows = menu === "at" ? SOURCES.filter((s) => s.name.toLowerCase().includes(query)) : menu === "slash" ? COMMANDS.filter((c) => c.name.slice(1).startsWith(query)) : [];
  useEffect(() => {
    setActive(0);
    setEngaged(false);
  }, [menu, query]);
  useLayoutEffect(() => {
    const target = rowRefs.current[active];
    if (target) setRowBox({ top: target.offsetTop, height: target.offsetHeight });
  }, [menu, query, active, connected, rows.length]);
  const modelIndex = modelOptions.findIndex((m) => m.key === model.key);
  useLayoutEffect(() => {
    if (!modelOpen) return;
    const target = modelRowRefs.current[modelHovered ?? modelIndex];
    if (target) setModelBox({ top: target.offsetTop, height: target.offsetHeight });
  }, [modelOpen, modelHovered, modelIndex]);
  useLayoutEffect(() => {
    if (!modelOpen || !composerAnchorRef.current || !modelRef.current) return;
    const anchorRect = composerAnchorRef.current.getBoundingClientRect();
    const triggerRect = modelRef.current.getBoundingClientRect();
    setModelMenuLeft(Math.max(0, Math.min(triggerRect.left - anchorRect.left, anchorRect.width - 176)));
    setModelMenuBottom(anchorRect.bottom - triggerRect.top + 8);
  }, [modelOpen, wide, model.name]);
  useEffect(() => {
    if (!modelOpen) setModelHovered(null);
  }, [modelOpen]);
  const makeShader = () => {
    const canvas = glimmRef.current;
    if (!canvas) return null;
    const random = Math.random;
    Math.random = () => 0;
    try {
      return createShader({
        canvas,
        palette: RAINBOW,
        direction: "ltr",
        bandTight: 10,
        swellAmount: 0.85
      });
    } finally {
      Math.random = random;
    }
  };
  useEffect(() => {
    shaderRef.current = makeShader();
    return () => {
      shaderRef.current?.destroy();
      shaderRef.current = null;
    };
  }, []);
  const celebrate = () => {
    if (sweepingRef.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    shaderRef.current?.destroy();
    const shader = makeShader();
    shaderRef.current = shader;
    if (!shader) return;
    sweepingRef.current = true;
    const sweep = playSweep(shader, {
      palette: RAINBOW,
      direction: "ltr",
      sweepMs: 570,
      outroMs: 80,
      peakAlpha: 1.3,
      bandTight: 10,
      brightness: 1.4,
      swellAmount: 1,
      waveSpeed: 1.8,
      easing: "easeOutExpo"
    });
    sweep.done.finally(() => {
      sweepingRef.current = false;
    });
  };
  const selectModel = (next) => {
    setModel(next);
    setModelOpen(false);
    if (next.key === "sprinkles-5") celebrate();
  };
  useEffect(() => {
    if (!auto) return;
    const step = AUTO_STEPS[autoStep % AUTO_STEPS.length];
    setDraft(step.draft);
    if (step.active !== void 0) setActive(step.active);
    if (step.connect !== void 0) setConnected(step.connect);
    if (step.modelOpen !== void 0) setModelOpen(step.modelOpen);
    if (step.model) {
      const next = MODELS.find((m) => m.key === step.model);
      if (next) selectModel(next);
    }
    const t = setTimeout(() => setAutoStep((s) => s + 1), step.hold);
    return () => clearTimeout(t);
  }, [auto, autoStep]);
  useEffect(() => {
    if (!listening) return;
    const t = setTimeout(() => {
      setDraft((current) => current ? `${current.trimEnd()} ${DICTATION}` : DICTATION);
      setListening(false);
      inputRef.current?.focus();
    }, 2200);
    return () => clearTimeout(t);
  }, [listening]);
  useLayoutEffect(() => {
    const input = inputRef.current;
    const controls2 = controlsRef.current;
    const measure = measureRef.current;
    const modelButton = modelRef.current;
    if (!input || !controls2 || !measure || !modelButton) return;
    const fixedControlsWidth = 28 * 3 + modelButton.offsetWidth;
    const inlineGaps = 4 * 4;
    const inlineInputWidth = controls2.clientWidth - fixedControlsWidth - inlineGaps;
    const needsFullWidth = draft.includes("\n") || measure.offsetWidth + 8 > inlineInputWidth;
    if (needsFullWidth !== expanded) {
      setExpanded(needsFullWidth);
    }
    const minHeight = 28;
    const maxHeight = 100;
    input.style.height = "0px";
    const contentHeight = input.scrollHeight;
    input.style.height = `${Math.min(Math.max(contentHeight, minHeight), maxHeight)}px`;
    input.style.overflowY = contentHeight > maxHeight ? "auto" : "hidden";
  }, [draft, expanded]);
  useEffect(() => {
    if (!modelOpen && !plusOpen) return;
    const close = (event) => {
      if (!event.target.closest("[data-promptbar]")) {
        setModelOpen(false);
        setPlusOpen(false);
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [modelOpen, plusOpen]);
  const closeMenus = () => {
    setPlusOpen(false);
    setModelOpen(false);
  };
  const pick = (row) => {
    const source = SOURCES.find((s) => s.key === row.key);
    if (source?.attach) {
      setAttachments((current) => [...current, FILES[current.length % FILES.length]]);
      if (token) setDraft(draft.slice(0, token.start));
    } else if (menu === "at") {
      setDraft(`${token ? draft.slice(0, token.start) : draft}@${row.name} `);
    } else {
      setDraft(`${token ? draft.slice(0, token.start) : draft}${row.name} `);
    }
    setPlusOpen(false);
    setDismissed(false);
    inputRef.current?.focus();
  };
  const canSend = !disabled && (draft.trim().length > 0 || attachments.length > 0);
  const send = () => {
    if (!canSend) return;
    onSend?.(draft.trim());
    setDraft("");
    setAttachments([]);
    closeMenus();
  };
  return /* @__PURE__ */ jsx(
    "div",
    {
      "data-promptbar": true,
      className: local ? "flex min-h-[384px] w-full max-w-105 flex-col justify-end pb-8" : "w-full",
      onPointerDownCapture: takeOver,
      onKeyDownCapture: takeOver,
      children: /* @__PURE__ */ jsxs("div", { ref: composerAnchorRef, className: "relative", children: [
        menu && /* @__PURE__ */ jsxs(
          "div",
          {
            onMouseLeave: () => setEngaged(false),
            className: "absolute inset-x-0 bottom-full z-10 mb-2 rounded-[10px] bg-surface p-1 shadow-raised",
            style: { animation: "pop-in 180ms cubic-bezier(0.23,1,0.32,1) both", transformOrigin: "bottom center" },
            children: [
              /* @__PURE__ */ jsx(
                "span",
                {
                  "aria-hidden": true,
                  className: "pointer-events-none absolute inset-x-1 rounded-[6px] bg-hover",
                  style: {
                    top: rowBox?.top ?? 0,
                    height: rowBox?.height ?? 0,
                    opacity: rowBox && engaged && rows.length > 0 ? 1 : 0,
                    transition: "top 220ms cubic-bezier(0.23,1,0.32,1), height 220ms cubic-bezier(0.23,1,0.32,1), opacity 150ms ease"
                  }
                }
              ),
              rows.map((row, i) => {
                const source = menu === "at" ? SOURCES.find((s) => s.key === row.key) : void 0;
                return /* @__PURE__ */ jsxs(
                  "button",
                  {
                    type: "button",
                    ref: (el) => {
                      rowRefs.current[i] = el;
                    },
                    onMouseDown: (event) => event.preventDefault(),
                    onMouseEnter: () => {
                      setActive(i);
                      setEngaged(true);
                    },
                    onClick: () => pick(row),
                    className: "relative z-10 flex h-9 w-full items-center gap-2.5 rounded-[6px] px-2 text-left",
                    children: [
                      source && /* @__PURE__ */ jsx("span", { className: "flex size-5.5 shrink-0 items-center justify-center text-ink-2", children: source.brand ? BRANDS[source.brand] : /* @__PURE__ */ jsx(Icon, { size: 15, children: GLYPHS[source.glyph ?? "clip"] }) }),
                      /* @__PURE__ */ jsx("span", { className: "shrink-0 text-[12.5px] font-medium text-ink", children: row.name }),
                      /* @__PURE__ */ jsx("span", { className: "min-w-0 flex-1 truncate text-[12px] text-ink-3", children: row.desc }),
                      source?.connect && /* @__PURE__ */ jsx(
                        "span",
                        {
                          role: "button",
                          tabIndex: -1,
                          onClick: (event) => {
                            event.stopPropagation();
                            setConnected((current) => !current);
                          },
                          className: `shrink-0 text-[12px] font-medium transition-colors duration-100 ${connected ? "text-green" : "text-accent-ink hover:underline"}`,
                          children: connected ? "Connected" : "Connect"
                        }
                      )
                    ]
                  },
                  row.key
                );
              }),
              rows.length === 0 && /* @__PURE__ */ jsxs("div", { className: "flex h-9 items-center px-2 text-[12px] text-ink-3", children: [
                "No matches for \u201C",
                query,
                "\u201D"
              ] }),
              /* @__PURE__ */ jsx("div", { className: "mt-1 border-t border-line px-2 pt-1.5 pb-1 text-[11px] text-ink-3", children: menu === "at" ? "Type to search sources & files" : "Type to search commands" })
            ]
          }
        ),
        modelOpen && /* @__PURE__ */ jsxs(
          "div",
          {
            onMouseLeave: () => setModelHovered(null),
            className: "absolute z-10 w-44 rounded-[10px] bg-surface p-1 shadow-raised",
            style: { left: modelMenuLeft, bottom: modelMenuBottom, animation: "pop-in 180ms cubic-bezier(0.23,1,0.32,1) both", transformOrigin: "bottom left" },
            children: [
              /* @__PURE__ */ jsx(
                "span",
                {
                  "aria-hidden": true,
                  className: "pointer-events-none absolute inset-x-1 rounded-[6px] bg-hover",
                  style: {
                    top: modelBox?.top ?? 0,
                    height: modelBox?.height ?? 0,
                    opacity: modelBox && modelHovered !== null ? 1 : 0,
                    transition: "top 220ms cubic-bezier(0.23,1,0.32,1), height 220ms cubic-bezier(0.23,1,0.32,1), opacity 150ms ease"
                  }
                }
              ),
              modelOptions.map((m, i) => /* @__PURE__ */ jsxs(
                "button",
                {
                  type: "button",
                  ref: (el) => {
                    modelRowRefs.current[i] = el;
                  },
                  onMouseDown: (event) => event.preventDefault(),
                  onMouseEnter: () => setModelHovered(i),
                  onClick: () => {
                    selectModel(m);
                    inputRef.current?.focus();
                  },
                  className: "relative z-10 flex h-7.5 w-full items-center gap-2 rounded-[6px] px-2 text-left",
                  children: [
                    /* @__PURE__ */ jsx("span", { className: "min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink", children: m.name }),
                    /* @__PURE__ */ jsx("span", { className: "shrink-0 text-[11px] text-ink-3", children: m.tag }),
                    /* @__PURE__ */ jsx("span", { className: `shrink-0 text-ink ${m.key === model.key ? "" : "invisible"}`, children: /* @__PURE__ */ jsx(Icon, { size: 13, strokeWidth: 2.5, children: /* @__PURE__ */ jsx("path", { d: "M20 6L9 17l-5-5" }) }) })
                  ]
                },
                m.key
              ))
            ]
          }
        ),
        /* @__PURE__ */ jsxs(
          "div",
          {
            className: `relative isolate flex flex-col overflow-hidden border border-line bg-surface shadow-card transition-[border-color,border-radius] duration-150 focus-within:border-line-strong ${tall ? "gap-2.5 p-3.5" : "gap-1.5 p-1.5"} ${pill ? attachments.length > 0 || wide ? "rounded-[24px]" : "rounded-full" : tall ? "rounded-[22px]" : "rounded-[14px]"}`,
            children: [
              /* @__PURE__ */ jsx(
                "canvas",
                {
                  ref: glimmRef,
                  "aria-hidden": "true",
                  className: "pointer-events-none absolute inset-0 -z-10 h-full w-full",
                  style: { borderRadius: "inherit" }
                }
              ),
              /* @__PURE__ */ jsx(
                "span",
                {
                  ref: measureRef,
                  "aria-hidden": "true",
                  className: "pointer-events-none absolute invisible whitespace-pre text-[13px] leading-[18px]",
                  children: draft
                }
              ),
              attachments.length > 0 && /* @__PURE__ */ jsx("div", { className: `flex flex-wrap gap-1.5 pt-0.5 ${pill ? "px-1" : "px-0.5"}`, children: attachments.map((file, i) => /* @__PURE__ */ jsxs(
                "span",
                {
                  className: `flex h-6.5 items-center gap-1.5 bg-field py-1 pr-1 pl-1.5 text-[11.5px] text-ink-2 shadow-hairline ${pill ? "rounded-full" : "rounded-chip"}`,
                  style: { animation: "pop-in 200ms cubic-bezier(0.23,1,0.32,1) both" },
                  children: [
                    /* @__PURE__ */ jsx(Icon, { size: 12, children: /* @__PURE__ */ jsxs("g", { children: [
                      /* @__PURE__ */ jsx("path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" }),
                      /* @__PURE__ */ jsx("path", { d: "M14 2v6h6" })
                    ] }) }),
                    /* @__PURE__ */ jsx("span", { className: "max-w-36 truncate", children: file }),
                    /* @__PURE__ */ jsx(
                      "button",
                      {
                        type: "button",
                        "aria-label": `Remove ${file}`,
                        onClick: () => setAttachments((current) => current.filter((_, j) => j !== i)),
                        className: `-my-1 flex size-6 items-center justify-center text-ink-3 transition-colors duration-100 hover:bg-line/70 hover:text-ink ${pill ? "rounded-full" : "rounded-[5px]"}`,
                        children: /* @__PURE__ */ jsx(Icon, { size: 10, strokeWidth: 2.5, children: /* @__PURE__ */ jsx("path", { d: "M18 6L6 18M6 6l12 12" }) })
                      }
                    )
                  ]
                },
                `${file}-${i}`
              )) }),
              /* @__PURE__ */ jsxs(
                "div",
                {
                  ref: controlsRef,
                  className: `grid items-end gap-x-1 gap-y-1.5 ${wide ? "grid-cols-[28px_auto_minmax(0,1fr)_28px_28px]" : "grid-cols-[28px_minmax(0,1fr)_auto_28px_28px]"}`,
                  children: [
                    /* @__PURE__ */ jsx(
                      "button",
                      {
                        type: "button",
                        "aria-label": "Add attachments and sources",
                        disabled: !local,
                        "aria-expanded": plusOpen,
                        onClick: () => {
                          setModelOpen(false);
                          setPlusOpen((current) => !current);
                          inputRef.current?.focus();
                        },
                        className: `flex size-7 shrink-0 items-center justify-center justify-self-start text-ink-3 transition-[background-color,color,transform] duration-150 hover:bg-hover hover:text-ink active:scale-[0.94] ${pill ? "rounded-full" : "rounded-[8px]"} ${plusOpen ? "bg-hover text-ink" : ""} ${wide ? "col-start-1 row-start-2" : "col-start-1 row-start-1"}`,
                        children: /* @__PURE__ */ jsx(Icon, { size: 16, strokeWidth: 2, children: /* @__PURE__ */ jsx("path", { d: "M12 5v14M5 12h14" }) })
                      }
                    ),
                    /* @__PURE__ */ jsx(
                      "textarea",
                      {
                        ref: inputRef,
                        rows: 1,
                        value: draft,
                        onChange: (event) => {
                          setDraft(event.target.value);
                          setDismissed(false);
                          setPlusOpen(false);
                        },
                        onKeyDown: (event) => {
                          if (menu && rows.length > 0) {
                            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                              event.preventDefault();
                              setEngaged(true);
                              setActive((current) => (current + (event.key === "ArrowDown" ? 1 : rows.length - 1)) % rows.length);
                              return;
                            }
                            if (event.key === "Enter" && !event.shiftKey || event.key === "Tab") {
                              event.preventDefault();
                              pick(rows[active]);
                              return;
                            }
                          }
                          if (event.key === "Escape") {
                            setDismissed(true);
                            closeMenus();
                            return;
                          }
                          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                            event.preventDefault();
                            send();
                          }
                        },
                        placeholder: listening ? "Listening\u2026" : placeholder ?? "Write a message\u2026",
                        "aria-label": "Prompt",
                        className: `${tall ? "min-h-[68px] px-2 py-2 text-[14px] leading-5" : "min-h-7 px-1 py-[5px] text-[13px] leading-[18px]"} min-w-0 w-full resize-none bg-transparent text-ink outline-none [overflow-wrap:anywhere] placeholder:text-ink-3 ${wide ? "col-span-full col-start-1 row-start-1" : "col-start-2 row-start-1"}`
                      }
                    ),
                    /* @__PURE__ */ jsxs(
                      "button",
                      {
                        ref: modelRef,
                        type: "button",
                        "aria-expanded": modelOpen,
                        "aria-label": "Choose model",
                        disabled,
                        onClick: () => {
                          setPlusOpen(false);
                          setModelOpen((current) => !current);
                        },
                        className: `flex h-7 shrink-0 items-center gap-1 px-1.5 text-[12px] font-medium text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink ${pill ? "rounded-full" : "rounded-[8px]"} ${wide ? "col-start-2 row-start-2 justify-self-start" : "col-start-3 row-start-1"}`,
                        children: [
                          model.name,
                          /* @__PURE__ */ jsx("span", { className: "text-ink-3", children: /* @__PURE__ */ jsx(Icon, { size: 11, strokeWidth: 2.4, children: /* @__PURE__ */ jsx("path", { d: "M6 9l6 6 6-6" }) }) })
                        ]
                      }
                    ),
                    controls && /* @__PURE__ */ jsx("div", { className: wide ? "col-start-3 row-start-2 justify-self-start" : "col-start-4 row-start-1", children: controls }),
                    /* @__PURE__ */ jsx(
                      "button",
                      {
                        type: "button",
                        "aria-label": listening ? "Stop dictation" : "Start dictation",
                        disabled: !local,
                        "aria-pressed": listening,
                        onClick: () => setListening((current) => !current),
                        className: `flex size-7 shrink-0 items-center justify-center transition-[background-color,color,transform] duration-150 active:scale-[0.94] ${pill ? "rounded-full" : "rounded-[8px]"} ${listening ? "bg-accent-tint text-accent-ink" : "text-ink-3 hover:bg-hover hover:text-ink"} ${wide ? "col-start-4 row-start-2" : "col-start-4 row-start-1"}`,
                        children: listening ? /* @__PURE__ */ jsx("span", { className: "flex h-3.5 items-center gap-[2.5px]", children: [0, 1, 2].map((i) => /* @__PURE__ */ jsx(
                          "span",
                          {
                            className: "w-[2.5px] rounded-full bg-current",
                            style: { height: "100%", animation: `eq-bounce 900ms ease-in-out ${i * 150}ms infinite` }
                          },
                          i
                        )) }) : /* @__PURE__ */ jsx(Icon, { size: 15, strokeWidth: 2, children: /* @__PURE__ */ jsxs("g", { children: [
                          /* @__PURE__ */ jsx("path", { d: "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" }),
                          /* @__PURE__ */ jsx("path", { d: "M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" })
                        ] }) })
                      }
                    ),
                    /* @__PURE__ */ jsx(
                      "button",
                      {
                        type: "button",
                        "aria-label": "Send",
                        disabled: !canSend,
                        onClick: send,
                        className: `flex size-7 shrink-0 items-center justify-center transition-[background-color,color,transform] duration-200 enabled:active:scale-[0.94] ${pill ? "rounded-full" : "rounded-[8px]"} ${wide ? "col-start-5 row-start-2" : "col-start-5 row-start-1"}`,
                        style: {
                          background: canSend ? "var(--ink)" : "var(--line-strong)",
                          color: canSend ? "var(--surface)" : "var(--ink-2)"
                        },
                        children: /* @__PURE__ */ jsx(Icon, { size: 16, strokeWidth: 2.4, children: /* @__PURE__ */ jsx("path", { d: "M12 19V5M5 12l7-7 7 7" }) })
                      }
                    )
                  ]
                }
              )
            ]
          }
        )
      ] })
    }
  );
}
export {
  PromptBar as default
};
