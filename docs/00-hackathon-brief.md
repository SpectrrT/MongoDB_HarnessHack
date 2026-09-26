# Hackathon brief — MongoDB "The Harness Engineering & Model Wrangling Hackathon" (NYC)

Facts as of Friday Sep 25, 2026, ~9 PM ET, from the Cerebral Valley event page, the participant guide, the host text
blasts, and the partner resource guide.

## Event logistics

- Hosts: MongoDB with Cerebral Valley. Event page: https://cerebralvalley.ai/e/mongodb-nyc-hackathon ·
  Participant guide: https://cerebralvalley.ai/e/mongodb-nyc-hackathon/details ·
  Resource guide: https://cv.inc/s/B2CnJef (redirects to a Google Doc) · Discord: https://cv.inc/s/ceUNiHL ·
  Contact: ajc@cerebralvalley.ai (Alex).
- Venue: The Malin Chelsea, 220 W 26th St, New York, NY 10001. **Use the "By The Malin" entrance at 220 W 26th St** — the
  regular Malin entrance is not open for the hackathon.
- Weather: a nor'easter with high winds and heavy rain is forecast; the event proceeds regardless. Bring rain gear.
- Registration is closed; all attendees had to be approved on the Cerebral Valley platform (used for partner resource access).
- Wi-Fi and venue access details are shared on the day.

## Schedule — Saturday, September 26

- 9:00 AM Doors open · breakfast · team formation
- 10:00 AM Welcome kick-off
- **10:30 AM Hacking begins** (partner credit codes are emailed to checked-in participants from 10:30)
- 1:00 PM Lunch
- **5:00 PM Submissions due**
- 5:15–6:45 PM First-round judging (teams assigned to judging groups in different rooms)
- 6:00 PM Dinner
- 7:00 PM Top-6 demos on stage · closing remarks
- 9:00 PM Doors close (event listed until 10 PM)

## Wednesday, September 30 — MongoDB.local NYC (Pier 36)

- Finalists must be available. At least one team member present from **10:00 AM ET** to demo in Cerebral Valley's showcase
  area and collect attendee votes (one vote per attendee). If a finalist can't attend, a backup team is selected.
- 3:30 PM Final three notified · 4:15 PM judges arrive · **4:30–5:00 PM main-stage presentations**: 3 minutes to present,
  3 minutes Q&A, in front of the VIP judging panel and audience.
- If selected as a finalist, one person must **record a demo on-site on Sep 26** for display at .local.

## Problem statements (build in at least one)

- **Statement One: Recursive Harnessing** — "Build a self-improving agent harness that automatically evolves its own
  architecture: updating rules, context policies, guardrails, tool access, and more. How can agents dynamically adapt their
  entire environment to fit a specific user, task, or use case?"
- **Statement Two: Long Horizon Engineering** — "The highest-value agentic work spans hours, days, or weeks. Build a harness
  that sustains coherent memory across billions of tokens in one session, relentlessly optimizes toward long-term goals, and
  learns from hard metric signals to complete traditionally difficult tasks."
- Framing from the resource guide: "harness engineering: building the systems around a model (rules, context policies,
  guardrails, tool access and memory) that let agents adapt to a task, sustain work over long horizons and act on real data."
- Event copy: "We're looking for impactful projects built with MongoDB Atlas, Vector Search, and Agentic Memory tooling.
  Whether you're building agents that rewrite their own guardrails, systems that hold context across weeks-long tasks, or
  entirely new approaches to persistent agent memory…"

## Rules

- Finalists must have built their project on the **MongoDB Atlas Sandbox** provided for the hackathon (link emailed);
  projects not built in the sandbox cluster are ineligible for final judging and prizes.
- Repositories must be **public**.
- Max **four** team members; solo allowed.
- **Demo requirements:** the demo must only highlight the specific features, code, and functionality built during the
  hackathon; judges must be able to clearly identify what was created during the event. Failure to do so = immediate
  disqualification.
- **New work only:** you may not present an existing project as your own work.
- Banned: projects that violate legal/ethical/platform policies, or use code, data, or assets you do not have rights to.
- Submission form requires a **short one-minute demo video** highlighting what was built. Double-check the repo is public,
  the demo link is accessible, and all team members are added.

## Anti-projects — STRICTLY NO

AI mental health advisor · basic RAG applications · Streamlit applications · image analyzers · "AI for education" chatbot ·
AI job application screener · AI nutrition coach · personality analyzers · anything using AI to generate medical advice ·
**any project where a dashboard is the main feature** · sports analyzers or coaches.

