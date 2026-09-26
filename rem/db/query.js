import { canonicalJson } from "../util.js";

export class MongoServerError extends Error {
  constructor(message, fields = {}) {
    super(message);
    this.name = "MongoServerError";
    Object.assign(this, fields);
  }
}

export const clone = (x) => (x === undefined ? undefined : structuredClone(x));
export const isPlainObject = (v) =>
  v !== null &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  !(v instanceof Date) &&
  !(v instanceof RegExp);
const isOperatorObject = (v) =>
  isPlainObject(v) &&
  Object.keys(v).length > 0 &&
  Object.keys(v).every((k) => k.startsWith("$"));

export function getPath(doc, path) {
  let v = doc;
  for (const part of path.split(".")) {
    if (v == null) return undefined;
    v = v[part];
  }
  return v;
}

export function setPath(doc, path, value) {
  const parts = path.split(".");
  let v = doc;
  for (const part of parts.slice(0, -1)) {
    if (v[part] === null || typeof v[part] !== "object") v[part] = {};
    v = v[part];
  }
  v[parts.at(-1)] = value;
}

export function unsetPath(doc, path) {
  const parts = path.split(".");
  const parent = parts.length > 1 ? getPath(doc, parts.slice(0, -1).join(".")) : doc;
  if (parent && typeof parent === "object") delete parent[parts.at(-1)];
}

function getValues(doc, path) {
  let current = [doc];
  for (const part of path.split(".")) {
    const next = [];
    for (const v of current) {
      if (Array.isArray(v)) {
        if (/^\d+$/.test(part) && v[Number(part)] !== undefined) next.push(v[Number(part)]);
        for (const el of v) if (isPlainObject(el) && part in el) next.push(el[part]);
      } else if (isPlainObject(v) && part in v) next.push(v[part]);
    }
    current = next;
  }
  return current;
}

const typeRank = (v) =>
  v === undefined || v === null
    ? 0
    : typeof v === "number"
      ? 1
      : typeof v === "string"
        ? 2
        : v instanceof Date
          ? 6
          : Array.isArray(v)
            ? 4
            : typeof v === "boolean"
              ? 5
              : 3;

export function compareValues(a, b) {
  const ra = typeRank(a),
    rb = typeRank(b);
  if (ra !== rb) return ra - rb;
  if (ra === 0) return 0;
  if (a instanceof Date) return a.getTime() - b.getTime();
  if (ra === 1 || ra === 2 || ra === 5) return a < b ? -1 : a > b ? 1 : 0;
  const ca = canonicalJson(a),
    cb = canonicalJson(b);
  return ca < cb ? -1 : ca > cb ? 1 : 0;
}

export const equalValues = (a, b) =>
  (a == null && b == null) || (typeRank(a) === typeRank(b) && compareValues(a, b) === 0);

const comparable = (a, b) =>
  (typeof a === "number" && typeof b === "number") ||
  (typeof a === "string" && typeof b === "string") ||
  (a instanceof Date && b instanceof Date);
const flat = (values) => values.flatMap((v) => (Array.isArray(v) ? [v, ...v] : [v]));

function matchEq(values, target) {
  if (target === null) return values.length === 0 || values.some((v) => v == null);
  if (target instanceof RegExp)
    return flat(values).some((v) => typeof v === "string" && target.test(v));
  return values.some(
    (v) => equalValues(v, target) || (Array.isArray(v) && v.some((x) => equalValues(x, target))),
  );
}

