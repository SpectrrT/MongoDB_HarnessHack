export function modelChoices(codex,openrouter){
 const native=(codex?.connected?codex.models:[])||[];
 const routed=(openrouter?.connected?openrouter.models:[])||[];
 return [
  ...native.map(m=>({...m,key:'codex:'+m.id,provider:'codex',tag:'Codex'})),
  ...[...routed].sort((a,b)=>Number(/codex/i.test(b.id+' '+b.name))-Number(/codex/i.test(a.id+' '+a.name)))
   .map(m=>({...m,key:'openrouter:'+m.id,provider:'openrouter',tag:'OpenRouter'})),
 ];
}
export function modelSettings(choice){
 return choice.provider==='codex'
  ?{modelProvider:'codex',modelConnected:true,modelSelection:choice.id}
  :{modelProvider:'openrouter',openrouterModel:choice.id};
}
