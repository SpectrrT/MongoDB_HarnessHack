import { useState } from "react";

const raw = ["release-notes", "open-bugs", "release-notes", "team-decision", "open-bugs", "customer-rule", "release-notes", "team-decision"];
export default function AsciiMemory() {
  const [reviewed, setReviewed] = useState(false);
  const notes = reviewed ? [...new Set(raw)] : raw;
  return <section className="ascii-memory" aria-labelledby="memory-title">
    <div className="ascii-memory-copy">
      <span className="ascii-small">[ THE SLEEP REVIEW ]</span>
      <h2 id="memory-title">Less to carry.<br /><em>More to work with.</em></h2>
      <p>Keep the useful details.<br />Leave the repeated notes behind.</p>
      <button className="text-link" type="button" aria-pressed={reviewed} onClick={() => setReviewed(value => !value)}>{reviewed ? "Show the day again" : "See the review"} <span aria-hidden="true">{reviewed ? "<-" : "->"}</span></button>
    </div>
    <div className="ascii-memory-visual">
      <div className="ascii-frame-label"><span>{reviewed ? "AFTER REVIEW" : "A DAY OF NOTES"}</span><span>{String(notes.length).padStart(2, "0")} ENTRIES</span></div>
      <pre aria-hidden="true">{notes.map((note, i) => `${reviewed ? "[+]" : "[·]"} ${String(i + 1).padStart(2, "0")}  ${note.padEnd(16, ".")} ${reviewed ? "== retained" : ": logged"}`).join("\n")}</pre>
      <p className="ascii-memory-result" aria-live="polite">{reviewed ? "4 repeated entries removed. Every unique note kept." : "8 sample entries. Some notes appear more than once."}</p>
      <span className="ascii-small">Interactive illustration · sample notes</span>
    </div>
  </section>;
}
