import test from 'node:test';
import assert from 'node:assert/strict';
import {startCapture} from '../src/session-capture.js';
function platform({denyMic=false}={}){
 const tracks=[],calls=[],recorders=[];
 class Stream{constructor(tracks){this.tracks=tracks;}getTracks(){return this.tracks;}}
 const stream=kind=>{const track={kind,readyState:'live',stop(){this.readyState='ended';}};tracks.push(track);return new Stream([track]);};
 class Recorder{constructor(stream){this.stream=stream;this.state='inactive';this.mimeType='video/webm';recorders.push(this);}start(){this.state='recording';}stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['capture'])});this.onstop?.();}}
 const mediaDevices={getDisplayMedia:async()=>{calls.push('screen');return stream('video');},getUserMedia:async()=>{calls.push('microphone');if(denyMic)throw Object.assign(Error('Denied'),{name:'NotAllowedError'});return stream('audio');}};
 return {mediaDevices,Recorder,Stream,tracks,calls,recorders};
}
for(const [mode,kinds] of [['screen',['video']],['audio',['audio']],['both',['video','audio']]])test(`${mode} records the requested tracks until explicit stop`,async()=>{
 const p=platform(),chunks=[];let ended=0;
 const capture=await startCapture({mode,...p,onChunk:async blob=>{await Promise.resolve();chunks.push(blob)},onError:e=>{throw e},onStopped:()=>ended++});
 assert.deepEqual(p.recorders[0].stream.getTracks().map(t=>t.kind),kinds);assert.equal(p.recorders[0].state,'recording');
 await capture.stop();assert.ok(p.tracks.every(t=>t.readyState==='ended'));assert.equal(chunks.length,1);assert.equal(ended,1);await capture.stop();assert.equal(ended,1);
});
test('Both cleans up the screen when microphone permission is denied',async()=>{
 const p=platform({denyMic:true});await assert.rejects(startCapture({mode:'both',...p,onChunk:()=>{},onStopped:()=>{},onError:()=>{}}),/Denied/);assert.deepEqual(p.calls,['screen','microphone']);assert.ok(p.tracks.every(t=>t.readyState==='ended'));
});
test('browser Stop sharing ends both tracks and flushes final recording data',async()=>{
 const p=platform();let saved=false;
 const capture=await startCapture({mode:'both',...p,onChunk:async()=>{saved=true},onStopped:()=>{},onError:()=>{}});
 p.tracks[0].onended();await capture.done;assert.ok(saved);assert.ok(p.tracks.every(t=>t.readyState==='ended'));
});
test('leaving during the permission prompt releases late media streams',async()=>{
 const p=platform(),controller=new AbortController();let grant;
 const original=p.mediaDevices.getDisplayMedia;
 p.mediaDevices.getDisplayMedia=()=>new Promise(resolve=>{grant=async()=>resolve(await original());});
 const pending=startCapture({mode:'screen',...p,signal:controller.signal,onChunk:()=>{},onStopped:()=>{},onError:()=>{}});
 controller.abort();await grant();await assert.rejects(pending,/cancelled/);assert.ok(p.tracks.every(t=>t.readyState==='ended'));assert.equal(p.recorders.length,0);
});
