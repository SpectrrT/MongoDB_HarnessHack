import React, { lazy, Suspense, useState } from "react";
const source = import.meta.glob("../vendor/beautiful/*.jsx");
const entries = Object.entries(source).map(([p, loader]) => ({
  name: p.split("/").pop().replace(".jsx", ""),
  Component: lazy(loader),
}));
class Boundary extends React.Component {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <p>
        This upstream preview needs a supporting dependency. Its original source
        is included in vendor/beautiful-ui.
      </p>
    ) : (
      this.props.children
    );
  }
}
export default function Gallery() {
  const [active, setActive] = useState(entries[0].name);
  const { Component } = entries.find((x) => x.name === active);
  return (
    <div className="standard-page">
      <div className="page-title">
        <div>
          <h1>Component library</h1>
          <p>
            The original Beautiful UI examples. Example content belongs to the
            upstream previews.
          </p>
        </div>
      </div>
      <div className="gallery-layout">
        <nav>
          {entries.map((x) => (
            <button
              className={active === x.name ? "selected" : ""}
              onClick={() => setActive(x.name)}
              key={x.name}
            >
              {x.name.replace(/([A-Z])/g, " $1").trim()}
            </button>
          ))}
        </nav>
        <div className="gallery-preview beautiful-ui">
          <Boundary key={active}>
            <Suspense fallback={<p>Loading component…</p>}>
              <Component />
            </Suspense>
          </Boundary>
        </div>
      </div>
      <p className="small-copy">
        Source:{" "}
        <a href="https://www.beautifului.dev/" target="_blank" rel="noreferrer">
          beautifului.dev
        </a>
        . JavaScript adaptations preserve the published component logic.
        Supporting atoms use local adapters.
      </p>
    </div>
  );
}
