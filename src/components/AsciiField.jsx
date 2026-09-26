import { useEffect, useRef, useState } from "react";

// A small character renderer. No WebGL, images, or per-frame React renders.
function frame(time) {
  const width = 88, height = 40;
  const pixels = Array(width * height).fill(" ");
  const depth = new Float32Array(width * height).fill(-Infinity);
  const ramp = ".,:;=+*#%@";
  const a = 0.8 + time * 0.17, b = -0.35 + time * 0.11;
  for (let v = 0; v < Math.PI * 2; v += 0.045) {
    for (let u = 0; u < Math.PI * 2; u += 0.045) {
      const ring = 1.6 + 0.58 * Math.cos(v);
      const x = ring * Math.cos(u), y = ring * Math.sin(u);
      const z = 0.58 * Math.sin(v) + 0.17 * Math.sin(u * 3 + time * 0.3);
      const ry = y * Math.cos(a) - z * Math.sin(a);
      const rz = y * Math.sin(a) + z * Math.cos(a);
      const rx = x * Math.cos(b) - ry * Math.sin(b);
      const yy = x * Math.sin(b) + ry * Math.cos(b);
      const perspective = 5 / (5 - rz);
      const px = Math.round(width / 2 + rx * 15 * perspective);
      const py = Math.round(height / 2 + yy * 7.4 * perspective);
      if (px < 0 || px >= width || py < 0 || py >= height) continue;
      const i = py * width + px;
      if (rz <= depth[i]) continue;
      depth[i] = rz;
      const light = (Math.cos(u - 0.7) * Math.cos(v) + Math.sin(v - a) + 2) / 4;
      pixels[i] = ramp[Math.min(ramp.length - 1, Math.floor(light * ramp.length))];
    }
  }
  return Array.from({ length: height }, (_, y) => pixels.slice(y * width, (y + 1) * width).join("")).join("\n");
}

const still = frame(0);
export default function AsciiField() {
  const text = useRef(null), region = useRef(null);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(preference.matches);
    sync();
    preference.addEventListener("change", sync);
    return () => preference.removeEventListener("change", sync);
  }, []);
  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    if (paused || reduced || preference.matches) return;
    let animation, previous = 0, elapsed = 0, visible = false;
    const tick = (now) => {
      if (!visible || document.hidden) { animation = null; return; }
      if (now - previous >= 100) {
        elapsed += 0.1;
        previous = now;
        if (text.current) text.current.textContent = frame(elapsed);
      }
      animation = requestAnimationFrame(tick);
    };
    const start = () => {
      if (visible && !document.hidden && animation == null) animation = requestAnimationFrame(tick);
    };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; start(); });
    observer.observe(region.current);
    document.addEventListener("visibilitychange", start);
    return () => { observer.disconnect(); cancelAnimationFrame(animation); document.removeEventListener("visibilitychange", start); };
  }, [paused, reduced]);
  return <figure className="ascii-sculpture" ref={region}>
    <div className="ascii-frame-label" aria-hidden="true"><span>+ CONTEXT IN MOTION</span><span>01 / OFFLOAD +</span></div>
    <pre ref={text} aria-hidden="true">{still}</pre>
    <figcaption>
      <span>A little less on your mind.</span>
      {!reduced && <button type="button" aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? "[ Play ]" : "[ Pause ]"}<span className="sr-only"> ASCII animation</span></button>}
    </figcaption>
  </figure>;
}
