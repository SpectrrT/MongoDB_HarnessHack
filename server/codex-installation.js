import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
export function findCodex({env=process.env,home=os.homedir(),platform=process.platform,executable=file=>{try{fs.accessSync(file,fs.constants.X_OK);return true;}catch{return false;}}}={}){
 if(env.OFFLOAD_CODEX_BIN)return env.OFFLOAD_CODEX_BIN;
 const names=platform==='win32'?['codex.exe','codex.cmd','codex']:['codex'];
 for(const dir of [...(env.PATH||'').split(path.delimiter),path.join(home,'.local','bin')])
  for(const name of names){const file=path.join(dir,name);if(dir&&executable(file))return file;}
 return 'codex';
}
export function inheritedAccess(config={}){
 const result={};
 if(config.approval_policy!=null)result.approvalPolicy=config.approval_policy;
 if(config.sandbox_mode!=null)result.sandbox=config.sandbox_mode;
 if(config.approvals_reviewer!=null)result.approvalsReviewer=config.approvals_reviewer;
 return result;
}
