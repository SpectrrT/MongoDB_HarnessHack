# Offload engineering demo

Use the prepared MongoDB engineer history first. There is no need to record a new week or wait for live activity. Show how Offload recognizes the example pattern, then explicitly ask it to investigate a query in a disposable database. The history proposal does **not** automatically launch the query test.

## Before presenting

- Open the local Offload app with its local service running. The public static website alone cannot record this computer or run commands.
- Confirm History can reach MongoDB and Connections shows a working model. The query demo needs a model with local tools and permission to run its sandbox commands.
- Use the isolated prepared history workspace `offload-mongodb-demo`. It contains synthetic engineer activity; it does not replace or copy Floyd's personal history. After the prepared data has been loaded and the current frontend snapshot built, launch:

  ```sh
  ACTIVITY_WORKSPACE=offload-mongodb-demo npm run demo
  ```

  If a demo snapshot has not been built, run `npm run demo:build` first. The launcher also prepares the query-demo folder. Starting only `npm run harness:server` does not do that preparation. The workspace override selects history; it does not seed it or establish a MongoDB connection by itself.
- Rehearse the real query task before judging. Its first run may need to download the pinned MongoDB binary. Model calls, downloads, and index tests do not have a guaranteed duration.
- Keep the provenance label visible. A prepared sample week demonstrates the workflow; it is not this person's recorded week. A saved example document is not a fresh live run.

## 1. Show the prepared engineer history

Open **History**. Keep recording off for this prepared walkthrough. Search for **orders** or **query review**, then open a matching day. Confirm the rows carry the sample/demo label.

The prepared story contains three weekly reviews: Atlas slow-query metrics, GitHub query code, a Linear issue, then Notion review notes. Each historical review has four five-minute sessions around 11 a.m. New York time. The source also includes an example recent call and note-taking session. The fixture's 180 ms p95 and 0.6% timeout values are supplied example context, not current measurements.

Explain that the history stores app names, window titles, and timestamps. It does not infer an email body or meeting transcript from a title. Optional live recording is a separate feature and is not needed to demonstrate the prepared pattern.

## 2. Turn repeated activity into a proposal

Open a **new chat** and choose **Find work to hand off**. It examines saved activity across the last 28 days. When supported, it shows observed app switching and a proposed workflow. With the isolated engineering sample, the expected proposal is **Prepare a database query review**. Its historical pattern is three observed dates, about 20 recorded minutes and three app switches per date. These are prepared-history statistics, not time savings. With too little repeated history, an empty result is the correct outcome.

Keep **Captured activity**, **Demo history**, or the mixed-source label visible. If live history is unavailable, the interface may show explicitly labeled saved demo analysis.

**Save workflow** saves a proposal only. **Prepare with model** starts a planning conversation using the supplied metadata. That request asks the model to check evidence and missing details; it does not authorize database changes. Recorded time is not measured time saved.

History's **What comes next** section is separate: **Prepare draft** fills the chat box for review and does not send it. **Set up routine** opens an editable schedule form; the user chooses its date/time, plans it, and later activates it. It never infers permission to run weekly from window visits.

## 3. Run the actual query investigation

Start another new chat. In **Suggested for you**, choose **Fix a slow aggregation**, marked **Prepared demo**. Clicking this starts the model task; review any approval requests it raises.

The supplied incident and workload are synthetic. The test itself uses a real local MongoDB process with 40,000 deterministic synthetic documents. It does not connect to the application database or a customer's production database.

Let the agent:

1. Read the incident, aggregation, and runbook.
2. Run the baseline and inspect its actual query plan.
3. Explain a candidate index and test it in the disposable database.
4. Compare documents and keys examined, returned rows, and measured timings. Verify that all projected rows match in the same order.
5. Save its investigation notes and raw evidence in the conversation's working folder.

The candidate is chosen by the agent, not built into the runner. If it does not improve the result, keep that result visible and let the agent revise its hypothesis. Do not promise a particular speedup.

## 4. Open the evidence

After the run finishes, open the generated files shown beneath the assistant response. Useful files include `report.json`, the baseline and candidate explain plans, query results, and the agent's investigation notes. Wait for each download link to finish preparing before opening it.

Use the current run's measurements. Scan counts and the winning plan are stronger evidence here than small timing differences: the fixture has warmed caches and no production traffic. Check the report's result-equality outcome and the runner's shutdown confirmation. A completed chat alone is not proof that every requested check passed.

If no files appear, inspect the agent's actual output paths. Reports belong in the conversation's visible `artifacts/query-demo/...` folder, not a hidden `.data` directory or an unrelated checkout. The download collector only exposes bounded files generated in that conversation's workspace.

## A 90-second spoken walkthrough

**0–20 seconds:** “This is a prepared example of a MongoDB engineer's history: Atlas, query code, an issue, and review notes across three weeks. We label it as sample data. A window title is not a meeting transcript.”

**20–40 seconds:** “These repeated visits suggest work I might hand off. Offload proposes a query-review routine. I can save it or ask the model to help plan it. Nothing has been changed in a database.”

**40–70 seconds:** “Now I explicitly start the prepared query investigation. The incident is synthetic, but this is a real MongoDB test. The agent reads the baseline, chooses an index, and checks whether the results remain identical.”

**70–90 seconds:** “Here are this run's report and explain plans. These are the measured scan counts and timings, not a promised speedup. The output is downloadable evidence that an engineer can review.”

Rehearse this timing using a completed run, or clearly say a live run is still in progress. Do not disguise a previous run as one completed during the presentation.

## Keep the two examples distinct

The meeting-checklist example documented in [mongodb-engineer-demo.md](mongodb-engineer-demo.md) generates a local rollout/rollback draft from supplied notes. Its published receipt proves a model-generated draft and file checks; it does **not** prove query execution or database performance. The actual query runner is documented in [QUERY-DEMO.md](QUERY-DEMO.md).

Jev activity appears only when actual Jev scoring occurs. A short chat can need no compaction, and native Codex compaction is labeled separately. Do not expect a Jev call on every turn.

This workflow makes no production database changes, sends no customer messages, and books no meetings. The real test does create and query an index inside its disposable local database.
