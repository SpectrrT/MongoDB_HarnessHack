import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const allowed=new Set(['.png','.jpg','.jpeg','.webp','.gif','.txt','.md','.csv','.json','.pdf','.html','.svg','.js','.py','.zip','.xlsx','.docx','.pptx']);
export async function collectArtifacts(cwd,destination,since){
 const root=await fs.realpath(cwd),out=[];await fs.mkdir(destination,{recursive:true,mode:0o700});let inspected=0;
 const walk=async(dir,depth=0)=>{for(const entry of await fs.readdir(dir,{withFileTypes:true})){if(++inspected>3000||out.length>=24)return;if(entry.name.startsWith('.')||['node_modules','vendor'].includes(entry.name))continue;const file=path.join(dir,entry.name);if(entry.isDirectory()&&depth<3){await walk(file,depth+1);continue;}if(!entry.isFile()||!allowed.has(path.extname(file).toLowerCase())||/(credential|secret|token|password|private.?key)/i.test(entry.name))continue;const real=await fs.realpath(file);if(!real.startsWith(root+path.sep))continue;const stat=await fs.stat(real);if(stat.nlink>1||stat.mtimeMs<since||stat.size>20*1024*1024)continue;const handle=await fs.open(real,constants.O_RDONLY|constants.O_NOFOLLOW);try{const current=await handle.stat();if(!current.isFile()||current.ino!==stat.ino||current.size>20*1024*1024)continue;const data=await handle.readFile();if(data.length>20*1024*1024)continue;const id=crypto.randomUUID();await fs.writeFile(path.join(destination,id),data,{mode:0o600});out.push({id,name:path.relative(root,real),size:data.length,image:/\.(png|jpe?g|webp|gif)$/i.test(file)});}finally{await handle.close();}}};
 await walk(root);return out;
}
