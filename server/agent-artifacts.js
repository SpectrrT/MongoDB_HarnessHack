import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const allowed=new Set(['.png','.jpg','.jpeg','.webp','.gif','.txt','.md','.csv','.json','.pdf','.html','.svg','.js','.py','.zip','.xlsx','.docx','.pptx']);

// Read only a generated artifact in this job's workspace; callers serve these verified bytes.
export async function resolveGeneratedArtifact(cwd,relativePath,since){
 const maximum=20*1024*1024,modifiedSince=since instanceof Date?since.getTime():since;
 if(typeof relativePath!=='string'||!relativePath||relativePath.length>2048||/[\\\x00-\x1f\x7f]/.test(relativePath)||path.isAbsolute(relativePath)||!Number.isFinite(modifiedSince)||modifiedSince<0)return null;
 const segments=relativePath.split('/');
 if(path.posix.normalize(relativePath)!==relativePath||segments.some(segment=>!segment||segment==='.'||segment==='..'))return null;
 const queryReports=segments[0]==='.data'&&segments[1]==='query-demo'&&segments.length>2;
 const sensitive=/(credential|secret|token|password|private[_. -]?key|api[_. -]?key|(?:^|[._-])(?:env|environment)(?:[._-]|$))/i;
 if(segments.some((segment,index)=>sensitive.test(segment)||['node_modules','vendor'].includes(segment.toLowerCase())||(segment.startsWith('.')&&!(queryReports&&index===0))))return null;
 if(!allowed.has(path.extname(relativePath).toLowerCase()))return null;
 let handle;
 try{
  if(!(await fs.lstat(cwd)).isDirectory())return null;
  const root=await fs.realpath(cwd),file=path.resolve(root,relativePath);
  if(!file.startsWith(root+path.sep))return null;
  let currentPath=root,stat;
  for(let index=0;index<segments.length;index++){
   currentPath=path.join(currentPath,segments[index]);stat=await fs.lstat(currentPath);
   if(stat.isSymbolicLink()||(index<segments.length-1&&!stat.isDirectory()))return null;
  }
  const acceptable=value=>value.isFile()&&value.nlink===1&&value.mtimeMs>=modifiedSince&&value.size<=maximum;
  if(!acceptable(stat)||await fs.realpath(file)!==file)return null;
  handle=await fs.open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
  const current=await handle.stat();
  if(!acceptable(current)||current.dev!==stat.dev||current.ino!==stat.ino)return null;
  // Bound allocation even if another process is extending the file during this request.
  const data=Buffer.alloc(current.size);let offset=0;
  while(offset<data.length){const {bytesRead}=await handle.read(data,offset,data.length-offset,offset);if(!bytesRead)return null;offset+=bytesRead;}
  const final=await handle.stat();
  if(!acceptable(final)||final.size!==current.size||final.mtimeMs!==current.mtimeMs||await fs.realpath(file)!==file)return null;
  return {name:relativePath,size:data.length,data,image:/\.(png|jpe?g|webp|gif)$/i.test(relativePath)};
 }catch{return null;}finally{if(handle)await handle.close();}
}

export async function collectArtifacts(cwd,destination,since){
 const root=await fs.realpath(cwd),out=[];await fs.mkdir(destination,{recursive:true,mode:0o700});let inspected=0;
 const walk=async(dir,depth=0)=>{for(const entry of await fs.readdir(dir,{withFileTypes:true})){if(++inspected>3000||out.length>=24)return;if(entry.name.startsWith('.')||['node_modules','vendor'].includes(entry.name))continue;const file=path.join(dir,entry.name);if(entry.isDirectory()&&depth<3){await walk(file,depth+1);continue;}if(!entry.isFile()||!allowed.has(path.extname(file).toLowerCase())||/(credential|secret|token|password|private.?key)/i.test(entry.name))continue;const real=await fs.realpath(file);if(!real.startsWith(root+path.sep))continue;const stat=await fs.stat(real);if(stat.nlink>1||stat.mtimeMs<since||stat.size>20*1024*1024)continue;const handle=await fs.open(real,constants.O_RDONLY|constants.O_NOFOLLOW);try{const current=await handle.stat();if(!current.isFile()||current.ino!==stat.ino||current.size>20*1024*1024)continue;const data=await handle.readFile();if(data.length>20*1024*1024)continue;const id=crypto.randomUUID();await fs.writeFile(path.join(destination,id),data,{mode:0o600});out.push({id,name:path.relative(root,real),size:data.length,image:/\.(png|jpe?g|webp|gif)$/i.test(file)});}finally{await handle.close();}}};
 await walk(root);return out;
}
