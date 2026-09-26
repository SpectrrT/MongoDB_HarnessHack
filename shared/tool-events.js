// Labels describe the tool request; completion always comes from runtime events.
function commandTokens(command){
 const tokens=[];let value='',quote=null,started=false;
 const flush=()=>{if(started)tokens.push({value});value='';started=false;};
 for(let i=0;i<command.length;i++){
  const char=command[i];
  if(quote==="'"){if(char==="'")quote=null;else value+=char;continue;}
  if(char==='\\'&&quote!=="'"){
   const next=command[i+1];
   if(next===undefined)return [];
   if(!quote||['"','\\','$','`','\n'].includes(next)){if(next!=='\n')value+=next;i++;started=true;continue;}
  }
  if(quote==='"'){if(char==='"')quote=null;else value+=char;continue;}
  if(char==='"'||char==="'"){quote=char;started=true;continue;}
  if(/[;&|\n]/.test(char)){
   flush();let separator=char;
   if((char==='&'||char==='|')&&command[i+1]===char)separator+=command[++i];
   tokens.push({value:separator,separator:true});continue;
  }
  if(/\s/.test(char)){flush();continue;}
  value+=char;started=true;
 }
 if(quote)return []; // Incomplete shell text is not enough evidence to label an action.
 flush();return tokens;
}
function queryDemoPresentation(event,item,args,tool){
 const evidence=path=>/(?:^|\/)scripts\/query-demo\.mjs$/.test(path)||/(?:^|\/)(?:\.data|artifacts)\/query-demo\/[^/]+\/(?:report|(?:baseline|candidate)-(?:explain|results))\.json$/.test(path);
 const source=path=>/(?:^|\/)docs\/QUERY-DEMO\.md$/.test(path)?'Read query demo guide':/(?:^|\/)fixtures\/query-demo(?:\/|$)/.test(path)?'Read query demo fixtures':evidence(path)?'Inspect query evidence':null;
 if(tool==='read_file'){
  const label=source(String(args.path||''));
  return label?{label,service:'mongodb'}:null;
 }
 if(event.type!=='commandExecution'&&tool!=='run_command'&&tool!=='exec_command')return null;
 let command=String(item.command||args.command||args.cmd||event.label||'');
 // Match actual executable/argument positions, never strings in output or an echo.
 let words=commandTokens(command);
 if(/(?:^|\/)(?:ba|z)?sh$/.test(words[0]?.value||'')&&/^-[a-z]*c$/.test(words[1]?.value||'')&&words.length===3&&!words.some(word=>word.separator))words=commandTokens(words[2].value);
 const commands=[[]];for(const word of words){if(word.separator)commands.push([]);else commands.at(-1).push(word.value);}
 for(const [executable,script,...flags] of commands){
  if(/(?:^|\/)node$/.test(executable||'')&&/(?:^|\/)scripts\/query-demo\.mjs$/.test(script||'')){
   if(flags.includes('--candidate-index'))return {label:'Test candidate index',service:'mongodb'};
   if(flags.includes('--baseline'))return {label:'Measure baseline query plan',service:'mongodb'};
  }
 }
 for(const [executable,...paths] of commands){
  if(/(?:^|\/)jq$/.test(executable||'')){
   // Recognize the simple filter + file form; option values and filter strings are not files.
   if(paths.length>1&&!paths[0].startsWith('-')&&paths.slice(1).some(evidence))return {label:'Inspect query evidence',service:'mongodb'};
   continue;
  }
  if(!/(?:^|\/)(?:cat|head|tail|sed|rg)$/.test(executable||''))continue;
  const label=paths.map(source).find(Boolean);if(label)return {label,service:'mongodb'};
 }
 return null;
}
export function toolPresentation(event){
 let item={};try{item=JSON.parse(event.detail||'{}');}catch{}
 let supplied={};try{supplied=JSON.parse(event.arguments||'{}');}catch{}
 const tool=String(item.tool||event.tool||event.label||''),args=item.arguments||supplied,text=JSON.stringify(args);
 let label,service;
 const demo=queryDemoPresentation(event,item,args,tool);
 if(event.type==='contextCompaction'){
  const calls=event.decisionCalls??item.decisionCalls??item.call??0;
  const source=String(event.source||item.source||'');
  label=calls>0?(/jev/i.test(source)?'Using Jev for compaction':'Score context for compaction'):(event.cacheHits??item.cacheHits??0)>0?'Apply cached compaction decisions':'Compact conversation';
 }
 else if(demo){({label,service}=demo);}
 else if(/gmail[._]/i.test(tool)){service='gmail';label=/search/i.test(tool)?'Search email':/read/i.test(tool)?'Read email':'Use Gmail';}
 else if(/calendar[._]/i.test(tool)){service='calendar';label='Check calendar';}
 else if(/google_drive[._]/i.test(tool)){service='drive';label='Check Google Drive';}
 else if(/github[._]/i.test(tool)){service='github';label='Check GitHub';}
 else if(/node_repl|cua|browser/i.test(item.server||event.server||'')||/browser/i.test(tool)){
  label=/gradescope\.com/i.test(text)?'Check Gradescope':/courseworks|instructure\.com/i.test(text)?'Check CourseWorks':/mail\.google\.com/i.test(text)?'Check email in Chrome':typeof (args.title||event.title)==='string'?(args.title||event.title).slice(0,80):'Use Chrome';
 }
 else if(tool==='list_files')label='Look through files';
 else if(tool==='read_file')label='Read '+(args.path?.split('/').pop()||'file');
 else if(tool==='write_file')label='Save '+(args.path?.split('/').pop()||'file');
 else label=({commandExecution:'Run command',fileChange:'Edit files',webSearch:'Search the web',mcpToolCall:'Use connected tool',imageGeneration:'Create image',imageView:'View image',toolCall:tool.replaceAll('_',' '),dynamicToolCall:'Use tool'})[event.type]||event.type;
 const failed=event.failed||event.status==='failed'||!!item.error||item.result?.isError;
 const working=['running','inProgress','pending'].includes(event.status);
 return {label,service,status:failed?'Failed':working?'Working':'Done',working:working&&!failed,detail:tool};
}