function matchCondition(values, cond, doc) {
  if (!isOperatorObject(cond)) return matchEq(values, cond);
  return Object.entries(cond).every(([op, arg]) => {
    switch (op) {
      case "$eq":
        return matchEq(values, arg);
      case "$ne":
        return !matchEq(values, arg);
      case "$in":
        return arg.some((t) => matchEq(values, t));
      case "$nin":
        return !arg.some((t) => matchEq(values, t));
      case "$gt":
      case "$gte":
      case "$lt":
      case "$lte":
        return flat(values).some((v) => {
          if (!comparable(v, arg)) return false;
          const c = compareValues(v, arg);
          return op === "$gt" ? c > 0 : op === "$gte" ? c >= 0 : op === "$lt" ? c < 0 : c <= 0;
        });
      case "$exists":
        return values.some((v) => v !== undefined) === Boolean(arg);
      case "$regex": {
        const re = arg instanceof RegExp ? arg : new RegExp(arg, cond.$options || "");
        return flat(values).some((v) => typeof v === "string" && re.test(v));
      }
      case "$options":
        return true;
      case "$size":
        return values.some((v) => Array.isArray(v) && v.length === arg);
      case "$all":
        return values.some(
          (v) => Array.isArray(v) && arg.every((t) => v.some((x) => equalValues(x, t))),
        );
      case "$elemMatch":
        return values.some(
          (v) =>
            Array.isArray(v) &&
            v.some((el) =>
              isPlainObject(el) && !isOperatorObject(arg)
                ? matches(el, arg)
                : matchCondition([el], arg, doc),
            ),
        );
      case "$not":
        return !matchCondition(values, arg, doc);
      default:
        throw new MongoServerError(`unknown operator: ${op}`, { code: 2 });
    }
  });
}

export function matches(doc, filter = {}) {
  for (const [key, cond] of Object.entries(filter || {})) {
    if (key === "$and") {
      if (!cond.every((f) => matches(doc, f))) return false;
    } else if (key === "$or") {
      if (!cond.some((f) => matches(doc, f))) return false;
    } else if (key === "$nor") {
      if (cond.some((f) => matches(doc, f))) return false;
    } else if (key === "$expr") {
      if (!evalExpr(cond, doc)) return false;
    } else if (!matchCondition(getValues(doc, key), cond, doc)) return false;
  }
  return true;
}

export function upsertBase(filter = {}) {
  const base = {};
  for (const [key, cond] of Object.entries(filter)) {
    if (key === "$and") Object.assign(base, ...cond.map(upsertBase));
    else if (key.startsWith("$")) continue;
    else if (!isOperatorObject(cond)) setPath(base, key, clone(cond));
    else if ("$eq" in cond) setPath(base, key, clone(cond.$eq));
  }
  return base;
}

export function applyUpdate(doc, update, { inserting = false } = {}) {
  const keys = Object.keys(update || {});
  if (!keys.length || !keys.every((k) => k.startsWith("$")))
    throw new MongoServerError("Update document requires atomic operators", { code: 9 });
  const updatedFields = {},
    removedFields = [];
  for (const [op, fields] of Object.entries(update)) {
    for (const [path, arg] of Object.entries(fields)) {
      switch (op) {
        case "$set":
          setPath(doc, path, clone(arg));
          updatedFields[path] = clone(arg);
          break;
        case "$setOnInsert":
          if (inserting) setPath(doc, path, clone(arg));
          break;
        case "$unset":
          unsetPath(doc, path);
          removedFields.push(path);
          break;
        case "$inc": {
          const value = (getPath(doc, path) ?? 0) + arg;
          setPath(doc, path, value);
          updatedFields[path] = value;
          break;
        }
        case "$min":
        case "$max": {
          const current = getPath(doc, path);
          const c = current === undefined ? null : compareValues(arg, current);
          if (c === null || (op === "$min" ? c < 0 : c > 0)) {
            setPath(doc, path, clone(arg));
            updatedFields[path] = clone(arg);
          }
          break;
        }
        case "$push":
        case "$addToSet": {
          let arr = getPath(doc, path);
          if (arr === undefined) setPath(doc, path, (arr = []));
          if (!Array.isArray(arr))
            throw new MongoServerError(`The field '${path}' must be an array`, { code: 2 });
          const each = isPlainObject(arg) && "$each" in arg;
          for (const item of each ? arg.$each : [arg])
            if (op === "$push" || !arr.some((x) => equalValues(x, item))) arr.push(clone(item));
          if (op === "$push" && each && arg.$slice !== undefined) {
            const kept = arg.$slice < 0 ? arr.slice(arg.$slice) : arr.slice(0, arg.$slice);
            arr.splice(0, arr.length, ...kept);
          }
          updatedFields[path] = clone(arr);
          break;
        }
        case "$pull": {
          const arr = getPath(doc, path);
          if (!Array.isArray(arr)) break;
          const kept = arr.filter((x) =>
            isPlainObject(arg) && isPlainObject(x) && !isOperatorObject(arg)
              ? !matches(x, arg)
              : !matchCondition([x], arg, doc),
          );
          setPath(doc, path, kept);
          updatedFields[path] = clone(kept);
          break;
        }
        default:
          throw new MongoServerError(`Unknown modifier: ${op}`, { code: 9 });
      }
    }
  }
  return { updatedFields, removedFields };
}

