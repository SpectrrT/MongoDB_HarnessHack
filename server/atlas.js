import {MongoClient} from 'mongodb';
import {createWorkspace} from '../shared/workspace.js';
// No credentials or provider tokens belong in workspace documents.
export function createAtlasStore({uri=process.env.MONGODB_URI,database=process.env.MONGODB_DB||'offload'}={}){
 const client=new MongoClient(uri,{serverSelectionTimeoutMS:10000,maxPoolSize:5});
 const collection=client.db(database).collection('workspaces');
 return {
  async ping(){try{await client.db(database).command({ping:1});}catch{throw Error('Atlas is unavailable. Check the connection and network allowlist.');}},
  async update(key,fn){
   for(let attempt=0;attempt<5;attempt++){
    const current=await collection.findOne({_id:key});
    const state=await fn(current?.state||createWorkspace());
    if(current){const result=await collection.updateOne({_id:key,version:current.version},{$set:{state,updatedAt:new Date()},$inc:{version:1}});if(result.modifiedCount)return state;}
    else{try{await collection.insertOne({_id:key,version:1,state,updatedAt:new Date()});return state;}catch(error){if(error.code!==11000)throw error;}}
   }
   throw Error('This workspace changed elsewhere. Try again.');
  },
  close:()=>client.close(),
 };
}
