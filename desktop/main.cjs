const {
  app,
  BrowserWindow,
  session,
  shell,
  desktopCapturer,
  dialog,
} = require("electron");
const http = require("node:http"),
  fs = require("node:fs"),
  path = require("node:path");
let server, window, origin;
if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => {
  if (window) {
    if (window.isMinimized()) window.restore();
    window.focus();
  }
});
app.whenReady().then(() => {
  const root = path.resolve(
    __dirname,
    fs.existsSync(path.join(__dirname, "dist")) ? "dist" : "../dist",
  );
  server = http.createServer((req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, "http://local").pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    const requested = path.resolve(root, "." + pathname);
    if (!requested.startsWith(root + path.sep) && requested !== root) {
      res.writeHead(403).end();
      return;
    }
    const file =
      fs.existsSync(requested) && fs.statSync(requested).isFile()
        ? requested
        : path.join(root, "index.html");
    const types = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".css": "text/css",
      ".svg": "image/svg+xml",
      ".ttf": "font/ttf",
      ".png": "image/png",
      ".json": "application/json",
      ".webmanifest": "application/manifest+json",
    };
    res.setHeader(
      "Content-Type",
      types[path.extname(file)] || "application/octet-stream",
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    fs.createReadStream(file)
      .on("error", () => res.destroy())
      .pipe(res);
  });
  server.on("error", () => {
    dialog.showErrorBox(
      "Offload could not start",
      "Port 5195 is in use. Close the other Offload instance and try again.",
    );
    app.quit();
  });
  server.listen(5195, "127.0.0.1", () => {
    origin = "http://127.0.0.1:" + server.address().port;
    // A stable partition preserves local workspace data across desktop launches.
    window = new BrowserWindow({
      width: 1440,
      height: 900,
      minWidth: 780,
      minHeight: 600,
      title: "Offload",
      backgroundColor: "#ffffff",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        partition: "persist:offload",
      },
    });
    const ses = window.webContents.session;
    ses.setPermissionRequestHandler((wc, permission, cb, details) =>
      cb(
        wc === window.webContents &&
          details.requestingUrl?.startsWith(origin) &&
          ["media", "display-capture"].includes(permission),
      ),
    );
    ses.setDisplayMediaRequestHandler(
      async (request, cb) => {
        if (!request.frame?.url.startsWith(origin)) return cb({});
        try {
          const sources = await desktopCapturer.getSources({
            types: ["window", "screen"],
          });
          const result = await dialog.showMessageBox(window, {
            message: "Choose what Offload can record",
            detail:
              "Recording ends when you stop the session or close its window.",
            buttons: ["Cancel", ...sources.slice(0, 8).map((s) => s.name)],
            cancelId: 0,
            noLink: true,
          });
          if (result.response === 0) return cb({});
          cb({ video: sources[result.response - 1] });
        } catch {
          cb({});
        }
      },
      { useSystemPicker: true },
    );
    window.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith("https://")) shell.openExternal(url);
      return { action: "deny" };
    });
    window.webContents.on("will-navigate", (e, url) => {
      if (!url.startsWith(origin + "/")) {
        e.preventDefault();
        if (url.startsWith("https://")) shell.openExternal(url);
      }
    });
    window.loadURL(origin + "/app");
  });
});
app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => server?.close());
