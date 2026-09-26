import React, { Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { WorkspaceProvider } from "./store";
import Landing from "./pages/Landing";
import "./styles.css";
const Workspace = lazy(() => import("./pages/Workspace"));
class AppBoundary extends React.Component {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="app-loading">
        <h1>Something interrupted Offload.</h1>
        <p>Your saved workspace remains on this device.</p>
        <button onClick={() => location.reload()}>Reload workspace</button>
      </div>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")).render(
  <AppBoundary>
    <BrowserRouter>
      <WorkspaceProvider>
        <Suspense
          fallback={
            <div className="app-loading">
              <span className="wordmark">offload</span>
              <p>Opening…</p>
            </div>
          }
        >
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/app/*" element={<Workspace />} />
            <Route
              path="*"
              element={
                <div className="app-loading">
                  <h1>This page is not here.</h1>
                  <a href="/">Back to Offload</a>
                </div>
              }
            />
          </Routes>
        </Suspense>
      </WorkspaceProvider>
    </BrowserRouter>
  </AppBoundary>,
);
if ("serviceWorker" in navigator && import.meta.env.PROD)
  navigator.serviceWorker.register("/sw.js").catch(() => {});
