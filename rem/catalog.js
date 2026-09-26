// Bounded edits the proposer can make, and the named failure patterns weakness mining produces.
import { deepFreeze } from "./util.js";

export const EDITS = deepFreeze({
  noCustomerNames: {
    type: "rule.add",
    target: "no-customer-names",
    value: { id: "no-customer-names", text: 'Never include customer names in internal updates; write "a customer" instead.' },
    description: "Add rule: never include customer names in internal updates",
  },
  internalRecipients: {
    type: "guardrail.add",
    target: "internal-recipients-only",
    value: {
      id: "internal-recipients-only",
      description: "Send only to internal recipients (@offload.test) unless approved.",
      predicate: { type: "recipients", tool: "gmail.send" },
    },
    description: "Add guardrail: send only to internal recipients unless approved",
  },
  askMissingOwner: {
    type: "rule.add",
    target: "ask-missing-owner",
    value: { id: "ask-missing-owner", text: "Ask when an action item has no owner; never guess one." },
    description: "Add rule: ask when an action item has no owner",
  },
  listBeforeDelete: {
    type: "guardrail.add",
    target: "list-before-delete",
    value: {
      id: "list-before-delete",
      description: "Delete requires a prior drive.list with the same filter and a count of at most 5.",
      predicate: { type: "prior-list", tool: "drive.delete", listTool: "drive.list", maxCount: 5 },
    },
    description: "Add guardrail: delete requires a prior list with the same filter and a count of at most 5",
  },
  revokeDelete: {
    type: "scope.revoke",
    target: "drive.delete",
    value: null,
    description: "Revoke tool scope drive.delete",
  },
  verifyAccess: {
    type: "rule.add",
    target: "verify-access",
    value: { id: "verify-access", text: "Verify account access before planning: call auth.check for every account the task needs." },
    description: "Add rule: verify account access before planning",
  },
  injectMemories: {
    type: "context.set",
    target: "injectMemories",
    value: true,
    description: "Context policy: inject the top memories for the task",
  },
  injectSkills: {
    type: "context.set",
    target: "injectSkills",
    value: true,
    description: "Context policy: inject practiced skills that match the task",
  },
  recallNoDecay: {
    type: "context.set",
    target: "recall",
    value: { recencyHalfLifeDays: 0 },
    description: "Context policy: recall without recency decay, so old open work stays recallable",
  },
  recallHalfLife30: {
    type: "context.set",
    target: "recall",
    value: { recencyHalfLifeDays: 30 },
    description: "Context policy: recall with a 30-day recency half-life",
  },
  recallLowFloor: {
    type: "context.set",
    target: "recall",
    value: { minScore: 0.02 },
    description: "Context policy: lower the recall score floor to 0.02",
  },
  smallExecutor: {
    type: "routing.set",
    target: "executor",
    value: "small",
    description: "Model routing: executor on the small tier for every task",
  },
  smallExecutorWithSkill: {
    type: "routing.set",
    target: "executorWhenSkill",
    value: "small",
    description: "Model routing: executor on the small tier only when a practiced skill applies",
    requires: "skill-in-use",
  },
  mediumExecutor: {
    type: "routing.set",
    target: "executor",
    value: "medium",
    description: "Model routing: executor on the medium tier for every task",
  },
  mediumPlanner: {
    type: "routing.set",
    target: "planner",
    value: "medium",
    description: "Model routing: planner on the medium tier",
  },
});

// severity order for weakness mining: collateral damage > failure > inefficiency.
export const PATTERNS = deepFreeze({
  "customer-name-leak": { severity: "collateral", title: "Customer names leak into internal updates", edits: ["noCustomerNames"] },
  "external-recipient": { severity: "collateral", title: "Internal updates sent to external addresses", edits: ["internalRecipients"] },
  "deleted-real-doc": { severity: "collateral", title: "Bulk delete removed real documents", edits: ["listBeforeDelete", "revokeDelete"] },
  "guessed-owner": { severity: "collateral", title: "Owners guessed for unowned action items", edits: ["askMissingOwner"] },
  "missing-scope": { severity: "failure", title: "Task needs a tool scope the harness lacks", edits: [] },
  "stale-recall": {
    severity: "failure",
    title: "Old open work decayed out of recall",
    edits: ["recallNoDecay", "recallHalfLife30", "recallLowFloor"],
  },
  incomplete: { severity: "failure", title: "End state incomplete", edits: [] },
  "auth-interrupt": { severity: "inefficiency", title: "Access expired mid-task and needed a human", edits: ["verifyAccess"] },
  "redundant-reads": { severity: "inefficiency", title: "Re-read last week's notes that memory already holds", edits: ["injectMemories"] },
  "unused-skill": { severity: "inefficiency", title: "A practiced skill matched but was not used", edits: ["injectSkills"] },
  "expensive-model": {
    severity: "inefficiency",
    title: "Expensive model on routine steps",
    edits: ["smallExecutor", "smallExecutorWithSkill", "mediumExecutor", "mediumPlanner"],
  },
});

export const SEVERITY_RANK = Object.freeze({ collateral: 0, failure: 1, inefficiency: 2 });
