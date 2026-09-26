// Adapted from the original publicly provided Beautiful UI source. See THIRD_PARTY.md.
"use client";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "../../components/primitives";
import GlideMenu from "../../components/primitives";
const QUESTIONS = [
  {
    q: "How many flavors should we launch?",
    type: "radio",
    options: ["Three (core line)", "Five (full case)", "Just one hero"]
  },
  {
    q: "Which mix-ins should we stock?",
    type: "check",
    options: ["Chocolate chips", "Waffle bits", "Sprinkles"]
  },
  {
    q: "Which market do we enter first?",
    type: "radio",
    options: ["Food trucks", "Grocery freezers", "Scoop shops"]
  }
];
const DEFAULT_LABELS = {
  skip: "Skip",
  continue: "Continue",
  send: "Send",
  customPlaceholder: "Something else\u2026",
  sentMessage: "Answers sent"
};
const ROLL_MS = 400;
const SLIDE = "360ms cubic-bezier(0.22, 1, 0.36, 1)";
function RollingDigits({ value }) {
  const prevRef = useRef(value);
  const [oldVal, setOldVal] = useState(value);
  const [newVal, setNewVal] = useState(value);
  const [rolling, setRolling] = useState(false);
  const [shifted, setShifted] = useState(false);
  const [dir, setDir] = useState("up");
  useEffect(() => {
    if (prevRef.current === value) return;
    const from = prevRef.current;
    prevRef.current = value;
    const fromN = parseInt(from, 10);
    const toN = parseInt(value, 10);
    setDir(Number.isFinite(fromN) && Number.isFinite(toN) && toN < fromN ? "down" : "up");
    setOldVal(from);
    setNewVal(value);
    setRolling(true);
    setShifted(false);
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setShifted(true));
    });
    const done = setTimeout(() => {
      setRolling(false);
      setOldVal(value);
      setShifted(false);
    }, ROLL_MS);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      clearTimeout(done);
    };
  }, [value]);
  const chars = rolling ? newVal : oldVal;
  return /* @__PURE__ */ jsx(Fragment, { children: Array.from({ length: chars.length }, (_, i) => {
    const o = oldVal[i] ?? "";
    const n = chars[i] ?? "";
    if (!rolling || o === n) {
      return /* @__PURE__ */ jsx("span", { children: n }, `${i}-${n}`);
    }
    const top = dir === "down" ? n : o;
    const bottom = dir === "down" ? o : n;
    const restY = dir === "down" ? "0" : "-1em";
    const startY = dir === "down" ? "-1em" : "0";
    return /* @__PURE__ */ jsx(
      "span",
      {
        style: { display: "inline-block", position: "relative", overflow: "hidden", height: "1em", lineHeight: "1em", verticalAlign: "-0.05em" },
        children: /* @__PURE__ */ jsxs(
          "span",
          {
            style: {
              display: "flex",
              flexDirection: "column",
              transition: "transform 350ms cubic-bezier(0.4, 0, 0.2, 1)",
              transform: `translateY(${shifted ? restY : startY})`
            },
            children: [
              /* @__PURE__ */ jsx("span", { style: { height: "1em", lineHeight: "1em" }, children: top }),
              /* @__PURE__ */ jsx("span", { style: { height: "1em", lineHeight: "1em" }, children: bottom })
            ]
          }
        )
      },
      `${i}-${o}-${n}-${dir}`
    );
  }) });
}
function Ico({ path, size = 14, sw = 2 }) {
  return /* @__PURE__ */ jsx("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: sw, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, children: path });
}
function ApprovalCard({
  questions = QUESTIONS,
  labels,
  onSubmitted,
  onAnswerChange,
  resettable = true,
  manual = false,
  variant,
  onSkipped
} = {}) {
  const t = { ...DEFAULT_LABELS, ...labels };
  const [qi, setQi] = useState(0);
  const [answers, setAnswers] = useState({});
  const [custom, setCustom] = useState({});
  const [sent, setSent] = useState(false);
  const [open, setOpen] = useState(true);
  const advanceTimer = useRef(null);
  const questionRefs = useRef([]);
  const measured = useRef(false);
  const [viewportH, setViewportH] = useState(void 0);
  const [trackY, setTrackY] = useState(0);
  const [animate, setAnimate] = useState(false);
  const [ready, setReady] = useState(false);
  const last = qi === questions.length - 1;
  const selected = answers[qi] ?? [];
  const hasAnswer = selected.length > 0 || Boolean(custom[qi]?.trim());
  const sync = (withAnim) => {
    const item = questionRefs.current[qi];
    if (!item) return;
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setViewportH(item.offsetHeight);
    setTrackY(item.offsetTop);
    setAnimate(withAnim && !reduce);
  };
  useLayoutEffect(() => {
    const withAnim = measured.current;
    measured.current = true;
    sync(withAnim);
    setReady(true);
  }, [qi, answers, custom, open, sent]);
  useEffect(() => {
    const id = requestAnimationFrame(() => sync(measured.current));
    return () => cancelAnimationFrame(id);
  }, [qi]);
  useEffect(() => () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
  }, []);
  const goTo = (next) => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    setQi(Math.min(Math.max(next, 0), questions.length - 1));
  };
  const send = () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    setSent(true);
    onSubmitted?.(answers, custom);
  };
  const advance = () => {
    if (last) send();
    else goTo(qi + 1);
  };
  const toggle = (index) => {
    const type = questions[qi].type;
    setAnswers((current) => {
      const picked = current[qi] ?? [];
      const next = type === "radio" ? [index] : picked.includes(index) ? picked.filter((item) => item !== index) : [...picked, index];
      onAnswerChange?.(qi, next);
      return { ...current, [qi]: next };
    });
    if (type === "radio" && !manual) {
      setCustom((current) => ({ ...current, [qi]: "" }));
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
      advanceTimer.current = setTimeout(() => {
        if (last) send();
        else setQi((current) => Math.min(questions.length - 1, current + 1));
      }, 480);
    }
  };
  const reset = () => {
    setQi(0);
    setAnswers({});
    setCustom({});
    setSent(false);
    setOpen(true);
    measured.current = false;
  };
  if (variant === "decision") return /* @__PURE__ */ jsxs("div", { className: "approval-decision", children: [
    /* @__PURE__ */ jsx("p", { children: questions[0]?.q }),
    /* @__PURE__ */ jsxs("div", { className: "approval-decision-actions", children: [
      /* @__PURE__ */ jsx(Button, { type: "button", variant: "secondary", onClick: () => onSkipped?.(), children: "Decline" }),
      /* @__PURE__ */ jsx(Button, { type: "button", onClick: () => onSubmitted?.({ 0: [0] }, {}), children: "Allow once" })
    ] })
  ] });
  if (!open) {
    return /* @__PURE__ */ jsx("button", { type: "button", onClick: () => setOpen(true), className: "rounded-control bg-surface px-3 py-2 text-[12.5px] font-medium text-ink shadow-btn transition-colors duration-150 hover:bg-hover", children: "Open approval" });
  }
  if (sent) {
    return /* @__PURE__ */ jsxs("div", { className: "flex w-full max-w-80 items-center gap-3", style: { animation: "pop-in 260ms cubic-bezier(0.23,1,0.32,1) both" }, children: [
      /* @__PURE__ */ jsxs("span", { className: "inline-flex items-center gap-1.5 rounded-full bg-green-tint py-1 pr-2.5 pl-1 text-[12.5px] font-medium text-green", children: [
        /* @__PURE__ */ jsx("span", { className: "flex size-4.5 items-center justify-center rounded-full bg-green text-white", children: /* @__PURE__ */ jsx("svg", { width: "11", height: "11", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "3", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ jsx("path", { d: "M20 6L9 17l-5-5" }) }) }),
        t.sentMessage
      ] }),
      resettable && /* @__PURE__ */ jsx("button", { type: "button", onClick: reset, className: "text-[12px] font-medium text-ink-3 transition-colors duration-150 hover:text-ink", children: "Start over" })
    ] });
  }
  return /* @__PURE__ */ jsx("div", { className: "w-full max-w-80", children: /* @__PURE__ */ jsxs("div", { className: "relative overflow-hidden rounded-card bg-surface shadow-card", style: { animation: "fade-up 380ms cubic-bezier(0.23,1,0.32,1) both" }, children: [
    /* @__PURE__ */ jsx(
      "button",
      {
        type: "button",
        "aria-label": "Dismiss",
        onClick: () => onSkipped ? onSkipped() : setOpen(false),
        className: "primitive-icon-button absolute right-2.5 top-2.5 z-10 text-ink-3 transition-colors duration-100 hover:bg-hover hover:text-ink",
        children: /* @__PURE__ */ jsx(Ico, { size: 14, sw: 2.2, path: /* @__PURE__ */ jsx("path", { d: "M18 6L6 18M6 6l12 12" }) })
      }
    ),
    /* @__PURE__ */ jsx("div", { className: "primitive-card-pad", children: /* @__PURE__ */ jsx(
      "div",
      {
        className: "overflow-hidden",
        style: { height: viewportH, transition: animate ? `height ${SLIDE}` : void 0 },
        "aria-live": "polite",
        children: /* @__PURE__ */ jsx(
          "div",
          {
            style: {
              display: "flex",
              flexDirection: "column",
              gap: 26,
              transform: `translate3d(0, ${-trackY}px, 0)`,
              transition: animate ? `transform ${SLIDE}` : void 0,
              willChange: "transform"
            },
            children: questions.map((question, qIdx) => {
              const active = qIdx === qi;
              if (!ready && !active) return null;
              const picked = answers[qIdx] ?? [];
              const questionStyle = {
                opacity: active ? 1 : 0,
                transition: animate ? `opacity ${SLIDE}` : void 0,
                pointerEvents: active ? void 0 : "none"
              };
              return /* @__PURE__ */ jsxs(
                "div",
                {
                  ref: (el) => {
                    questionRefs.current[qIdx] = el;
                  },
                  "aria-hidden": active ? void 0 : true,
                  style: questionStyle,
                  children: [
                    /* @__PURE__ */ jsx("div", { className: "pr-7 text-[14px] font-medium text-ink", children: question.q }),
                    /* @__PURE__ */ jsxs(GlideMenu, { className: "mt-2.5 flex flex-col gap-1", highlightClassName: "inset-x-0 rounded-control bg-hover", children: [
                      question.options.map((option, i) => {
                        const on = picked.includes(i);
                        return /* @__PURE__ */ jsxs(
                          "button",
                          {
                            type: "button",
                            "data-menu-row": true,
                            "aria-pressed": on,
                            tabIndex: active ? 0 : -1,
                            onClick: () => {
                              if (active) toggle(i);
                            },
                            className: "relative z-10 flex items-center gap-1.5 rounded-control pl-1 pr-2 py-1 text-left transition-colors duration-100",
                            children: [
                              /* @__PURE__ */ jsx(
                                "span",
                                {
                                  className: `flex size-4 shrink-0 items-center justify-center transition-colors duration-200
                                ${question.type === "radio" ? "rounded-full" : "rounded-[5px]"}
                                ${on ? "bg-ink text-canvas" : "shadow-[inset_0_0_0_1.5px_var(--line-strong)] text-transparent"}`,
                                  children: question.type === "radio" ? /* @__PURE__ */ jsx("span", { className: "size-1.5 rounded-full bg-canvas transition-transform duration-200", style: { transform: on ? "scale(1)" : "scale(0)" } }) : /* @__PURE__ */ jsx("svg", { width: "12", height: "12", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "3", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ jsx("path", { d: "M20 6L9 17l-5-5" }) })
                                }
                              ),
                              /* @__PURE__ */ jsx("span", { className: `text-[13px] leading-none transition-colors duration-200 ${on ? "text-ink" : "text-ink-2"}`, children: option })
                            ]
                          },
                          option
                        );
                      }),
                      /* @__PURE__ */ jsx("label", { "data-menu-row": true, className: "relative z-10 flex items-center gap-1.5 rounded-control pl-1 pr-2 py-1 transition-colors duration-100", children: /* @__PURE__ */ jsx(
                        "input",
                        {
                          value: custom[qIdx] ?? "",
                          tabIndex: active ? 0 : -1,
                          onChange: (event) => {
                            if (!active) return;
                            setCustom((current) => ({ ...current, [qIdx]: event.target.value }));
                            if (question.type === "radio") setAnswers((current) => ({ ...current, [qIdx]: [] }));
                          },
                          onKeyDown: (event) => {
                            if (event.key === "Enter" && hasAnswer) {
                              event.preventDefault();
                              advance();
                            }
                          },
                          placeholder: t.customPlaceholder,
                          "aria-label": "Custom answer",
                          className: "min-w-0 flex-1 bg-transparent pl-1.5 text-[13px] text-ink outline-none placeholder:text-ink-3"
                        }
                      ) })
                    ] })
                  ]
                },
                qIdx
              );
            })
          }
        )
      }
    ) }),
    /* @__PURE__ */ jsxs("div", { className: "primitive-card-footer flex items-center justify-between gap-3", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1 text-ink-3", children: [
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            "aria-label": "Previous question",
            disabled: qi <= 0,
            onClick: () => goTo(qi - 1),
            className: "flex size-[18px] items-center justify-center rounded-[5px] transition-colors duration-100 enabled:hover:text-ink disabled:opacity-30",
            children: /* @__PURE__ */ jsx(Ico, { size: 14, path: /* @__PURE__ */ jsx("path", { d: "M18 15l-6-6-6 6" }) })
          }
        ),
        /* @__PURE__ */ jsx("span", { className: "inline-flex items-center text-[12px] font-medium tabular-nums text-ink-3", style: { letterSpacing: "-0.1px", lineHeight: 1 }, children: /* @__PURE__ */ jsx(RollingDigits, { value: `${qi + 1} / ${questions.length}` }) }),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            "aria-label": "Next question",
            disabled: last,
            onClick: () => goTo(qi + 1),
            className: "flex size-[18px] items-center justify-center rounded-[5px] transition-colors duration-100 enabled:hover:text-ink disabled:opacity-30",
            children: /* @__PURE__ */ jsx(Ico, { size: 14, path: /* @__PURE__ */ jsx("path", { d: "M6 9l6 6 6-6" }) })
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "-mr-0.5 flex items-center gap-1.5", children: [
        /* @__PURE__ */ jsx(Button, { variant: "ghost", size: "sm", onClick: () => onSkipped ? onSkipped() : last ? setOpen(false) : goTo(qi + 1), children: t.skip }),
        /* @__PURE__ */ jsx(Button, { variant: "accent", size: "sm", disabled: !hasAnswer, onClick: advance, children: last ? t.send : t.continue })
      ] })
    ] })
  ] }) });
}
export {
  ApprovalCard as default
};
