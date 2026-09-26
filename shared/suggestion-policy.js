import { z } from 'zod';
export const suggestionPolicySchema = z.object({
  minSupport: z.number().int().min(2).max(5).default(2),
  cooldownHours: z.number().int().min(1).max(168).default(24),
  maxCards: z.number().int().min(1).max(3).default(3),
  evidenceLimit: z.number().int().min(4).max(30).default(20),
}).strict();
export const DEFAULT_SUGGESTIONS = suggestionPolicySchema.parse({});
export const suggestionSettings = policy => suggestionPolicySchema.parse(policy?.context?.suggestions || {});

// Hard eligibility rules are outside the policy the proposer can edit.
export function eligibleOpportunity(features, settings) {
  return features.kind === 'recover-context' && features.trigger === 'project-reopened'
    && features.sourceCount > 0 && features.sameProject === true && features.active === true
    && !features.completed && !features.muted && !features.snoozed
    && features.independentSessions >= settings.minSupport && features.independentDays >= 2
    && features.hoursSinceDecision >= settings.cooldownHours;
}
