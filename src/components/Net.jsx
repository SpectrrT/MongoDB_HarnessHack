import { useEffect, useRef } from "react";
export default function Net() {
  const ref = useRef();
  useEffect(() => {
    let effect,
      cancelled = false;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches) return;
    Promise.all([import("three"), import("vanta/dist/vanta.net.min.js")])
      .then(([THREE, V]) => {
        if (cancelled) return;
        const makeNet =
          typeof V.default === "function" ? V.default : window.VANTA?.NET;
        if (!makeNet) return;
        effect = makeNet({
          el: ref.current,
          THREE,
          mouseControls: true,
          touchControls: false,
          gyroControls: false,
          minHeight: 300,
          minWidth: 200,
          scale: 1.5,
          scaleMobile: 2.5,
          color: 0x454545,
          backgroundColor: 0xffffff,
          points: 7,
          maxDistance: 19,
          spacing: 18,
          showDots: true,
        });
      })
      .catch(() => {});
    const visibility = () => {
      if (effect?.renderer)
        effect.renderer.domElement.style.visibility = document.hidden
          ? "hidden"
          : "visible";
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cancelled = true;
      effect?.destroy();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  return <div className="net-background" ref={ref} aria-hidden="true" />;
}