## Judging

Three rounds; must participate in all three; MongoDB Atlas must be a core component.

- **Round 1 (Sep 26), general vote:** ~3-minute live demo + 1–2 minutes Q&A per team, in judging rooms. Criteria:
  - Technical Demo (35%): "How is the actual demo of the project? Does it impress you? Is it well-engineered and working?"
  - Implementation Difficulty (30%): "How hard is this project to recreate? Is the technical depth more than a few AI prompts away?"
  - Creativity (15%): "How creative is the project? Is this something you have never seen before?"
  - Impact Potential (20%): "Does the project address a significant real-world issue or pain point?"
  - Six finalists selected; they demo on stage to attendees after selection.
- **Round 2 (Sep 30), community vote** at MongoDB.local NYC → top three.
- **Final round (Sep 30), main stage:** VIP judges pick 1st/2nd/3rd on the same four criteria.
- "Show us what you have built to solve our problem statements. Please do not show us a presentation. We'll be checking to
  ensure your project was built entirely during the event; no previous work is allowed."

## Prizes

1st $7,000 · 2nd $5,000 · 3rd $3,000 (USD, from MongoDB). "More prizes will be announced."

## Judges (announced)

- Joseph Morais — Principal Evangelist, MongoDB
- Louis Vichy — Co-Founder, OpenRouter
- Brooke Jamieson — Sr. Developer Advocate, AWS
- Vin Sachidananda — Partner, Radical Ventures
- Dan Zakon — Director of Engineering, Tenex
- Andrey Sibirev — Sr. Director of Engineering (Compute), Vercel

## Partner resources and credits (from the resource guide)

**MongoDB**
- Recommended starting point: MongoDB Agent Skills (install set for AI coding assistants), MongoDB MCP Server (connect AI
  assistants to live MongoDB), natural-language-to-MongoDB-query prompting guidance.
- Developer tools: Atlas Managed MCP Server (hosted, uses Atlas service accounts); Frontier Marketplace Connectors (native
  Atlas access in ChatGPT, Claude, Gemini, Grok Build, Devin, Cursor).
- Data & search: sample movie dataset; data-modeling docs; Vector Search; Atlas Search (keyword with typo tolerance);
  **Automated Embeddings** (built-in vector embedding generation); **Embedding and Reranking API** (single endpoint).
- Memory & agents: "Building an Agent with Memory and Function Calling"; "Adding Memory to a Chat Application" (Python and
  JavaScript, LangChain + Atlas).
- State: "Build an AI Agent with LangGraph and MongoDB Atlas" (thread-specific checkpoints); "State & Persistence: The
  Problem of Agent Reliability."
- Context & retrieval: "Build AI Agents with MongoDB" (external tools/APIs); GraphRAG with MongoDB and LangChain.
- Starter code: GenAI Showcase (multi-framework examples); MongoDB + Python quickstart; MERN starter.
- Post-hackathon: MongoDB for Startups (Atlas credits, Voyage AI tokens, support).

**OpenRouter** — one API key for 500+ models; free hackathon credits; code emailed to checked-in participants from 10:30 AM.

**Voyage AI** — embedding models and rerankers; **200 million free tokens**. Setup: create account (email signup), generate
API key (Organization > API Keys), add a payment method to unlock Tier 1 rate limits (no charge within the free allowance);
`pip install voyageai`; quickstart covers embedding, vector search, reranking; usage dashboard; on-site Voyage team for
top-ups and questions.

**Vercel** — $30 v0 credits (sign in at v0.app → profile picture → Credits → Redeem Code; code emailed 10:30 AM);
AI SDK (ai-sdk.dev) as an agent harness layer (agent loops, tool calling, streaming); AI Gateway; one-click public URLs.

**LangChain** — $50 LangSmith credits + Deployments access (redeem via form within 10 days; card required, not charged);
LangGraph docs; Deep Agents quickstart.

**AWS Kiro** — AI coding suite (IDE, CLI, Crew); free tier 50 credits/month + 500-credit new-user bonus (30 days); signup via
Google/GitHub/AWS Builder ID, no card.

**OpenAI** — 1,250 Codex credits; code emailed to checked-in participants from 10:30 AM.

**ElevenLabs** — one month Creator plan; redeem via the event Discord bot after check-in; hacker guide provided.
