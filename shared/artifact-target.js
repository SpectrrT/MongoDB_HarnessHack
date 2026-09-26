// Resolve answer links only inside the completed run's workspace or artifact manifest.
const fileExtension=/\.(?:png|jpe?g|webp|gif|txt|md|csv|json|pdf|html|svg|js|py|zip|xlsx|docx|pptx)$/i;
export function artifactTarget(href,agent){
 if(!href||!agent?.jobId||/^(?:https?:|mailto:|tel:|#|\/\/)/i.test(href))return null;
 let value=href.split(/[?#]/,1)[0];
 try{if(/^file:/i.test(value)){const url=new URL(value);if(url.hostname&&url.hostname!=='localhost')return null;value=url.pathname;}value=decodeURIComponent(value);}catch{return null;}
 if(value.includes('\0')||value.includes('\\')||!fileExtension.test(value))return null;
 const files=agent.artifacts||[];
 if(value.startsWith('sandbox:/mnt/data/')){
  const name=value.slice('sandbox:/mnt/data/'.length),match=files.find(file=>file.name===name);
  return match?{path:match.name,name:match.name.split('/').at(-1),artifactId:match.id}:null;
 }
 const cwd=String(agent.cwd||'').replace(/\/$/,'');
 if(value.startsWith('/')){
  if(cwd&&value.startsWith(cwd+'/'))value=value.slice(cwd.length+1);
  else {
   // Models sometimes shorten the opaque owner segment in an absolute link.
   // Recover only the same managed conversation; the server still reads this job's cwd.
   const workspace=cwd.match(/^(.*\/\.offload\/workspaces\/)[^/]+\/([^/]+)$/);
   if(!workspace||!value.startsWith(workspace[1]))return null;
   const parts=value.slice(workspace[1].length).split('/');
   if(parts[1]!==workspace[2])return null;
   value=parts.slice(2).join('/');
  }
 }
 const segments=value.split('/').filter(part=>part!=='.'&&part!=='');
 if(!segments.length||segments.includes('..')||segments.some(part=>/(?:^\.env(?:\.|$)|credential|secret|token|password|private.?key)/i.test(part)))return null;
 const relative=segments.join('/'),match=files.find(file=>file.name===relative);
 return {path:relative,name:segments.at(-1),...(match?{artifactId:match.id}:{})};
}
