import crypto from "node:crypto";

export const sha256 = (text) =>
  crypto.createHash("sha256").update(String(text)).digest("hex");

export function canonicalJson(value) {
  if (value instanceof Date) return JSON.stringify({ $date: value.toISOString() });
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value)
    .filter((k) => value[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`)
    .join(",")}}`;
}

export function createRng(seed = 1) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (n) => Math.floor(next() * n),
    pick: (items) => items[Math.floor(next() * items.length)],
    chance: (p) => next() < p,
  };
}

export function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

export const clone = (value) => structuredClone(value);

export function createClock(start = Date.parse("2026-08-24T13:00:00Z")) {
  let t = start;
  return {
    now: () => t,
    date: () => new Date(t),
    advance: (ms) => (t += Math.max(0, Math.round(ms))),
    set: (ms) => (t = ms),
  };
}

export const DAY_MS = 86400000;
export const weekNumber = (week) => Number(String(week).replace(/^W/, ""));
export const weekLabel = (n) => `W${n}`;
export const round = (n, places = 2) => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};
export const sum = (items, fn = (x) => x) =>
  items.reduce((total, x) => total + (fn(x) || 0), 0);
export const mean = (items, fn = (x) => x) =>
  items.length ? sum(items, fn) / items.length : 0;