export function sortDocs(docs, spec) {
  const entries = Object.entries(spec || {});
  if (!entries.length) return docs;
  return [...docs].sort((a, b) => {
    for (const [path, dir] of entries) {
      const c = compareValues(getPath(a, path), getPath(b, path));
      if (c) return dir < 0 ? -c : c;
    }
    return 0;
  });
}

export function project(doc, projection) {
  if (!projection || !Object.keys(projection).length) return doc;
  const keys = Object.keys(projection);
  const inclusion = keys.some((k) => k !== "_id" && projection[k] !== 0 && projection[k] !== false);
  if (!inclusion) {
    const out = clone(doc);
    for (const k of keys) unsetPath(out, k);
    return out;
  }
  const out = {};
  if (projection._id !== 0 && projection._id !== false && doc._id !== undefined) out._id = doc._id;
  for (const k of keys) {
    if (k === "_id") continue;
    const spec = projection[k];
    if (spec === 1 || spec === true) {
      const v = getPath(doc, k);
      if (v !== undefined) setPath(out, k, clone(v));
    } else setPath(out, k, evalExpr(spec, doc));
  }
  return out;
}

const num = (v) => (typeof v === "number" ? v : 0);
const OPS = {
  $add: (a) => a.reduce((s, x) => s + num(x), 0),
  $subtract: ([a, b]) => (a == null || b == null ? null : a - b),
  $multiply: (a) => a.reduce((s, x) => s * num(x), 1),
  $divide: ([a, b]) => (a == null || !b ? null : a / b),
  $abs: (a) => (a == null ? null : Math.abs(Array.isArray(a) ? a[0] : a)),
  $round: (a) => {
    const [v, places = 0] = Array.isArray(a) ? a : [a];
    return v == null ? null : Math.round(v * 10 ** places) / 10 ** places;
  },
  $eq: ([a, b]) => equalValues(a, b),
  $ne: ([a, b]) => !equalValues(a, b),
  $gt: ([a, b]) => compareValues(a, b) > 0,
  $gte: ([a, b]) => compareValues(a, b) >= 0,
  $lt: ([a, b]) => compareValues(a, b) < 0,
  $lte: ([a, b]) => compareValues(a, b) <= 0,
  $and: (a) => a.every(Boolean),
  $or: (a) => a.some(Boolean),
  $not: (a) => !(Array.isArray(a) ? a[0] : a),
  $ifNull: (a) => a.find((x) => x != null) ?? null,
  $size: (a) => (Array.isArray(a) ? a.length : 0),
  $concat: (a) => a.map((x) => x ?? "").join(""),
  $toString: (a) => (a == null ? null : String(a)),
  $in: ([x, arr]) => (arr || []).some((y) => equalValues(x, y)),
  $sum: (a) => (Array.isArray(a) ? a.reduce((s, x) => s + num(x), 0) : num(a)),
  $avg: (a) => {
    const xs = (Array.isArray(a) ? a : [a]).filter((x) => typeof x === "number");
    return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
  },
  $max: (a) => (Array.isArray(a) ? a : [a]).reduce((m, x) => (m == null || compareValues(x, m) > 0 ? x : m), null),
  $min: (a) =>
    (Array.isArray(a) ? a : [a])
      .filter((x) => x != null)
      .reduce((m, x) => (m == null || compareValues(x, m) < 0 ? x : m), null),
  $arrayElemAt: ([arr, i]) => (Array.isArray(arr) ? arr.at(i) : null),
};

