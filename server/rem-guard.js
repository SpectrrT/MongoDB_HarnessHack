import crypto from "node:crypto";

// /api/rem/reset wipes REM's store, /api/rem/simulate runs days of work and /api/rem/rehearse stress-tests the
// harness. All three stay open on this machine (the demo, `npm run dev` through the Vite proxy, the API tests). From
// anywhere else they need REM_ADMIN_TOKEN in the x-rem-admin-token header; without that variable set they are
// refused, so a public deploy is closed by default.
export const REM_ADMIN_PATHS = ["/api/rem/reset", "/api/rem/simulate", "/api/rem/rehearse"];

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

// Every hop must be this machine: the socket peer and each X-Forwarded-For entry a proxy added.
export function isLocalRequest(req) {
  const hops = [req.socket?.remoteAddress, ...String(req.get?.("x-forwarded-for") || "").split(",")]
    .map((x) => (x || "").trim())
    .filter(Boolean);
  return hops.length > 0 && hops.every((x) => LOOPBACK.has(x));
}

function tokenMatches(given, expected) {
  if (!given || !expected) return false;
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

export function remAdminGuard({ token = () => process.env.REM_ADMIN_TOKEN } = {}) {
  return (req, res, next) => {
    if (isLocalRequest(req) || tokenMatches(req.get("x-rem-admin-token"), token())) return next();
    res.status(403).json({
      error: token()
        ? "REM reset and simulate need the admin token."
        : "REM reset and simulate only run on this machine. Set REM_ADMIN_TOKEN to allow them remotely.",
    });
  };
}
