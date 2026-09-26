import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryDb, ensureIndexes } from "../rem/db/index.js";

test("the memory db follows the driver's query, update and cursor semantics REM relies on", async () => {
  const db = createMemoryDb();
  const c = db.collection("things");
  const doc = { key: "a", n: 1, tags: ["x", "y"], meta: { owner: "maya", week: 35 } };
  const { insertedId } = await c.insertOne(doc);
  assert.equal(doc._id, insertedId, "insertOne sets _id on the caller's document like the driver");
  await c.insertMany([
    { key: "b", n: 5, tags: ["y"], meta: { owner: null, week: 36 } },
    { key: "c", n: 9, meta: { week: 37 } },
  ]);
  const keys = async (filter, options) => (await c.find(filter, options).toArray()).map((d) => d.key);
  assert.deepEqual(await keys({ tags: "y" }), ["a", "b"]);
  assert.deepEqual(await keys({ n: { $gte: 5 } }, { sort: { n: -1 } }), ["c", "b"]);
  assert.deepEqual(await keys({ "meta.week": { $in: [35, 37] } }), ["a", "c"]);
  assert.deepEqual(await keys({ key: { $nin: ["a"] }, n: { $ne: 9 } }), ["b"]);
  assert.deepEqual(await keys({ tags: { $exists: false } }), ["c"]);
  assert.deepEqual(await keys({ "meta.owner": null }), ["b", "c"]);
  assert.deepEqual(await keys({ $or: [{ n: 1 }, { $and: [{ n: { $gt: 4 } }, { n: { $lt: 6 } }] }] }), ["a", "b"]);
  assert.deepEqual(await c.find({}, { sort: { n: 1 }, limit: 1, projection: { key: 1, _id: 0 } }).toArray(), [{ key: "a" }]);
  const found = await c.findOne({ key: "a" });
  found.n = 999;
  assert.equal((await c.findOne({ key: "a" })).n, 1, "callers get clones");

  await c.updateOne({ key: "a" }, { $inc: { n: 2 }, $push: { tags: { $each: ["z"] } }, $addToSet: { tags: "x" }, $unset: { meta: "" } });
  assert.deepEqual(await c.findOne({ key: "a" }, { projection: { _id: 0 } }), { key: "a", n: 3, tags: ["x", "y", "z"] });
  const up = await c.updateOne({ key: "d" }, { $set: { n: 0 }, $setOnInsert: { created: true } }, { upsert: true });
  assert.equal(up.upsertedCount, 1);
  assert.deepEqual(await c.findOne({ key: "d" }, { projection: { _id: 0 } }), { key: "d", n: 0, created: true });
  const before = await c.findOneAndUpdate({ key: "d" }, { $set: { n: 4 } });
  const after = await c.findOneAndUpdate({ key: "d" }, { $set: { n: 5 } }, { returnDocument: "after" });
  assert.equal(before.n, 0);
  assert.equal(after.n, 5);
  assert.equal((await c.updateMany({ n: { $gte: 5 } }, { $set: { big: true } })).modifiedCount, 3);
  assert.equal((await c.deleteMany({ big: true })).deletedCount, 3);
  assert.equal(await c.countDocuments(), 1);
  await assert.rejects(c.updateOne({ key: "a" }, { key: "replaced" }), /atomic operators/);

  const grouped = await db
    .collection("edits")
    .insertMany([
      { type: "rule.add", ok: true, err: 1 },
      { type: "rule.add", ok: false, err: 3 },
      { type: "routing.set", ok: true, err: 0.5 },
    ])
    .then(() =>
      db
        .collection("edits")
        .aggregate([
          { $group: { _id: "$type", n: { $sum: 1 }, accepted: { $sum: { $cond: [{ $eq: ["$ok", true] }, 1, 0] } }, err: { $avg: "$err" } } },
          { $sort: { _id: 1 } },
        ])
        .toArray(),
    );
  assert.deepEqual(grouped, [
    { _id: "routing.set", n: 1, accepted: 1, err: 0.5 },
    { _id: "rule.add", n: 2, accepted: 1, err: 2 },
  ]);
});

test("TTL sweep, change stream iteration and time-series collections", async () => {
  const db = createMemoryDb();
  await ensureIndexes(db);
  const kinds = await db.listCollections({ name: "metrics" }).toArray();
  assert.equal(kinds[0].type, "timeseries");
  const episodes = db.collection("episodes");
  const stream = episodes.watch([{ $match: { operationType: "delete" } }]);
  await episodes.insertMany([
    { summary: "old", expireAt: new Date(1000) },
    { summary: "fresh", expireAt: new Date(5000) },
    { summary: "raw", expireAt: null },
  ]);
  assert.equal(await db.sweepExpired(2000), 1);
  const next = await stream[Symbol.asyncIterator]().next();
  assert.equal(next.value.operationType, "delete");
  assert.deepEqual((await episodes.find({}).toArray()).map((e) => e.summary), ["fresh", "raw"]);
  await stream.close();
  const indexes = await episodes.indexes();
  assert.ok(indexes.some((i) => i.name === "episodes_ttl" && i.expireAfterSeconds === 0));
  const search = await episodes.listSearchIndexes().toArray();
  assert.deepEqual(search[0].latestDefinition.fields[0], { type: "autoEmbed", path: "summary", model: "voyage-4", modality: "text" });
});
