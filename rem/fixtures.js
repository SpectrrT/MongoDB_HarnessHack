import { buildWorkspace, personEmail } from "./world.js";

const [maya, ravi, jin, sam] = ["Maya", "Ravi", "Jin", "Sam"].map(personEmail);
const team = [maya, ravi, jin, sam];
const checklist = [
  ["Changelog updated", "Jin"],
  ["Rollback plan reviewed", "Ravi"],
];

// The user's world: seven weeks of Offload team notes. Simulated day d works week W(34 + d).
export const LIVE_WORKSPACE = buildWorkspace({
  name: "offload-live",
  customers: ["Acme Corp", "Globex Inc", "Soylent Systems"],
  teamThread: [...team, "partner@acme-corp.example"],
  releaseCc: ["qa@vendorco.example"],
  weeks: [
    {
      week: "W33",
      shipped: [["Search filters v1", "Jin"]],
      opened: [["Billing webhook retries failing", "Sam"]],
      decisions: [["Release day", "Thursday"]],
      noise: ["Welcome Jin to the team"],
    },
    {
      week: "W34",
      shipped: [
        ["Search filters v2", "Jin"],
        ["Invoice PDF export", "Maya", "Acme Corp"],
      ],
      opened: [["Staging database nearly full", "Ravi"]],
      decisions: [["Release day", "Thursday"]],
      actions: [["Webhook retry backoff", "Sam"]],
      noise: ["Team lunch moved to Friday"],
      checklist,
      agenda: ["Sunset the legacy importer?", "Price the audit log add-on?"],
      promises: [
        {
          subject: "Pricing deck",
          with: ["partner@acme-corp.example"],
          ask: "Could you send the updated pricing deck?",
          text: "I'll send the updated pricing deck by Friday.",
          item: "updated pricing deck",
        },
      ],
    },
    {
      week: "W35",
      shipped: [["Export to CSV fix", "Maya", "Acme Corp"]],
      resolved: ["Staging database nearly full"],
      opened: [["Flaky login test on CI", "Ravi"]],
      decisions: [["Design review", "every other Monday"]],
      actions: [["Draft migration guide", "Ravi"]],
      noise: ["Offsite survey closes Friday"],
      checklist: [...checklist, ["Migration guide linked", "Ravi"]],
      agenda: ["Sunset the legacy importer?", "Move design review to Mondays?"],
      promises: [
        {
          subject: "Migration timeline",
          with: [jin],
          ask: "When will the migration timeline be ready?",
          text: "I'll share the migration timeline by Wednesday.",
          item: "migration timeline",
        },
      ],
    },
    {
      week: "W36",
      shipped: [
        ["Faster dashboard load", "Jin"],
        ["SSO rollout", "Sam", "Globex Inc"],
      ],
      resolved: ["Flaky login test on CI"],
      opened: [["Data retention policy review", null]],
      decisions: [["Release day", "Tuesday"]],
      actions: [["Dashboard caching", "Jin"]],
      noise: ["New coffee machine on the 4th floor"],
      checklist: [...checklist, ["Feature flags cleaned up", "Jin"]],
      agenda: ["Price the audit log add-on?", "Hire a second SRE?"],
    },
    {
      week: "W37",
      shipped: [["Billing webhook retries fix", "Sam"]],
      resolved: ["Billing webhook retries failing"],
      opened: [["Vendor contract renewal", null]],
      actions: [["Update pricing page", "Maya", "Soylent Systems"]],
      noise: ["Parking garage closed Tuesday"],
      checklist: [...checklist, ["Pricing page QA", "Maya"]],
      agenda: ["Hire a second SRE?", "Retire the v1 API?"],
      promises: [
        {
          subject: "Pricing page copy",
          with: [maya],
          ask: "Can you send me the pricing page copy?",
          text: "I'll send you the pricing page copy tomorrow.",
          item: "pricing page copy",
        },
      ],
    },
    {
      week: "W38",
      shipped: [["Audit log export", "Ravi", "Globex Inc"]],
      resolved: ["Data retention policy review"],
      opened: [["Mobile push delays", "Jin"]],
      decisions: [["Design review", "weekly on Mondays"]],
      actions: [["Push retry queue", "Jin"]],
      noise: ["Offsite photos are in the shared folder"],
      checklist,
      agenda: ["Retire the v1 API?", "Launch the partner portal?"],
      review: { attendees: [...team, "guest@northwind.example"] },
    },
    {
      week: "W39",
      shipped: [
        ["Pricing page refresh", "Maya"],
        ["Push notification fix", "Jin"],
      ],
      resolved: ["Mobile push delays", "Vendor contract renewal"],
      opened: [["SOC 2 evidence collection", "Ravi"]],
      decisions: [["Release day", "Tuesday"]],
      actions: [["SOC 2 kickoff", "Ravi"]],
      noise: ["Holiday party planning starts next week"],
      checklist,
      agenda: ["Launch the partner portal?"],
      promises: [
        {
          subject: "Offsite photos",
          with: [ravi],
          ask: "Do you have the rest of the offsite photos?",
          text: "I'll upload the rest of the offsite photos tonight.",
          item: "offsite photos",
        },
      ],
    },
  ],
  files: [
    ["draft-q2-roadmap", "Draft: Q2 roadmap (old)", "Drafts", "W28", true],
    ["draft-onboarding", "Draft: onboarding email v1", "Drafts", "W29", true],
    ["draft-pricing-faq", "Draft: pricing FAQ", "Drafts", "W30", true],
    ["draft-offsite", "Draft: offsite agenda", "Drafts", "W31", true],
    ["draft-w36-brief", "Draft: W36 brief", "Drafts", "W36", false],
    ["doc-drafting-guide", "Drafting guidelines", "Docs", "W20", false],
    ["doc-contract", "Customer contract (draft reviewed)", "Docs", "W33", false],
  ].map(([id, title, folder, week, stale]) => ({
    id,
    title,
    folder,
    week,
    author: sam,
    body: `${title}.`,
    stale,
  })),
});

export const LIVE_SCHEDULE = Object.freeze([
  { day: 1, week: "W35", tasks: ["weekly-brief", "standup", "blockers", "follow-ups"] },
  { day: 2, week: "W36", tasks: ["weekly-brief", "standup", "recap"] },
  { day: 3, week: "W37", tasks: ["weekly-brief", "standup", "cleanup-drafts", "release-handoff"] },
  { day: 4, week: "W38", tasks: ["weekly-brief", "standup", "review-prep", "recap"] },
  { day: 5, week: "W39", tasks: ["weekly-brief", "standup", "blockers", "follow-ups"] },
]);

// The human did the W34 brief by hand once: raw material for the night's Distill phase.
export const DEMONSTRATION = Object.freeze({
  demoId: "demo-weekly-brief-w34",
  taskKind: "weekly-brief",
  week: "W34",
  note: "I send the weekly brief to the four of us only, and I keep customer names out of it.",
  steps: [
    { tool: "drive.list", args: { folder: "Notes", week: "W34" } },
    { tool: "drive.read", args: { id: "notes-w34" } },
    { tool: "drive.list", args: { folder: "Ops", week: "W33" } },
    { tool: "drive.read", args: { id: "ops-w33" } },
    {
      tool: "gmail.send",
      args: { to: team, subject: "Weekly brief — W34", body: "Shipped, open blockers and decisions for W34." },
    },
  ],
});
