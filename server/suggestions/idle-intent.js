// User control commands are derived from authored conversation text, never assistant output.
// Normalization is for matching only. Provenance retains the original source text.
export const normalizeIdleText=text=>String(text).replace(/[’‘]/g,"'").replace(/\s+/g,' ').trim();
const LEAD="(?:(?:okay|ok|alright|now)[,!]?\\s+)?(?:please\\s+)?(?:(?:let's|let us|can you|could you|would you|i want you to|we should|we need to)\\s+)?";
const boundary="(?=$|[,.!?;:]|\\s+(?:and|then|for|until|while|so|before|after)\\b)";
const work="(?:(?:all|any|the|this|that|our|your)\\s+)?(?:work|working|implementation|coding|development|execution|tasks?|changes|building|doing)(?:\\s+(?:on\\s+)?(?:this|that|it))?";
const PAUSE=new RegExp('^'+LEAD+'(?:stop|pause|halt)(?:\\s+(?:here|now|this|that|it|'+work+'))?'+boundary,'i');
const HOLD=new RegExp('^'+LEAD+'hold (?:off|on)(?:\\s+(?:on\\s+)?'+work+')?'+boundary,'i');
const NEGATIVE_CONTINUE=new RegExp('^'+LEAD+"(?:do not|don't)\\s+(?:continue|resume|proceed)(?:\\s+(?:yet|now|"+work+"))?"+boundary,'i');
const CANCEL=new RegExp('^'+LEAD+"(?:cancel(?:\\s+(?:this|that|it|the task|this task|the work|this work))?|never\\s?mind|forget it|leave it|(?:i\\s+)?(?:don't|do not) (?:want|need) (?:that|this)(?: anymore)?)"+boundary,'i');
const RESUME=new RegExp('^'+LEAD+'(?:(?:everyone\\s+)?(?:continue|resume|proceed)|keep (?:going|working)|go ahead(?: and (?:continue|resume))?|(?:do not|don\'t) (?:stop|pause))\\b','i');
const NEW_WORK=new RegExp('^'+LEAD+'(?:(?:instead|next)[,:]?\\s+)?(?:build|create|make|implement|fix|debug|investigate|test|verify|compare|design|plan|draft|write|prototype|explore|research|solve|improve|optimi[sz]e)\\b\\s+\\S','i');
const STATUS=/\b(?:progress|status|assessment|what (?:everyone|we|you) (?:has|have|did)|what (?:is|was|has been) done)\b/i;

export function idleControlIntent(text){
 const input=normalizeIdleText(text);
 if(!input||/^["'`>❯<]/.test(input))return null;
 if(CANCEL.test(input))return 'cancel';
 if(PAUSE.test(input)||HOLD.test(input)||NEGATIVE_CONTINUE.test(input)||/^(?:that's enough|no more work|not now)(?=$|[.!?,;]|\s+and\b)/i.test(input))return 'pause';
 if(RESUME.test(input)){
  if(/\b(?:continue|resume|proceed)(?:\s+with)?\s+(?:the\s+)?(?:review|assessment|evaluation|status|progress|discussion|summary|explaining|describing)\b/i.test(input))return null;
  // A conditional future continuation is not evidence that its condition has happened.
  if(/\b(?:if|when|after|once|unless|until)\b/i.test(input))return null;
  return 'resume';
 }
 return null;
}

export function hasExplicitNewWork(text){
 const input=normalizeIdleText(text);
 return NEW_WORK.test(input)&&!STATUS.test(input);
}

export function idleControlState(users,isDone=()=>false){
 let closedAt=-1,pause=null,resume=null,replacement=null;const controls=[];
 for(const message of users){
  const intent=idleControlIntent(message.text);
  if(isDone(message.text)||intent==='cancel'){
   closedAt=message.index;pause=null;resume=null;replacement=null;controls.push(message);continue;
  }
  if(intent==='pause'){pause=message;resume=null;replacement=null;controls.push(message);continue;}
  if(intent==='resume'){
   controls.push(message);if(pause){resume=message;pause=null;}continue;
  }
  if(pause&&hasExplicitNewWork(message.text)){
   // A new concrete task replaces earlier paused objectives; it never revives them.
   closedAt=message.index-1;pause=null;resume=null;replacement=message;
  }
 }
 return {closedAt,pause,resume,replacement,controls};
}
