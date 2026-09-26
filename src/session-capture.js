// Capture is independent of the session dialog. Browser permission remains mandatory.
let screenVideo=null;
export function currentScreenImage(){
 if(!screenVideo||screenVideo.readyState<2)return null;
 const canvas=document.createElement('canvas'),scale=Math.min(1,1600/screenVideo.videoWidth);
 canvas.width=Math.round(screenVideo.videoWidth*scale);canvas.height=Math.round(screenVideo.videoHeight*scale);
 canvas.getContext('2d').drawImage(screenVideo,0,0,canvas.width,canvas.height);
 return {name:'Current screen.webp',data:canvas.toDataURL('image/webp',.75)};
}
export async function startCapture({mode,onChunk,onStopped,onError,signal,mediaDevices=navigator.mediaDevices,Recorder=MediaRecorder,Stream=MediaStream}){
 if(!['screen','audio','both'].includes(mode))throw Error('Choose Screen, Microphone, or Both.');
 const streams=[];let recorder,stopped=false,queue=Promise.resolve(),resolveDone,rejectDone;
 const done=new Promise((resolve,reject)=>{resolveDone=resolve;rejectDone=reject;});done.catch(()=>{});
 const release=()=>{for(const stream of streams)for(const track of stream.getTracks())track.stop();if(screenVideo){screenVideo.pause();screenVideo.srcObject=null;screenVideo=null;}};
 const aborted=()=>{if(signal?.aborted)throw Error('Recording cancelled.');};
 const stop=()=>{if(stopped)return done;stopped=true;release();if(recorder?.state!=='inactive')recorder.stop();return done;};
 const cancel=()=>{if(recorder)void stop();else release();};signal?.addEventListener('abort',cancel,{once:true});
 try{
  aborted();
  if(mode!=='audio')streams.push(await mediaDevices.getDisplayMedia({video:{frameRate:2},audio:false}));
  aborted();
  if(mode!=='screen')streams.push(await mediaDevices.getUserMedia({audio:true}));
  aborted();
  if(streams.some(stream=>stream.getTracks().some(track=>track.readyState==='ended')))throw Error('Sharing stopped before recording began.');
  const combined=new Stream(streams.flatMap(stream=>stream.getTracks()));
  recorder=new Recorder(combined);
  recorder.ondataavailable=event=>{if(!event.data.size)return;queue=queue.then(()=>onChunk(event.data)).catch(error=>{onError(error);void stop();});};
  recorder.onerror=event=>{onError(event.error||Error('Recording stopped unexpectedly.'));void stop();};
  recorder.onstop=()=>{stopped=true;signal?.removeEventListener('abort',cancel);release();queue.then(()=>{onStopped();resolveDone();},rejectDone);};
  for(const stream of streams)for(const track of stream.getTracks())track.onended=()=>{void stop();};
  if(mode!=='audio'&&typeof document!=='undefined'){
   screenVideo=document.createElement('video');screenVideo.muted=true;screenVideo.srcObject=streams[0];void screenVideo.play().catch(()=>{});
  }
  recorder.start(1000);
  return {stop,done,mimeType:recorder.mimeType,get active(){return !stopped&&recorder.state==='recording';}};
 }catch(error){signal?.removeEventListener('abort',cancel);release();if(recorder&&recorder.state!=='inactive')recorder.stop();throw error;}
}
