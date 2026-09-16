"use strict";
/* HEARTWOOD — sons 8 bits synthétisés (aucun fichier audio) */
(function(root){
let AC=null, muted=false;
function ac(){ try{ if(!AC) AC=new (window.AudioContext||window.webkitAudioContext)(); if(AC.state==="suspended")AC.resume(); }catch(e){} return AC; }
function tone(f0,f1,dur,type="square",vol=.07,delay=0){
  if(muted||!AC)return; try{const a=AC,t=a.currentTime+delay,o=a.createOscillator(),g=a.createGain();
  o.type=type;o.frequency.setValueAtTime(f0,t);o.frequency.exponentialRampToValueAtTime(Math.max(1,f1),t+dur);
  g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);
  o.connect(g).connect(a.destination);o.start(t);o.stop(t+dur+.02);}catch(e){}
}
function noiseS(dur,vol=.2,fq=800,delay=0){
  if(muted||!AC)return; try{const a=AC,t=a.currentTime+delay,len=(a.sampleRate*dur)|0,
  buf=a.createBuffer(1,len,a.sampleRate),d=buf.getChannelData(0);
  for(let i=0;i<len;i++)d[i]=Math.random()*2-1;
  const s=a.createBufferSource(),f=a.createBiquadFilter(),g=a.createGain();
  s.buffer=buf;f.type="lowpass";f.frequency.value=fq;
  g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);
  s.connect(f).connect(g).connect(a.destination);s.start(t);}catch(e){}
}
const last={};
function sfx(k){
  const now=performance.now(); if(last[k]&&now-last[k]<60)return; last[k]=now;
  switch(k){
  case"click":tone(600,600,.04,"square",.035);break;
  case"coin":tone(760,900,.06,"square",.05);tone(1140,1200,.07,"square",.04,.05);break;
  case"build":tone(220,180,.08,"square",.06);tone(330,300,.08,"square",.05,.07);break;
  case"err":tone(160,90,.15,"sawtooth",.06);break;
  case"war":noiseS(.25,.16,900);tone(120,60,.25,"sawtooth",.08);break;
  case"march":tone(200,260,.07,"square",.05);tone(200,260,.07,"square",.05,.12);break;
  case"kill":tone(300,40,.6,"sawtooth",.11);noiseS(.5,.18,500);break;
  case"ally":tone(520,520,.09,"square",.05);tone(660,660,.09,"square",.05,.09);tone(880,880,.14,"square",.05,.18);break;
  case"alert":tone(880,880,.09,"square",.06);tone(880,880,.09,"square",.06,.14);tone(880,880,.09,"square",.06,.28);break;
  case"rally":tone(440,660,.12,"square",.06);tone(660,990,.16,"square",.06,.1);break;
  case"roar":noiseS(1.2,.35,300);tone(70,30,1.1,"sawtooth",.2);tone(140,50,.9,"square",.08,.1);break;
  case"lash":noiseS(.3,.2,400);tone(90,40,.3,"sawtooth",.1);break;
  case"boom":noiseS(2.4,.4,240);tone(90,25,2.2,"sawtooth",.22);break;
  case"heart":tone(110,110,.18,"sine",.2);tone(110,110,.18,"sine",.2,.3);tone(220,440,.5,"square",.05,.7);break;
  case"tick":tone(1200,1200,.03,"square",.03);break;
}}
root.HWAudio={ac,sfx,toggleMute:()=>{muted=!muted;return muted;},isMuted:()=>muted};
})(window);
