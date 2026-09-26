// Labels describe the tool request; completion always comes from runtime events.
export function toolPresentation(event){
 let item={};try{item=JSON.parse(event.detail||'{}');}catch{}
 const tool=String(item.tool||event.tool||event.label||''),args=item.arguments||{},text=JSON.stringify(args);
 let label,service;
 if(/gmail[._]/i.test(tool)){service='gmail';label=/search/i.test(tool)?'Search email':/read/i.test(tool)?'Read email':'Use Gmail';}
 else if(/calendar[._]/i.test(tool)){service='calendar';label='Check calendar';}
 else if(/google_drive[._]/i.test(tool)){service='drive';label='Check Google Drive';}
 else if(/github[._]/i.test(tool)){service='github';label='Check GitHub';}
 else if(/node_repl|cua|browser/i.test(item.server||event.server||'')||/browser/i.test(tool)){
  label=/gradescope\.com/i.test(text)?'Check Gradescope':/courseworks|instructure\.com/i.test(text)?'Check CourseWorks':/mail\.google\.com/i.test(text)?'Check email in Chrome':typeof (args.title||event.title)==='string'?(args.title||event.title).slice(0,80):'Use Chrome';
 }
 else label=({commandExecution:'Run command',fileChange:'Edit files',webSearch:'Search the web',mcpToolCall:'Use connected tool',imageGeneration:'Create image',imageView:'View image',toolCall:tool.replaceAll('_',' '),dynamicToolCall:'Use tool'})[event.type]||event.type;
 const failed=event.failed||event.status==='failed'||!!item.error||item.result?.isError;
 const working=['running','inProgress','pending'].includes(event.status);
 return {label,service,status:failed?'Failed':working?'Working':'Done',working:working&&!failed,detail:tool};
}
