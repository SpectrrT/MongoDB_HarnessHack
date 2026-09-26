import {loadEnvFile} from 'node:process';
import {fileURLToPath} from 'node:url';
export function loadLocalEnv(){
 // End-to-end tests run against the in-memory engine: OFFLOAD_SKIP_ENV=1 leaves .env unread.
 if(process.env.OFFLOAD_SKIP_ENV==='1')return;
 try {loadEnvFile(fileURLToPath(new URL('../.env',import.meta.url)));}
 catch(error){if(error.code!=='ENOENT')throw Error('Could not load local environment settings.');}
}