export function activityGroups(events){
 const groups=[];
 for(const event of events.filter(e=>e.type!=='session'&&!(e.type==='contextCompaction'&&e.status==='under_budget'))){
  const view=toolPresentation(event),last=groups.at(-1);
  if(last&&last.view.label===view.label&&last.view.service===view.service&&last.view.status===view.status){last.events.push(event);}
  else groups.push({view,events:[event]});
 }
 return groups;
}

export function activityDetail(event){
 let item={},args={};try{item=JSON.parse(event.detail||'{}');}catch{}
 try{args=item.arguments||JSON.parse(event.arguments||'{}');}catch{}
 const lines=[];
 if(event.type==='contextCompaction'){
  if(Number.isFinite(item.decisionCalls)&&item.decisionCalls>0)lines.push(`${item.decisionCalls} scoring call${item.decisionCalls===1?'':'s'}`);
  if(Number.isFinite(item.cacheHits)&&item.cacheHits>0)lines.push(`${item.cacheHits} cached decision${item.cacheHits===1?'':'s'}`);
  if(Number.isFinite(item.archived))lines.push(`${item.archived} exchanges archived; exact sources remain recoverable`);
  if(item.status==='needs_review')lines.push('Context remains over budget; review required');
  if(item.errors?.length)lines.push(...item.errors.map(String));
 }
 if(args.query)lines.push('Search: '+String(args.query).slice(0,250));
 if(args.path)lines.push('File: '+String(args.path).slice(0,250));
 if(args.title)lines.push(String(args.title).slice(0,250));
 if(item.error?.message)lines.push(String(item.error.message).slice(0,350));
 if(event.type==='toolCall'&&event.output)lines.push(String(event.output).slice(0,600));
 return lines.length?lines:[toolPresentation(event).status];
}
