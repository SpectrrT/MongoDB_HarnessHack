import { useState } from "react";

const raw = ["release-notes", "open-bugs", "release-notes", "team-decision", "open-bugs", "customer-rule", "release-notes", "team-decision"];
export default function AsciiMemory() {
  const [reviewed, setReviewed] = useState(false);
  const notes = reviewed ? [...new Set(raw)] : raw;
  return <section className="ascii-memory" aria-labelledby="memory-title">
    <div className="ascii-memory-copy">
      <span className="ascii-small">[ THE SLEEP REVIEW ]</span>
      <h2 id="memory-title">Keep the rules.<br /><em>Drop duplicate notes.</em></h2>
      <p>Review what the agent keeps for the next task.</p>
      <button className="text-link" type="button" aria-pressed={reviewed} onClick={() => setReviewed(value => !value)}>{reviewed ? "Show the day again" : "Review these notes"} <span aria-hidden="true">{reviewed ? "<-" : "->"}</span></button>
    </div>
    <div className="ascii-memory-visual">
      <div className="ascii-frame-label"><span>{reviewed ? "AFTER REVIEW" : "A DAY OF NOTES"}</span><span>{String(notes.length).padStart(2, "0")} ENTRIES</span></div>
      <pre aria-hidden="true">{notes.map((note, i) => `${reviewed ? "[+]" : "[·]"} ${String(i + 1).padStart(2, "0")}  ${note.padEnd(16, ".")} ${reviewed ? "== retained" : ": logged"}`).join("\n")}</pre>
      <p className="ascii-memory-result" aria-live="polite">{reviewed ? "4 repeated entries removed. Every unique note kept." : "8 example entries. Some notes appear more than once."}</p>
      <span className="ascii-small">Interactive illustration · example notes</span>
    </div>
  </section>;
}
