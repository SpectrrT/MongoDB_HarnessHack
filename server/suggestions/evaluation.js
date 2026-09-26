import { eligibleOpportunity } from '../../shared/suggestion-policy.js';
const base = { kind: 'recover-context', trigger: 'project-reopened', sourceCount: 4, sameProject: true,
  active: true, completed: false, muted: false, snoozed: false, independentSessions: 3, independentDays: 3, hoursSinceDecision: 200 };
// Immutable evaluator-only cases. The proposer receives train feedback, never these rows.
export const HELD_OUT_OPPORTUNITIES = Object.freeze([
  ...[3,4,5,8].map((support,i) => ({ id:`useful-${i}`, features:{...base,independentSessions:support}, useful:true })),
  {id:'two-real-sessions',features:{...base,independentSessions:2},useful:true},
  ...[26,30,40].map((hours,i)=>({id:`recent-dismissal-${i}`,features:{...base,hoursSinceDecision:hours},useful:false})),
  ...Object.entries({sourceCount:0,sameProject:false,active:false,completed:true,muted:true,snoozed:true,
    independentSessions:1,independentDays:1,trigger:'timer-tick',kind:'send-mail'}).map(([k,v])=>({id:`reject-${k}`,features:{...base,[k]:v},useful:false})),
].map(x=>Object.freeze({...x,features:Object.freeze(x.features)})));
export function evaluatePolicy(settings, cases) {
  const results=cases.map(c=>({id:c.id,expected:c.useful,proposed:eligibleOpportunity(c.features,settings)}));
  const tp=results.filter(r=>r.expected&&r.proposed).length, fp=results.filter(r=>!r.expected&&r.proposed).length;
  return {total:results.length,correct:results.filter(r=>r.expected===r.proposed).length,truePositives:tp,falsePositives:fp,
    falseNegatives:results.filter(r=>r.expected&&!r.proposed).length,precision:tp+fp?tp/(tp+fp):null,results};
}
export function comparePolicies(parent, candidate, cases) {
  const before=evaluatePolicy(parent,cases),after=evaluatePolicy(candidate,cases);
  const regressions=after.results.filter((r,i)=>before.results[i].expected===before.results[i].proposed&&r.expected!==r.proposed).map(r=>r.id);
  return {before,after,regressions,improved:after.correct>before.correct&&regressions.length===0};
}
// Data-only bounded edit, driven solely by observed repeated dismissals.
export function proposeSuggestionEdit(settings, feedback) {
  const dismissals=feedback.filter(f=>f.decision==='dismiss');
  if(dismissals.length<2||settings.cooldownHours>=168)return null;
  return {...settings,cooldownHours:Math.min(168,settings.cooldownHours*2)};
}
