import { AnimatePresence, motion, useReducedMotion, useIsPresent } from "motion/react";
import { ThinkingOrb as LibraryOrb } from "thinking-orbs";

const ease = [0.22, 1, 0.36, 1];

export function ThinkingOrb(props) {
  const reduced = useReducedMotion();
  return <LibraryOrb theme="light" {...props} paused={reduced || props.paused} />;
}

// Keep navigation and the composer responsive; only the changing screen fades.
export function ScreenTransition({ screenKey, children, className, as = "div", lift = true, page = false }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <AnimatedScreen key={screenKey} className={className} as={as} lift={lift} page={page}>
        {children}
      </AnimatedScreen>
    </AnimatePresence>
  );
}

function AnimatedScreen({ children, className, as, lift, page }) {
  const reduced = useReducedMotion();
  const present = useIsPresent();
  const Surface = as === "main" ? motion.main : motion.div;
  return (
      <Surface
        className={className}
        inert={!present}
        aria-hidden={!present || undefined}
        initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : page ? 20 : !lift ? 0 : 7 }}
        animate={{ opacity: 1, y: 0, transition: { duration: reduced ? 0 : page ? 0.4 : 0.28, ease } }}
        exit={{ opacity: reduced ? 1 : 0, y: reduced || !page ? 0 : -16, transition: { duration: reduced ? 0 : page ? 0.22 : 0.12, ease } }}
      >
        {children}
      </Surface>
  );
}

export function OrbLoading({ label = "Opening your workspace…", compact = false, state = "connecting" }) {
  return (
    <div className={compact ? "orb-loading compact" : "app-loading orb-loading"} role="status">
      <ThinkingOrb state={state} size={compact ? 32 : 64} aria-hidden="true" />
      {!compact && <span className="wordmark">offload</span>}
      <p>{label}</p>
    </div>
  );
}
