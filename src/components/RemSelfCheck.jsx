import React from "react";

const brier = (x) => (x == null ? "n/a" : Number(x).toFixed(3));

// What the night's Rehearse and Calibrate phases found, read from the morning brief.
export default function RemSelfCheck({ brief }) {
  const r = brief.rehearse,
    c = brief.calibration;
  if (!r && !c) return null;
  return (
    <>
      {r && (
        <>
          <div className="section-line">
            <h3>Rehearsal: harder versions of work it already does</h3>
          </div>
          <table className="rem-table">
            <thead>
              <tr>
                <th>Level</th>
                <th>Built</th>
                <th>Tried</th>
                <th>Held</th>
                <th>Already failing</th>
                <th>Broke the harness</th>
                <th>Next level</th>
                <th>Ranked by</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{r.level}</td>
                <td>{r.imagined}</td>
                <td>{r.tried}</td>
                <td>{r.held}</td>
                <td>{r.alreadyFailing ?? 0}</td>
                <td>{r.broke.length}</td>
                <td>{r.nextLevel}</td>
                <td>{r.judge}</td>
              </tr>
            </tbody>
          </table>
          {r.broke.length > 0 && (
            <ul className="muted">
              {r.broke.map((b) => (
                <li key={b.id}>
                  Kept for Evolve: {b.title} ({b.failures[0] || "failed"})
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {c && (
        <>
          <div className="section-line">
            <h3>Grading the grader ({c.source})</h3>
          </div>
          <table className="rem-table">
            <thead>
              <tr>
                <th>Completion gate vs checkers</th>
                <th>Runs</th>
                <th>False accepts</th>
                <th>False rejects</th>
                <th>Brier</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["With the checks as evidence", c.checked],
                ["Blind, train", c.blind.train],
                ["Blind, held-out", c.blind.heldOut],
              ].map(([label, e]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td>{e.tasks}</td>
                  <td>{e.falseAccepts}</td>
                  <td>{e.falseRejects}</td>
                  <td>{brier(e.brier)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted">
            Completion threshold {c.threshold.from}
            {c.threshold.status === "kept"
              ? `, kept: ${c.threshold.reason}.`
              : `: ${c.threshold.status} ${c.threshold.proposed} (${c.threshold.reason}).`}
          </p>
        </>
      )}
    </>
  );
}
