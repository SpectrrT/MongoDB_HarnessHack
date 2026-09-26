import test from "node:test";
import assert from "node:assert/strict";
import { MIN_VECTOR, relevantHit } from "../server/activity/store.js";
import { embedText } from "../rem/embed.js";

const doc = (title, app = "Google Chrome", domain = "github.com") => ({ app, title, domain, vectors: { local256: embedText(`${app} ${title} ${domain}`) } });

test("an Atlas hit that shares a word with the query is kept, one typo allowed", () => {
  const d = doc("Pull request review: checkout flow");
  assert.equal(relevantHit(d, "checkout", embedText("checkout"), "local256"), true);
  assert.equal(relevantHit(d, "chekout", embedText("chekout"), "local256"), true, "one edit, like the text index's fuzzy match");
  assert.equal(relevantHit(d, "github", embedText("github"), "local256"), true, "domain words count");
});

test("a nearest neighbour with no shared word and a weak vector is dropped", () => {
  const d = doc("Pull request review: checkout flow");
  assert.equal(relevantHit(d, "zzzznonexistentqueryxyzblorf", embedText("zzzznonexistentqueryxyzblorf"), "local256"), false);
  assert.equal(relevantHit({ ...d, vectors: {} }, "quarterly taxes", embedText("quarterly taxes"), "local256"), false);
});

test("a strong vector match is kept even without a shared word", () => {
  const d = doc("Pull request review: checkout flow");
  assert.equal(relevantHit(d, "zzz", d.vectors.local256, "local256"), true);
  assert.ok(MIN_VECTOR > 0 && MIN_VECTOR < 1);
});
