import test from 'node:test';import assert from 'node:assert/strict';
import {modelChoices,modelSettings} from '../shared/model-picker.js';
test('native Codex models lead the picker and keep provider routing unambiguous',()=>{
 const choices=modelChoices({connected:true,models:[{id:'frontier',name:'Frontier'}]}, {connected:true,models:[{id:'other',name:'Other'},{id:'frontier',name:'Codex on OpenRouter'}]});
 assert.deepEqual(choices.map(m=>m.key),['codex:frontier','openrouter:frontier','openrouter:other']);
 assert.deepEqual(modelSettings(choices[0]),{modelProvider:'codex',modelConnected:true,modelSelection:'frontier'});
 assert.deepEqual(modelSettings(choices[1]),{modelProvider:'openrouter',openrouterModel:'frontier'});
 assert.deepEqual(modelChoices({connected:false,models:[{id:'unavailable'}]},null),[]);
});
