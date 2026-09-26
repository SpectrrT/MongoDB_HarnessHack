// REM across a restart: a night that stopped after committing its harness still advances the night
// number, and the run list stays newest first even though the simulated clock starts over.
import test from "node:test";
import assert from "node:assert/strict";
import { createRem, createMemoryDb } from "../rem/index.js";

test("a restart after an interrupted night keeps night numbers and run order straight", async () => {
  const db = createMemoryDb({ name: "restart" });
  const first = await createRem({ db });
  await first.runTask("weekly-brief");
  await first.sleep();
  const lastNight = Math.max(...(await first.state()).harness.lineage.map((v) => v.night ?? 0));
  assert.ok(lastNight >= 1, "the night should commit a harness version");
  await first.close();

  // The night committed its harness, then the process died before the brief was saved.
  await db.collection("briefs").deleteMany({});
  const again = await createRem({ db });
  try {
    assert.equal(again.day, lastNight + 1);
    await again.runTask("standup");
    const { runs } = await again.state();
    assert.equal(runs[0].kind, "standup");
  } finally {
    await again.close();
  }
});
