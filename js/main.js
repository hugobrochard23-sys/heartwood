"use strict";
/* HEARTWOOD — démarrage et boucle principale */
(function(){
const {Engine,Bots}=window.HW;
const R=window.HWRender, UI=window.HWUI, A=window.HWAudio;
const G={E:null,bots:null,net:null,paused:false,speed:1,modal:false,tut:null,mode:"solo",uiAcc:0,
  start({name,diff,mode}){
    G.E=new Engine({diff,humans:[{name}],listener:UI.onEvent});
    G.bots=new Bots(G.E);
    G.net=new window.HWNet.LocalTransport(G.E); // le multijoueur branchera ici un RemoteTransport
    G.mode=mode; G.paused=false; G.speed=1; G.modal=false; G.tut=null;
    R.init(G.E);
  },
  stop(){ if(G.E)G.E.phase="over"; },
  togglePause(){ if(!G.E||G.E.phase==="over")return; G.paused=!G.paused; A.sfx("click"); UI.refreshUI(true); },
  cycleSpeed(){ if(!G.E)return; G.speed=G.speed>=3?1:G.speed+1; A.sfx("click"); UI.refreshUI(true); },
};
window.G=G;
UI.init(G);
new ResizeObserver(()=>R.resize()).observe(document.getElementById("mapWrap"));
R.resize();

function simulate(dt){
  G.E.step(dt); G.bots.step(dt); R.spawnTreeParticles(dt);
}
let last=performance.now();
function loop(now){
  requestAnimationFrame(loop);
  const rdt=Math.min(.1,Math.max(0,(now-last)/1000)); last=now;
  if(!G.E)return;
  R.updateCamera(rdt,UI.keys);
  const running=G.E.phase!=="over"&&!G.paused&&!G.tut&&!G.modal;
  if(running)simulate(rdt*G.speed);
  R.tickFx(rdt);
  G.uiAcc+=rdt; if(G.uiAcc>.2){G.uiAcc=0;UI.refreshUI(false);}
  R.render(now,{dragging:UI.dragging});
  UI.frame();
}
requestAnimationFrame(loop);
// Outil de test : avance la simulation à la main (utile quand l'onglet est en arrière-plan).
window.HWDEBUG={step(sec,dt=.25){for(let t=0;t<sec;t+=dt)simulate(dt);UI.refreshUI(true);R.render(performance.now(),{dragging:false});},G};
})();