export function evalExpr(expr, doc) {
  if (typeof expr === "string" && expr.startsWith("$$")) return expr === "$$ROOT" ? doc : undefined;
  if (typeof expr === "string" && expr.startsWith("$")) return getPath(doc, expr.slice(1));
  if (Array.isArray(expr)) return expr.map((x) => evalExpr(x, doc));
  if (!isPlainObject(expr)) return expr;
  const keys = Object.keys(expr);
  if (keys.length === 1 && keys[0].startsWith("$")) {
    const [op] = keys,
      arg = expr[op];
    if (op === "$literal") return arg;
    if (op === "$cond") {
      const [cond, then, otherwise] = Array.isArray(arg) ? arg : [arg.if, arg.then, arg.else];
      return evalExpr(cond, doc) ? evalExpr(then, doc) : evalExpr(otherwise, doc);
    }
    if (!OPS[op]) throw new MongoServerError(`Unrecognized expression '${op}'`, { code: 168 });
    return OPS[op](evalExpr(arg, doc));
  }
  return Object.fromEntries(keys.map((k) => [k, evalExpr(expr[k], doc)]));
}

const ACCUMULATORS = {
  $sum: (xs) => xs.reduce((s, x) => s + num(x), 0),
  $avg: (xs) => OPS.$avg(xs),
  $min: (xs) => OPS.$min(xs),
  $max: (xs) => OPS.$max(xs.filter((x) => x != null)),
  $push: (xs) => xs,
  $addToSet: (xs) => xs.filter((x, i) => xs.findIndex((y) => equalValues(x, y)) === i),
  $first: (xs) => xs[0] ?? null,
  $last: (xs) => xs.at(-1) ?? null,
};

function group(docs, spec) {
  const groups = new Map();
  for (const doc of docs) {
    const id = evalExpr(spec._id, doc) ?? null;
    const key = canonicalJson(id);
    if (!groups.has(key)) groups.set(key, { id, docs: [] });
    groups.get(key).docs.push(doc);
  }
  return [...groups.values()].map(({ id, docs: members }) => {
    const out = { _id: id };
    for (const [field, acc] of Object.entries(spec)) {
      if (field === "_id") continue;
      const [op] = Object.keys(acc);
      if (op === "$count") out[field] = members.length;
      else if (!ACCUMULATORS[op])
        throw new MongoServerError(`unknown group operator '${op}'`, { code: 15952 });
      else out[field] = ACCUMULATORS[op](members.map((d) => evalExpr(acc[op], d)));
    }
    return out;
  });
}

export function runPipeline(docs, pipeline, lookup) {
  let out = docs;
  for (const stage of pipeline) {
    const [name] = Object.keys(stage),
      arg = stage[name];
    switch (name) {
      case "$match":
        out = out.filter((d) => matches(d, arg));
        break;
      case "$sort":
        out = sortDocs(out, arg);
        break;
      case "$limit":
        out = out.slice(0, arg);
        break;
      case "$skip":
        out = out.slice(arg);
        break;
      case "$project":
        out = out.map((d) => project(d, arg));
        break;
      case "$addFields":
      case "$set":
        out = out.map((d) => {
          const next = clone(d);
          for (const [k, v] of Object.entries(arg)) setPath(next, k, evalExpr(v, d));
          return next;
        });
        break;
      case "$unset":
        out = out.map((d) => project(d, Object.fromEntries([arg].flat().map((k) => [k, 0]))));
        break;
      case "$group":
        out = group(out, arg);
        break;
      case "$unwind": {
        const path = (typeof arg === "string" ? arg : arg.path).slice(1);
        const keep = typeof arg === "object" && arg.preserveNullAndEmptyArrays;
        out = out.flatMap((d) => {
          const v = getPath(d, path);
          if (!Array.isArray(v) || !v.length) return keep ? [d] : [];
          return v.map((item) => {
            const next = clone(d);
            setPath(next, path, item);
            return next;
          });
        });
        break;
      }
      case "$count":
        out = [{ [arg]: out.length }];
        break;
      case "$replaceRoot":
        out = out.map((d) => evalExpr(arg.newRoot, d));
        break;
      case "$lookup":
        out = out.map((d) => ({
          ...d,
          [arg.as]: lookup(arg.from).filter((f) =>
            [getPath(d, arg.localField)]
              .flat()
              .some((v) => matchEq(getValues(f, arg.foreignField), v)),
          ),
        }));
        break;
      case "$vectorSearch":
      case "$search":
      case "$searchMeta":
      case "$rankFusion":
        throw new MongoServerError(
          `${name} needs Atlas Search; the memory db runs hybrid search app-side (rem/search.js)`,
          { code: 40324 },
        );
      default:
        throw new MongoServerError(`Unrecognized pipeline stage name: '${name}'`, { code: 40324 });
    }
  }
  return out;
}
