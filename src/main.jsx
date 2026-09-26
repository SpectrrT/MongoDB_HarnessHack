import React, { Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { WorkspaceProvider } from "./store";
import Landing from "./pages/Landing";
import "./styles.css";
import "./polish.css";
import { ScreenTransition, OrbLoading } from "./components/ScreenTransition";
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
function AppScreens() {
  const location = useLocation();
  const screen = location.pathname.startsWith("/app")
    ? "workspace"
    : location.pathname;
  return (
    <ScreenTransition screenKey={screen} className="app-screen" lift={false}>
      <Suspense fallback={<OrbLoading />}>
        <Routes location={location}>
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
    </ScreenTransition>
  );
}
const root = import.meta.hot?.data.root || createRoot(document.getElementById("root"));
if(import.meta.hot) import.meta.hot.data.root = root;
root.render(
  <AppBoundary>
    <BrowserRouter>
      <WorkspaceProvider>
        <AppScreens />
      </WorkspaceProvider>
    </BrowserRouter>
  </AppBoundary>,
);
if ("serviceWorker" in navigator && import.meta.env.PROD)
  navigator.serviceWorker.register("/sw.js").catch(() => {});
