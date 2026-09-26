// Labels describe the tool request; completion always comes from runtime events.
export function toolPresentation(event){
 let item={};try{item=JSON.parse(event.detail||'{}');}catch{}
 let supplied={};try{supplied=JSON.parse(event.arguments||'{}');}catch{}
 const tool=String(item.tool||event.tool||event.label||''),args=item.arguments||supplied,text=JSON.stringify(args);
 let label,service;
 if(/gmail[._]/i.test(tool)){service='gmail';label=/search/i.test(tool)?'Search email':/read/i.test(tool)?'Read email':'Use Gmail';}
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
 for(const event of events.filter(e=>e.type!=='session')){
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
 if(args.query)lines.push('Search: '+String(args.query).slice(0,250));
 if(args.path)lines.push('File: '+String(args.path).slice(0,250));
 if(args.title)lines.push(String(args.title).slice(0,250));
 if(item.error?.message)lines.push(String(item.error.message).slice(0,350));
 if(event.type==='toolCall'&&event.output)lines.push(String(event.output).slice(0,600));
 return lines.length?lines:[toolPresentation(event).status];
}
