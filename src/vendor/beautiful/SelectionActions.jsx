// Adapted from the original publicly provided Beautiful UI source. See THIRD_PARTY.md.
"use client";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from "react";
import {
  ArrowUp,
  ChatBubbleQuestion,
  Check,
  EmojiSatisfied,
  NavArrowRight,
  Refresh,
  Scissor,
  Spark,
  TextBox,
  Xmark
} from "iconoir-react";
import { Button } from "../../components/primitives";
import { Shimmer } from "../../components/primitives";
import { StreamText } from "../../components/primitives";
const LEAD = "Pistachio holds the top slot all weekend. ";
const PICKED = "Churn it first thing Saturday so the batch has time to firm up before the afternoon rush.";
const REWRITE = "Churn pistachio first thing Saturday so the batch has time to fully firm before the afternoon rush.";
const DEFAULT_TEXT = {
  lead: LEAD,
  original: PICKED,
  rewrite: REWRITE
};
const DEFAULT_LABELS = {
  keep: "Keep",
  discard: "Discard",
  placeholder: "Describe edits"
};
const iconProps = {
  width: 14,
  height: 14,
  strokeWidth: 1.8,
  "aria-hidden": true
};
const icons = {
  explain: /* @__PURE__ */ jsx(ChatBubbleQuestion, { ...iconProps }),
  improve: /* @__PURE__ */ jsx(Spark, { ...iconProps }),
  shorten: /* @__PURE__ */ jsx(Scissor, { ...iconProps }),
  tone: /* @__PURE__ */ jsx(EmojiSatisfied, { ...iconProps }),
  grammar: /* @__PURE__ */ jsx(TextBox, { ...iconProps }),
  send: /* @__PURE__ */ jsx(
    ArrowUp,
    {
      width: "16",
      height: "16",
      strokeWidth: "2.4",
      "aria-hidden": "true"
    }
  ),
  chevron: /* @__PURE__ */ jsx(NavArrowRight, { ...iconProps }),
  check: /* @__PURE__ */ jsx(Check, { ...iconProps }),
  close: /* @__PURE__ */ jsx(Xmark, { ...iconProps }),
  retry: /* @__PURE__ */ jsx(Refresh, { ...iconProps })
};
const primary = "inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-ink px-2.5 text-[12.5px] font-normal text-canvas shadow-hairline transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.96]";
const DEFAULT_ACTIONS = {
  primary: [
    { id: "Explain", icon: icons.explain },
    { id: "Improve", icon: icons.improve, action: "Improve", busyLabel: "Improving" }
  ],
  more: [
    { id: "Shorten", icon: icons.shorten, action: "Shorten", busyLabel: "Shortening" },
    { id: "Tone", icon: icons.tone, action: "Change tone", busyLabel: "Changing tone" },
    { id: "Grammar", icon: icons.grammar, action: "Fix grammar" }
  ]
};
function SelectionActions({
  text: textProp,
  actions = DEFAULT_ACTIONS,
  labels,
  onAction
} = {}) {
  const passage = { ...DEFAULT_TEXT, ...textProp };
  const copy = { ...DEFAULT_LABELS, ...labels };
  const [shown, setShown] = useState(false);
  const [mode, setMode] = useState("idle");
  const [action, setAction] = useState("Improve");
  const [prompt, setPrompt] = useState("");
  const [typingWidth, setTypingWidth] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, y: 0 });
  const [positioned, setPositioned] = useState(false);
  const hostRef = useRef(null);
  const selectionRef = useRef(null);
  const barRef = useRef(null);
  const contentRef = useRef(null);
  const frameRef = useRef(null);
  const previousModeRef = useRef("idle");
  const lastWidthRef = useRef(0);
  const widthAnimationRef = useRef(null);
  useEffect(() => {
    const timer = window.setTimeout(() => setShown(true), 280);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (mode !== "thinking") return;
    const timer = window.setTimeout(() => setMode("streaming"), 700);
    return () => window.clearTimeout(timer);
  }, [mode]);
  const place = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      const host = hostRef.current;
      const selection = selectionRef.current;
      if (!host || !selection) return;
      const bounds = selection.getBoundingClientRect();
      const lines = Array.from(selection.getClientRects());
      const lastLine = lines.at(-1);
      if (!lastLine) return;
      const hostBounds = host.getBoundingClientRect();
      const next = {
        x: Math.round(bounds.left - hostBounds.left + bounds.width / 2),
        y: Math.round(lastLine.bottom - hostBounds.top + 8)
      };
      setAnchor(
        (current) => current.x === next.x && current.y === next.y ? current : next
      );
      setPositioned(true);
    });
  }, []);
  useLayoutEffect(() => {
    place();
  }, [mode, place]);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(place);
    observer.observe(host);
    window.addEventListener("resize", place);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [place]);
  useLayoutEffect(() => {
    const bar = barRef.current;
    const content = contentRef.current;
    if (!bar || !content) return;
    const nextWidth = Math.ceil(content.getBoundingClientRect().width) + 8;
    const previousWidth = lastWidthRef.current || Math.ceil(bar.getBoundingClientRect().width);
    if (previousModeRef.current !== mode && Math.abs(nextWidth - previousWidth) > 1) {
      widthAnimationRef.current?.cancel();
      const animation = bar.animate(
        [
          { width: `${previousWidth}px` },
          { width: `${nextWidth}px` }
        ],
        {
          duration: 320,
          easing: "cubic-bezier(0.23,1,0.32,1)"
        }
      );
      widthAnimationRef.current = animation;
      animation.onfinish = () => {
        lastWidthRef.current = nextWidth;
        widthAnimationRef.current = null;
      };
    } else {
      lastWidthRef.current = nextWidth;
    }
    previousModeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const observer = new ResizeObserver(() => {
      if (widthAnimationRef.current?.playState === "running") return;
      lastWidthRef.current = Math.ceil(content.getBoundingClientRect().width) + 8;
    });
    observer.observe(content);
    return () => {
      observer.disconnect();
      widthAnimationRef.current?.cancel();
    };
  }, []);
  const run = (nextAction) => {
    setAction(nextAction);
    setExpanded(false);
    setMode("thinking");
    onAction?.(nextAction);
  };
  const reset = () => {
    setExpanded(false);
    setPrompt("");
    setTypingWidth(null);
    setAction("Improve");
    setMode("idle");
  };
  const busy = mode === "thinking" || mode === "streaming";
  const visible = shown && positioned;
  const hasPrompt = prompt.trim().length > 0;
  const busyLabelMap = {};
  for (const item of [...actions.primary, ...actions.more]) {
    if (item.action && item.busyLabel) busyLabelMap[item.action] = item.busyLabel;
  }
  const busyLabel = busyLabelMap[action] ?? "Editing";
  return /* @__PURE__ */ jsx("div", { className: "w-full max-w-[460px]", children: /* @__PURE__ */ jsxs("div", { ref: hostRef, className: "relative select-none pb-12", children: [
    /* @__PURE__ */ jsxs("p", { className: "text-[13px] leading-relaxed text-ink", children: [
      passage.lead,
      /* @__PURE__ */ jsx(
        "span",
        {
          ref: selectionRef,
          className: "box-decoration-clone rounded-[3px] bg-[color-mix(in_srgb,var(--accent)_14%,var(--surface))] text-ink dark:bg-accent-tint",
          children: mode === "idle" || mode === "thinking" ? passage.original : mode === "streaming" ? /* @__PURE__ */ jsx(
            StreamText,
            {
              text: passage.rewrite,
              onProgress: place,
              onDone: () => setMode("result")
            }
          ) : passage.rewrite
        }
      )
    ] }),
    /* @__PURE__ */ jsx(
      "div",
      {
        className: "absolute top-0 left-0 z-10",
        style: {
          transform: `translate3d(${anchor.x}px, ${anchor.y}px, 0) translateX(-50%)`,
          transition: "transform 320ms cubic-bezier(0.77,0,0.175,1), opacity 180ms ease-out",
          opacity: visible ? 1 : 0,
          pointerEvents: visible ? "auto" : "none",
          willChange: "transform"
        },
        children: /* @__PURE__ */ jsx(
          "div",
          {
            ref: barRef,
            className: "flex h-9 w-fit max-w-[calc(100vw-48px)] items-center justify-center gap-0.5 overflow-hidden rounded-full bg-surface p-1 font-sans font-normal text-ink shadow-overlay",
            style: {
              width: mode === "idle" && hasPrompt && typingWidth ? typingWidth : void 0,
              ...visible ? {
                animation: "pop-in 220ms cubic-bezier(0.23,1,0.32,1) both"
              } : {}
            },
            children: /* @__PURE__ */ jsxs(
              "div",
              {
                ref: contentRef,
                className: "flex w-fit shrink-0 items-center justify-center gap-0.5",
                style: {
                  width: mode === "idle" && hasPrompt && typingWidth ? typingWidth - 8 : void 0
                },
                children: [
                  busy && /* @__PURE__ */ jsxs("span", { className: "inline-flex h-7 items-center gap-1.5 whitespace-nowrap px-2.5 text-[12.5px] font-normal text-ink-2", children: [
                    /* @__PURE__ */ jsx(
                      "span",
                      {
                        className: "size-3 shrink-0 rounded-full border-[1.5px] border-line-strong border-t-ink-2",
                        style: { animation: "spin 700ms linear infinite" }
                      }
                    ),
                    mode === "thinking" ? /* @__PURE__ */ jsxs(Shimmer, { className: "text-[12.5px] font-normal", children: [
                      busyLabel,
                      "\u2026"
                    ] }) : /* @__PURE__ */ jsxs("span", { children: [
                      busyLabel,
                      "\u2026"
                    ] })
                  ] }),
                  mode === "result" && /* @__PURE__ */ jsxs(Fragment, { children: [
                    /* @__PURE__ */ jsxs(
                      "button",
                      {
                        type: "button",
                        onClick: reset,
                        className: primary,
                        children: [
                          icons.check,
                          copy.keep
                        ]
                      }
                    ),
                    /* @__PURE__ */ jsxs(Button, { type: "button", variant: "quiet", size: "xs", className: "shrink-0", onClick: reset, children: [
                      icons.close,
                      copy.discard
                    ] }),
                    /* @__PURE__ */ jsx("span", { className: "mx-0.5 h-4 w-px shrink-0 bg-line" }),
                    /* @__PURE__ */ jsx(
                      "button",
                      {
                        type: "button",
                        "aria-label": "Try again",
                        onClick: () => run(action),
                        className: "flex size-7 shrink-0 items-center justify-center rounded-full text-ink-3 transition-[background-color,color,transform] duration-150 hover:bg-hover-2 hover:text-ink-2 active:scale-[0.96]",
                        children: icons.retry
                      }
                    )
                  ] }),
                  mode === "idle" && /* @__PURE__ */ jsxs(Fragment, { children: [
                    /* @__PURE__ */ jsx(
                      "div",
                      {
                        className: "flex min-w-0 items-center overflow-hidden transition-[max-width,opacity,transform] duration-400",
                        style: {
                          maxWidth: expanded ? 0 : hasPrompt && typingWidth ? typingWidth - 40 : 145,
                          opacity: expanded ? 0 : 1,
                          transform: expanded ? "translateX(-8px)" : "translateX(0)",
                          transitionTimingFunction: "cubic-bezier(0.23,1,0.32,1)"
                        },
                        children: /* @__PURE__ */ jsx(
                          "form",
                          {
                            className: "flex h-7 shrink-0 items-center transition-[width] duration-400",
                            style: {
                              width: hasPrompt && typingWidth ? typingWidth - 40 : 145,
                              transitionTimingFunction: "cubic-bezier(0.23,1,0.32,1)"
                            },
                            onSubmit: (event) => {
                              event.preventDefault();
                              run(prompt.trim() || "Improve");
                            },
                            children: /* @__PURE__ */ jsx(
                              "input",
                              {
                                value: prompt,
                                onChange: (event) => {
                                  const next = event.target.value;
                                  if (!prompt.trim() && next.trim()) {
                                    setTypingWidth(
                                      Math.ceil(
                                        barRef.current?.getBoundingClientRect().width ?? 0
                                      )
                                    );
                                  } else if (!next.trim()) {
                                    setTypingWidth(null);
                                  }
                                  setPrompt(next);
                                },
                                "aria-label": copy.placeholder,
                                placeholder: copy.placeholder,
                                className: "h-7 w-full bg-transparent pr-2.5 pl-3 text-[12.5px] text-ink placeholder:text-ink-3"
                              }
                            )
                          }
                        )
                      }
                    ),
                    /* @__PURE__ */ jsxs(
                      "div",
                      {
                        className: "flex min-w-0 items-center gap-0.5 overflow-hidden transition-[max-width,opacity,transform] duration-400",
                        style: {
                          maxWidth: hasPrompt ? 0 : expanded ? 462 : 224,
                          opacity: hasPrompt ? 0 : 1,
                          transform: hasPrompt ? "translateX(-8px)" : "translateX(0)",
                          transitionTimingFunction: "cubic-bezier(0.23,1,0.32,1)"
                        },
                        children: [
                          !expanded && /* @__PURE__ */ jsx("span", { className: "mx-1 h-4 w-px shrink-0 bg-line-strong" }),
                          actions.primary.map((item) => /* @__PURE__ */ jsxs(
                            Button,
                            {
                              type: "button",
                              variant: "quiet",
                              size: "xs",
                              className: "shrink-0",
                              onClick: item.action ? () => run(item.action) : void 0,
                              children: [
                                item.icon,
                                item.id
                              ]
                            },
                            item.id
                          )),
                          /* @__PURE__ */ jsx(
                            "div",
                            {
                              className: "flex min-w-0 items-center gap-0.5 overflow-hidden transition-[max-width,opacity,margin] duration-400",
                              style: {
                                maxWidth: expanded ? 262 : 0,
                                opacity: expanded ? 1 : 0,
                                marginLeft: expanded ? 2 : 0,
                                transitionTimingFunction: "cubic-bezier(0.23,1,0.32,1)"
                              },
                              children: actions.more.map((item) => /* @__PURE__ */ jsxs(
                                Button,
                                {
                                  type: "button",
                                  variant: "quiet",
                                  size: "xs",
                                  className: "shrink-0",
                                  onClick: item.action ? () => run(item.action) : void 0,
                                  children: [
                                    item.icon,
                                    item.id
                                  ]
                                },
                                item.id
                              ))
                            }
                          ),
                          /* @__PURE__ */ jsx("span", { className: "mx-0.5 h-4 w-px shrink-0 bg-line" }),
                          /* @__PURE__ */ jsx(
                            "button",
                            {
                              type: "button",
                              "aria-label": expanded ? "Show fewer actions" : "Show more actions",
                              "aria-expanded": expanded,
                              onClick: () => setExpanded((value) => !value),
                              className: "flex size-7 shrink-0 items-center justify-center rounded-full text-ink transition-[background-color,transform] duration-200 hover:bg-hover active:scale-[0.96]",
                              children: /* @__PURE__ */ jsx(
                                "span",
                                {
                                  className: "flex transition-transform duration-400",
                                  style: {
                                    transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
                                    transitionTimingFunction: "cubic-bezier(0.23,1,0.32,1)"
                                  },
                                  children: icons.chevron
                                }
                              )
                            }
                          )
                        ]
                      }
                    ),
                    /* @__PURE__ */ jsx(
                      "div",
                      {
                        className: "flex min-w-0 items-center overflow-hidden transition-[max-width,opacity,transform] duration-400",
                        style: {
                          maxWidth: hasPrompt ? 30 : 0,
                          opacity: hasPrompt ? 1 : 0,
                          transform: hasPrompt ? "scale(1)" : "scale(0.88)",
                          transitionTimingFunction: "cubic-bezier(0.23,1,0.32,1)"
                        },
                        children: /* @__PURE__ */ jsx(
                          "button",
                          {
                            type: "button",
                            "aria-label": "Send edit instruction",
                            onClick: () => run(prompt.trim()),
                            className: "flex size-7 shrink-0 items-center justify-center rounded-full bg-ink text-surface transition-[opacity,transform] duration-200 active:scale-[0.94]",
                            children: icons.send
                          }
                        )
                      }
                    )
                  ] })
                ]
              }
            )
          }
        )
      }
    )
  ] }) });
}
export {
  SelectionActions as default
};
