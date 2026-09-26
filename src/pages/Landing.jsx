import { Link } from "react-router-dom";
import { ArrowUpRight, ArrowRight, Plus } from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";
import Net from "../components/Net";
import {WorkDiagram,MemoryDiagram} from "../components/LandingDiagrams";
import "../landing-ascii.css";
export default function Landing() {
  return (
    <div className="site ascii-site">
      <nav className="site-nav">
        <Link to="/" className="wordmark">
          offload
        </Link>
        <div className="site-links">
          <a href="#how">How it works</a>
          <a href="#control">Your control</a>
        </div>
        <Link to="/app" className="button small">
          Open Offload <ArrowUpRight size={16} />
        </Link>
      </nav>
      <main>
        <section className="hero">
          <Net />
          <div className="hero-copy">
            <p className="eyebrow"><span aria-hidden="true">[ + ] </span>Work with fewer interruptions</p>
            <h1>
              Your agent should
              <br />
              <em>finish the job.</em>
            </h1>
            <p className="hero-description">
              Keep the context for work you repeat.
              <br />
              Choose a task now, or leave a brief for the morning.
            </p>
            <Link to="/app" className="button">
              Open your workspace <ArrowUpRight size={17} />
            </Link>
            <span className="hero-note">
              Your workspace stays on this device.
            </span>
          </div>
          <WorkDiagram />
        </section>
        <div className="ascii-sequence" aria-hidden="true"><span>[ observe ]</span><span>··············&gt;</span><span>[ remember ]</span><span>··············&gt;</span><span>[ suggest ]</span><span>··············&gt;</span><span>[ offload ]</span></div>
        <section className="site-preview" id="how">
          <div className="section-heading">
            <h2>
              The work you repeat,
              <br />ready to hand over.
            </h2>
            <p>
              See a task and the context behind it.
              <br />
              Decide what to work on next.
            </p>
          </div>
          <div className="preview-window">
            <div className="preview-top">
              <span className="wordmark">offload</span>
              <span>Suggested for you</span>
              <span className="ascii-small">[ EXAMPLE WORKSPACE ]</span>
            </div>
            <div className="preview-content">
              <div className="preview-message">
                <ThinkingOrb state="composing" size={64} />
                <h3>
                  The Friday update,
                  <br />
                  ready for a draft.
                </h3>
                <p>
                  You have prepared it four times this month.
                  <br />
                  Keep the instructions for the next one.
                </p>
                <Link to="/app" className="text-link">
                  See your workspace <ArrowRight size={16} />
                </Link>
              </div>
              <div className="preview-suggestions">
                {[
                  [
                    "Prepare the Friday update",
                    "The same routine, four Fridays in a row.",
                  ],
                  [
                    "Collect the open decisions",
                    "Details from your latest work session.",
                  ],
                  [
                    "Draft the promised follow-up",
                    "A commitment that has not made the task list.",
                  ],
                  [
                    "Check the release handoff",
                    "The checklist your team used last time.",
                  ],
                ].map(([t, d]) => (
                  <Link to="/app" className="preview-row" key={t}>
                    <div>
                      <strong>{t}</strong>
                      <p>{d}</p>
                    </div>
                    <span className="ascii-row-arrow" aria-hidden="true">↗</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>
        <MemoryDiagram />
        <section className="site-story" id="control">
          <div>
            <p className="eyebrow">Your permissions</p>
            <h2>
              Choose what
              <br />
              Offload can access.
            </h2>
          </div>
          <div className="story-details">
            <article>
              <h3>Start and stop recording</h3>
              <p>
                Choose a microphone or screen session. Stop it when you finish.
                Ask everyone in the conversation before recording.
              </p>
            </article>
            <article>
              <h3>Review before sending</h3>
              <p>
                Review a routine before you enable it. Read each draft before you send it.
              </p>
            </article>
          </div>
        </section>
        <section className="faq">
          <h2>Before you start</h2>
          {[
            [
              "Does this connect to my real accounts?",
              "You can use your ChatGPT account through Codex on this Mac. Other app connections can be added now, but their account authorization is not connected yet.",
            ],
            [
              "Where does my work go?",
              "Offload saves your workspace in this browser. Export or delete it in Settings. If you run the optional local server, it saves to your computer.",
            ],
            [
              "Can I use it on my computer?",
              "Yes. Run the app in your browser, install it as a web app, or use the included desktop wrapper. The source repository includes setup instructions.",
            ],
            [
              "Does it listen all the time?",
              "No. A microphone session starts only after you choose it and grant permission. The current build records locally. Automatic transcription is not connected.",
            ],
          ].map(([q, a]) => (
            <details key={q}>
              <summary>
                {q}
                <Plus size={18} />
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </section>
        <section className="site-close">
          <pre className="ascii-horizon" aria-hidden="true">{"          .        +        .\n      .   :   .    :    .   :   .\n  . : . : + : . : + : . : + : . : .\n------[ ready for the morning ]------"}</pre>
          <h2>
            Have a task for
            <br />
            <em>tomorrow morning?</em>
          </h2>
          <Link to="/app" className="button">
            Open Offload <ArrowUpRight size={17} />
          </Link>
        </section>
      </main>
      <footer>
        <span className="wordmark">offload</span>
        <span>Your work stays on this device.</span>
        <Link to="/app/settings">Privacy & local data</Link>
      </footer>
    </div>
  );
}
