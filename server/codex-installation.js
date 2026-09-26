import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
export function findCodex({env=process.env,home=os.homedir(),platform=process.platform,executable=file=>{try{fs.accessSync(file,fs.constants.X_OK);return true;}catch{return false;}}}={}){
 if(env.OFFLOAD_CODEX_BIN)return env.OFFLOAD_CODEX_BIN;
 const names=platform==='win32'?['codex.exe','codex.cmd','codex']:['codex'];
 // PATH first, then the usual install folders (a server started outside a terminal may have a short PATH).
 const usual=platform==='win32'?[]:[path.join(home,'.local','bin'),'/opt/homebrew/bin','/usr/local/bin'];
 for(const dir of [...(env.PATH||'').split(path.delimiter),...usual])
  for(const name of names){const file=path.join(dir,name);if(dir&&executable(file))return file;}
 return 'codex';
}
export const CODEX_INSTALL='npm install -g @openai/codex';
export const CODEX_MISSING=`ChatGPT sign-in needs the Codex CLI on this Mac. Install it with ${CODEX_INSTALL}, then check again.`;
// findCodex falls back to the bare name when it found nothing, so that is what "not installed" looks like.
export function codexInstalled(options){return findCodex(options)!=='codex';}
export function inheritedAccess(config={}){
 const result={};
 if(config.approval_policy!=null)result.approvalPolicy=config.approval_policy;
 if(config.sandbox_mode!=null)result.sandbox=config.sandbox_mode;
 if(config.approvals_reviewer!=null)result.approvalsReviewer=config.approvals_reviewer;
 return result;
}
