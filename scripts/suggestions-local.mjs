import fs from 'node:fs/promises';
import path from 'node:path';
import {MongoMemoryServer} from 'mongodb-memory-server';
import {MongoClient} from 'mongodb';
import {createPersonalSuggestions} from '../server/suggestions/service.js';
process.env.OFFLOAD_SKIP_ENV='1';
const {createApp}=await import('../server/index.js');
const dbPath=path.resolve('.data/personal-demo');await fs.mkdir(dbPath,{recursive:true});
const mongo=await MongoMemoryServer.create({instance:{dbPath,storageEngine:'wiredTiger'}});
const client=await new MongoClient(mongo.getUri()).connect();
const suggestions=await createPersonalSuggestions({db:client.db('personal_demo')});
const port=Number(process.env.PORT||5214);
const server=createApp({suggestions}).listen(port,'127.0.0.1',()=>console.log(`Personal suggestions: http://127.0.0.1:${port}/app/sleep`));
let stopping=false;
async function stop(){if(stopping)return;stopping=true;server.close();}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
try{while(!stopping){await suggestions.recoverAccepted();await suggestions.workOnce('local-demo');await new Promise(resolve=>setTimeout(resolve,200));}}
finally{await client.close();await mongo.stop({doCleanup:false});}
