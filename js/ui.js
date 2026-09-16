"use strict";
/* ============================================================
   HEARTWOOD — interface : HUD, panneau latéral, entrées, écrans
   ============================================================ */
(function(root){
const {W,H,TS,T,TERR_NAMES,GAME_LEN,SUMMON_WAIT,HEART_LEN,COST,RALLY_LEN,PERS_TXT,worldCenter}=root.HW;
const {clamp,fmt,fmtTime}=root.HWU;
const R=root.HWRender, A=root.HWAudio;
const $=id=>document.getElementById(id);
const store={get(k){try{return localStorage.getItem(k);}catch(e){return null;}},set(k,v){try{localStorage.setItem(k,v);}catch(e){}}};
let G=null; // état global fourni par main.js
const E=()=>G.E, me=()=>G.E.me();
const send=o=>{o.pid=G.E.localPid;return G.net.send(o);};

let tab="army", armedBreak=-1, uiDownEl=null, tipKey="", giftTo=-1;
const mouse={x:0,y:0,inside:false};
const keys=new Set();
let drag=null, pinch=null; const pointers=new Map();

document.addEventListener("pointerdown",e=>{uiDownEl=e.target;},true);
document.addEventListener("pointerup",()=>{setTimeout(()=>{uiDownEl=null;},0);},true);
function setText(id,t){const el=$(id);if(el&&el.textContent!==t)el.textContent=t;}
function setHTML(el,html,force){
  if(el._h===html)return;
  if(!force){if(uiDownEl&&el.contains(uiDownEl))return;const ae=document.activeElement;if(ae&&ae.tagName==="INPUT"&&el.contains(ae))return;}
  el.innerHTML=html; el._h=html;
}
const sw=c=>`<span class="sw" style="background:${c}"></span>`;

// ---------- journal, toasts, bannières ----------
function logMsg(txt,cls="",t){
  const box=$("logBox"), d=document.createElement("div");
  const ts=document.createElement("span"); ts.className="t"; ts.textContent=`[${fmtTime(t??(G.E?G.E.time:0))}]`;
  const s=document.createElement("span"); s.className=cls; s.textContent=txt;
  d.append(ts,s); box.prepend(d);
  while(box.children.length>100)box.lastChild.remove();
}
function toast(txt,cls="",ms=3500,action){
  const w=$("toasts"), lastT=w.lastElementChild;
  if(lastT&&lastT._txt===txt){lastT._n=(lastT._n||1)+1;lastT.querySelector(".tx").textContent=`${txt} ×${lastT._n}`;clearTimeout(lastT._to);lastT._to=setTimeout(()=>lastT.remove(),ms);return;}
  while(w.children.length>=4)w.firstElementChild.remove();
  const d=document.createElement("div"); d.className="toast "+cls; d._txt=txt;
  const s=document.createElement("span"); s.className="tx"; s.textContent=txt; d.appendChild(s);
  if(action){const b=document.createElement("button");b.className="btn mini";b.textContent=action.label;b.addEventListener("click",()=>{action.fn();d.remove();});d.appendChild(b);}
  w.appendChild(d); d._to=setTimeout(()=>d.remove(),ms);
}
let bannerTo=null;
function banner(txt,cls="",ms=3200){
  const b=$("banner"); b.textContent=txt; b.className="banner "+cls; b.classList.remove("hidden");
  clearTimeout(bannerTo); bannerTo=setTimeout(()=>b.classList.add("hidden"),ms);
}

// ---------- événements du moteur ----------
function onEvent(type,d){
  switch(type){
    case "log": logMsg(d.txt,d.cls,d.t); break;
    case "toast": toast(d.txt,d.cls,d.ms,d.tile>=0&&d.tile!==undefined?{label:"Voir",fn:()=>R.focusTile(d.tile)}:undefined); break;
    case "sfx": A.sfx(d); break;
    case "tile": R.markTile(d); break;
    case "map": R.markAll(); break;
    case "flash": R.fx.flashes.push({i:d.i,t:d.t,c:d.c}); break;
    case "float": R.addFloat(d.i,d.txt,d.c); break;
    case "ping": R.fx.pings.push({i:d.i,t:4,c:d.c}); break;
    case "shake": R.fx.shake=Math.max(R.fx.shake,d); break;
    case "phase":
      if(d==="summon")banner(E().summoner===E().localPid?"TU ES #1 — INVOQUE LE GARDIEN":"L'ARBRE S'OUVRE","gold",4000);
      else if(d==="boss")banner("THE GUARDIAN AWAKENS","red",4500);
      else if(d==="heart")banner("THE HEART HAS APPEARED — TRUST NO ONE","heart",5000);
      if(tab!=="army")setTab("army"); refreshUI(true); break;
    case "tree": if(d==="tree1430")banner("30 SECONDES","red",2500); break;
    case "bossHit": R.fx.hitFlash=.12; break;
    case "heartTaken": if(d.pid===E().localPid)banner("TU TIENS LE CŒUR","heart",2000); break;
    case "dead": showDead(d.k); break;
    case "end": showEnd(d); break;
    case "alliance": case "offer": refreshUI(true); break;
    case "expLaunch": if(d.ex.owner===E().localPid)R.fx.pings.push({i:d.i,t:1.5,c:me().color}); break;
  }
}

// ---------- HUD ----------
function updateHUD(){
  const Eg=E(), p=me();
  setText("hPower",fmt(p.power));
  setText("hPowerRate",p.alive?`+${Eg.powerRate(p).toFixed(1)}/s`:"");
  setText("hArmy",fmt(p.army));
  setText("hArmyCap",p.alive?`/ ${fmt(Eg.armyCap(p))}`:"");
  setText("hLand",`${(Eg.landPct(p)*100).toFixed(1)} %`);
  setText("hRank",p.alive?`#${p.rank}`:"†");
  $("hRank").className=p.alive&&p.rank===1?"goldt":"";
  const busy=Eg.exps.filter(e=>e.alive&&e.owner===p.id).reduce((s,e)=>s+e.troops,0);
  setText("hAway",busy>0?`+${fmt(busy)} en campagne`:"");
  const tEl=$("hudTimer"), ph=Eg.phase;
  let txt,cls="",label="";
  if(ph==="play"){const left=GAME_LEN-Eg.time;txt=fmtTime(left);cls=left<=60?"crit":left<=180?"warn":"";label="GARDIEN DANS";}
  else if(ph==="summon"){txt=fmtTime(Eg.summonAt-Eg.time);cls="crit";label="INVOCATION";}
  else if(ph==="boss"){txt=`${Math.max(0,Math.round(Eg.boss.hp/Eg.boss.maxHp*100))} %`;cls="crit";label="GARDIEN";}
  else if(ph==="heart"){txt=Eg.heart.holder>=0?fmtTime(Eg.heart.t):"—";cls="crit";label="CŒUR";}
  else{txt="FIN";label="";}
  setText("hudTimer",txt); if(tEl.className!==cls)tEl.className=cls; setText("hudPhase",label);
  $("timerFill").style.width=(ph==="play"?clamp((GAME_LEN-Eg.time)/GAME_LEN,0,1)*100:0).toFixed(1)+"%";
  const tr=ph==="play"&&Eg.truceActive(); $("truceStat").classList.toggle("hidden",!tr); if(tr)setText("hTruce",fmtTime(Eg.truce-Eg.time));
  setText("speedBtn","x"+G.speed); $("pauseTag").classList.toggle("hidden",!G.paused); setText("pauseBtn",G.paused?"Reprendre":"Pause");
  const mine=Eg.offers.filter(o=>o.to===p.id).length; $("offerBadge").classList.toggle("hidden",!mine); setText("offerBadge",String(mine));
  updateBossBar();
}
function updateBossBar(){
  const Eg=E(), bar=$("bossBar");
  if(Eg.phase==="boss"&&Eg.boss){
    const b=Eg.boss, r=clamp(b.hp/b.maxHp,0,1);
    bar.classList.remove("hidden"); bar.className="pbox boss";
    setText("bossName",`LE GARDIEN · ${["","éveillé","RAGE","FRÉNÉSIE","DERNIER SOUFFLE"][b.stage]}`);
    $("bossFill").style.width=(r*100).toFixed(1)+"%";
    setText("bossTxt",`${fmt(b.hp)} / ${fmt(b.maxHp)} · ${b.attackers.size} adversaire${b.attackers.size>1?"s":""} · ${fmtTime(root.HW.BOSS_MAX-b.t)}`);
  }else if(Eg.phase==="heart"&&Eg.heart){
    const h=Eg.heart; bar.classList.remove("hidden"); bar.className="pbox heart";
    const holder=h.holder>=0?Eg.players[h.holder]:null;
    setText("bossName",holder?`LE CŒUR · ${holder.id===Eg.localPid?"À TOI":holder.name}`:"LE CŒUR · libre");
    $("bossFill").style.width=(holder?clamp(h.t/HEART_LEN,0,1)*100:100).toFixed(1)+"%";
    setText("bossTxt",holder?`${fmt(h.garrison)} soldats sur place · victoire dans ${Math.ceil(h.t)} s`:"Envoie tes soldats au centre !");
  }else bar.classList.add("hidden");
}
function updateLeaderboard(){
  const Eg=E(), list=Eg.rankedList(), p=me();
  const top=list.slice(0,5); if(!top.includes(p))top.push(p);
  const html=top.map(q=>`<div class="lb ${q.id===p.id?"me":""} ${!q.alive?"dead":""}"><span>${q.rank===1&&q.alive?"👑":q.alive?"#"+q.rank:"†"}</span>${sw(q.color)}<span class="nm">${q.name}</span>
    ${p.allies.has(q.id)?'<span class="tag ally">A</span>':""}${Eg.coalition&&Eg.coalitionTarget===q.id?'<span class="tag traitor">CIBLE</span>':""}
    <span class="pct">${(Eg.landPct(q)*100).toFixed(0)} %</span></div>`).join("");
  setHTML($("lbStrip"),html,true);
}

// ---------- panneau contextuel ----------
function updateCtx(force){
  const Eg=E(), p=me(), el=$("ctxPanel"), i=R.sel, pct=p.atkPct, n=Math.floor(p.army*pct/100);
  let html;
  if(!p.alive)html=`<div class="tt">SPECTATEUR</div><div class="dim">Ton empire est tombé. Accélère avec <b>F</b> pour voir la fin.</div>`;
  else if(Eg.phase==="summon"&&Eg.summoner===p.id)html=`<div class="tt">TU ES #1</div><div>Le droit d'invoquer le Gardien t'appartient.</div><button class="btn red" data-act="summon">INVOQUER LE GARDIEN (${Math.ceil(Eg.summonAt-Eg.time)} s)</button>`;
  else if(i<0){
    const hint=Eg.phase==="boss"?`Le <b class="redt">Gardien</b> est sur l'Arbre. Clique l'Arbre ou le bouton pour envoyer ${pct} % de ton armée (${n}).`:
      Eg.phase==="heart"?`Le <b class="heartt">Cœur</b> est apparu. Celui qui le tient ${HEART_LEN} s gagne. Clique l'Arbre pour y envoyer ${n} soldats.`:
      `Clique une case <span class="greent">neutre</span> ou <span class="redt">ennemie</span> voisine de ton territoire : tu y envoies ${pct} % de ton armée (${n} soldats).`;
    html=`<div class="tt">${p.name.toUpperCase()} · #${p.rank}</div><div class="dim">${hint}</div>`;
  }else{
    const tl=Eg.tiles[i], adj=Eg.isAdjOwned(i,p.id);
    html=`<div class="tt">${TERR_NAMES[tl.t].toUpperCase()}${tl.fort?" · FORTIFIÉE":""}</div>`;
    if(tl.t===T.TREE){
      if(Eg.phase==="boss")html+=`<div class="row">Le Gardien : <b class="redt">${fmt(Eg.boss.hp)}</b> PV.</div><button class="btn red" data-act="sendBoss">Envoyer ${n} soldats (${pct} %)</button>`;
      else if(Eg.phase==="heart")html+=`<div class="row">Le Cœur${Eg.heart.holder>=0?` — tenu par <b>${Eg.players[Eg.heart.holder].name}</b> (${fmt(Eg.heart.garrison)} soldats)`:" — libre"}.</div><button class="btn red" data-act="sendHeart">Envoyer ${n} soldats (${pct} %)</button>`;
      else html+=`<div class="dim">L'Arbre-Monde. À 15:00, le #1 pourra y invoquer le Gardien.</div>`;
    }else if(tl.t===T.CORRUPT)html+=`<div class="dim">Dévorée par le Gardien. Plus personne ne peut la posséder.</div>`;
    else if(tl.o===-1){
      if(!Eg.isLand(i))html+=`<div class="dim">Case inexploitable.</div>`;
      else if(adj)html+=`<div class="row">Terre neutre${tl.t===T.ROOT?' · <span class="goldt">racine : +0,35 ⚡/s</span>':""}. Coût : ${tl.t===T.MTN?3:2} soldats par case.</div><button class="btn mini green" data-act="a:attack">Conquérir avec ${n} soldats</button>`;
      else html+=`<div class="dim">Terre neutre, trop loin : étends-toi jusqu'ici.</div>`;
    }else if(tl.o===p.id){
      if(i===p.capital)html+=`<div class="row">Ta capitale. Si elle tombe, tu es éliminé.</div><div class="dim">Défense ≈ <b>${fmt(Eg.garrison(p,i))}</b> · armée ${fmt(p.army)} (+${Eg.growth(p).toFixed(1)}/s)</div>`;
      else html+=`<div class="dim">Ton territoire${tl.t===T.ROOT?" · racine (+0,35 ⚡/s)":""}. Garnison ≈ ${Eg.garrison(p,i).toFixed(1)}.</div>`;
      if(!tl.fort)html+=`<button class="btn mini" data-act="a:fortify" data-cost="${COST.fortify}">Fortifier (${COST.fortify} ⚡ · défense ×2)</button>`;
    }else{
      const d=Eg.players[tl.o];
      html+=`<div class="row">${sw(d.color)} <b>${d.name}</b> #${d.rank} ${p.allies.has(d.id)?'<span class="tag ally">ALLIÉ</span>':""}${i===d.capital?' <span class="tag traitor">CAPITALE</span>':""}</div>`;
      if(!adj)html+=`<div class="dim">Pas de frontière commune ici.</div>`;
      else if(p.allies.has(d.id))html+=`<div class="dim">Allié. Romps le pacte (ou trahis-le) dans l'onglet Diplo.</div>`;
      else if(Eg.truceActive())html+=`<div class="tealt">Trêve encore ${fmtTime(Eg.truce-Eg.time)}.</div>`;
      else{
        const g=Eg.garrison(d,i), avg=Eg.avgGarrison(d)*Eg.defMul(i);
        html+=`<div class="row">Garnison ici ≈ <b class="redt">${g.toFixed(1)}</b> · ${n} soldats prendraient ≈ <b class="greent">${Math.floor(n/Math.max(avg,.5))}</b> cases</div>
          <button class="btn mini red" data-act="a:attack">Attaquer avec ${n} soldats (${pct} %)</button>`;
      }
    }
  }
  setHTML(el,html,force);
}

// ---------- onglet ARMÉE ----------
function buildArmyTab(){
  $("tab-army").innerHTML=`
    <div class="card"><div class="nm">FORCE D'ATTAQUE <span id="pctTxt" class="goldt"></span></div>
      <div class="ds">Part de ton armée envoyée à chaque clic. Ce qui part ne défend plus ta capitale.</div>
      <input type="range" id="pctSlider" min="10" max="100" step="5" value="50">
      <div class="brow"><button class="btn mini" data-act="pct:25">25 %<kbd>1</kbd></button><button class="btn mini" data-act="pct:50">50 %<kbd>2</kbd></button><button class="btn mini" data-act="pct:75">75 %<kbd>3</kbd></button><button class="btn mini" data-act="pct:100">100 %<kbd>4</kbd></button></div></div>
    <div id="phaseAction"></div>
    <div class="card"><div class="nm">CAPACITÉS <span class="goldt">⚡</span></div>
      <div class="ds">Le pouvoir vient de ton territoire (les racines de l'Arbre en donnent plus).</div>
      <div class="brow"><span>Ralliement<kbd>R</kbd> <span class="dim">+40 % d'attaque, ${RALLY_LEN} s</span></span><button class="btn mini" data-act="rally" data-cost="${COST.rally}">${COST.rally} ⚡</button></div>
      <div class="brow" style="margin-top:5px"><span>Fortifier<kbd>X</kbd> <span class="dim">la case sélectionnée, défense ×2</span></span><button class="btn mini" data-act="a:fortify" data-cost="${COST.fortify}">${COST.fortify} ⚡</button></div>
      <div id="rallyLine" class="dim"></div></div>
    <div class="sect">CAMPAGNES EN COURS</div><div id="expList" class="dim">Aucune.</div>`;
  $("pctSlider").addEventListener("input",e=>{send({type:"setPct",pct:+e.target.value});refreshUI(true);});
}
function updateArmyUI(force){
  const Eg=E(), p=me(), n=Math.floor(p.army*p.atkPct/100);
  setText("pctTxt",`${p.atkPct} % → ${n} soldats`);
  const sl=$("pctSlider"); if(+sl.value!==p.atkPct&&document.activeElement!==sl)sl.value=p.atkPct;
  setText("rallyLine",Eg.rallyOn(p)?`Ralliement actif : ${Math.ceil(p.rallyUntil-Eg.time)} s`:"");
  let pa="";
  if(Eg.phase==="summon")pa=Eg.summoner===p.id?`<div class="card offer"><div class="nm">TU ES #1</div><div class="ds">Tu détiens le droit d'invoquer le Gardien. Tes alliés pourront t'aider… ou non.</div><button class="btn red" data-act="summon">INVOQUER LE GARDIEN (${Math.ceil(Eg.summonAt-Eg.time)} s)</button></div>`
    :`<div class="card offer"><div class="nm">INVOCATION</div><div class="ds">${Eg.players[Eg.summoner]?.name??"?"} est #1 et va invoquer le Gardien.</div></div>`;
  else if(Eg.phase==="boss"){const b=Eg.boss;pa=`<div class="card offer"><div class="nm">LE GARDIEN <span class="redt">${Math.round(b.hp/b.maxHp*100)} %</span></div><div class="ds">Chaque adversaire supplémentaire le renforce. ${b.attackers.has(p.id)?"Tu es dans le combat.":"Tu n'as pas encore frappé."} Tes dégâts : ${fmt(p.bossDmg)}.</div><button class="btn red" data-act="sendBoss">ENVOYER ${n} SOLDATS<kbd>G</kbd></button></div>`;}
  else if(Eg.phase==="heart"){const h=Eg.heart;pa=`<div class="card offer"><div class="nm">LE CŒUR <span class="heartt">${h.holder>=0?`${Math.ceil(h.t)} s`:"libre"}</span></div><div class="ds">${h.holder<0?"Personne ne le tient.":h.holder===p.id?`Tu le tiens avec ${fmt(h.garrison)} soldats. Renforce-le !`:`${Eg.players[h.holder].name} le tient avec ${fmt(h.garrison)} soldats (×1,5 en défense).`}</div><button class="btn red" data-act="sendHeart">ENVOYER ${n} SOLDATS<kbd>G</kbd></button></div>`;}
  setHTML($("phaseAction"),pa,force);
  const exps=Eg.exps.filter(e=>e.alive&&e.owner===p.id);
  setHTML($("expList"),exps.length?exps.map(e=>`<div class="brow"><span>→ ${e.target<0?"terres neutres":Eg.players[e.target].name} : <b>${fmt(e.troops)}</b> soldats, ${e.captured} cases</span><button class="btn mini" data-act="recall:${e.id}">Rappeler</button></div>`).join(""):"Aucune.",force);
}

// ---------- onglet DIPLO ----------
function relWord(r){return r<=-60?"Haineux":r<=-25?"Hostile":r<=-5?"Méfiant":r<20?"Neutre":r<45?"Cordial":r<70?"Amical":"Frère d'armes";}
function updateDiploUI(force){
  const Eg=E(), p=me();
  const offers=Eg.offers.filter(o=>o.to===p.id);
  let oh="";
  if(offers.length){oh+=`<div class="sect">OFFRES REÇUES</div>`;
    for(const o of offers)oh+=`<div class="card offer"><div class="nm">${Eg.players[o.from].name} <span class="dim">(${Math.max(0,Math.ceil(o.exp-Eg.time))} s)</span></div><div class="ds">${o.txt}</div>
      <button class="btn mini green" data-act="of:acc:${o.id}">Accepter</button><button class="btn mini red" data-act="of:rej:${o.id}">Refuser</button></div>`;}
  setHTML($("dOffers"),oh,force);
  const list=Eg.rankedList();
  setHTML($("dRank"),`<div class="sect">CLASSEMENT · % DES TERRES</div><table class="mini">${list.map(q=>`<tr class="${q.id===p.id?"me":""}"><td>${q.alive?(q.rank===1?"👑":"#"+q.rank):"†"}</td><td>${sw(q.color)} ${q.name}${p.allies.has(q.id)?' <span class="tag ally">ALLIÉ</span>':""}</td><td style="text-align:right">${(Eg.landPct(q)*100).toFixed(1)} %</td><td style="text-align:right" class="dim">≈${Math.round(q.army/10)*10}</td></tr>`).join("")}</table>`,force);
  let html=`<div class="sect">EMPIRES</div>`;
  if(Eg.phase==="heart")html+=`<div class="dim">Le Cœur est apparu : plus aucune alliance n'est possible.</div>`;
  for(const q of Eg.players){
    if(q.id===p.id)continue;
    const r=Math.round(q.rel[p.id]??0), ally=p.allies.has(q.id);
    html+=`<div class="card"><div class="brow"><span>${sw(q.color)} <span class="nm">${q.name}</span> <span class="dim">(${PERS_TXT[q.pers]||"humain"})</span>
      ${ally?'<span class="tag ally">ALLIÉ</span>':""}${Eg.time-q.betrayT<180?'<span class="tag traitor">PARJURE</span>':""}${!q.alive?'<span class="tag dead">†</span>':""}${Eg.coalition&&Eg.coalitionTarget===q.id?'<span class="tag traitor">CIBLE</span>':""}</span></div>`;
    if(q.alive){
      html+=`<div class="brow" style="margin:3px 0;"><span class="dim">${relWord(r)} · #${q.rank} · armée ≈ ${Math.round(q.army/10)*10}</span><span class="relbar"><div style="width:${(r+100)/2}%;background:${r>=0?"var(--green)":"var(--red)"}"></div></span></div>`;
      if(p.alive&&Eg.phase!=="heart"&&Eg.phase!=="over"){
        if(ally)html+=`<button class="btn mini red" data-act="d:betray:${q.id}">Trahir</button> <button class="btn mini" data-act="d:break:${q.id}">Rompre</button> `;
        else html+=`<button class="btn mini green" data-act="d:ally:${q.id}" data-cost="${COST.ally}">Alliance (${COST.ally} ⚡)</button> `;
        html+=`<button class="btn mini" data-act="d:gift:${q.id}" data-cost="25">Offrir 25 ⚡</button>`;
      }
    }
    html+=`</div>`;
  }
  setHTML($("dEmp"),html,force);
}
function updateCostButtons(){
  const p=me(), ok=p.alive&&E().phase!=="over";
  document.querySelectorAll("#side [data-cost]").forEach(b=>{const dis=!ok||p.power<+b.dataset.cost;if(b.disabled!==dis)b.disabled=dis;});
}
function refreshUI(force){
  if(!G.E)return;
  updateHUD(); updateLeaderboard(); updateCtx(force);
  if(tab==="army")updateArmyUI(force); else if(tab==="diplo")updateDiploUI(force);
  updateCostButtons();
}
function setTab(t){
  tab=t;
  document.querySelectorAll("#tabs button").forEach(x=>x.classList.toggle("on",x.dataset.tab===t));
  document.querySelectorAll(".tabc").forEach(x=>x.classList.toggle("hidden",x.id!=="tab-"+t));
  if(G.E)refreshUI(true);
}

// ---------- infobulle ----------
function tipHTML(i){
  const Eg=E(), tl=Eg.tiles[i], p=me(), n=Math.floor(p.army*p.atkPct/100);
  let s=TERR_NAMES[tl.t]+(tl.fort?" · fortifiée":"");
  if(!p.alive||Eg.phase==="over")return s;
  if(tl.t===T.TREE)return Eg.phase==="boss"?`<span class="redt">Clic : ${n} soldats contre le Gardien</span>`:Eg.phase==="heart"?`<span class="heartt">Clic : ${n} soldats vers le Cœur</span>`:"L'Arbre-Monde";
  if(tl.o===-1){
    if(!Eg.isLand(i))return s;
    if(Eg.isAdjOwned(i,p.id))return `${s}<br><span class="greent">Clic : conquérir (${n} soldats)</span>`;
    return `${s}<br><span class="dim">Trop loin</span>`;
  }
  if(tl.o===p.id)return `${s}<br><span class="dim">Ton territoire${i===p.capital?" · capitale":""}</span>`;
  const d=Eg.players[tl.o]; s+=`<br><span style="color:${d.color}">${d.name}</span> #${d.rank}`;
  if(!Eg.isAdjOwned(i,p.id))return s+` <span class="dim">(pas de frontière)</span>`;
  if(p.allies.has(d.id))return s+` <span class="greent">(allié)</span>`;
  if(Eg.truceActive())return s+`<br><span class="tealt">Trêve : ${fmtTime(Eg.truce-Eg.time)}</span>`;
  return s+`<br><span class="redt">Clic : attaquer avec ${n} soldats · garnison ≈ ${Eg.garrison(d,i).toFixed(1)}</span>`;
}
function updateTip(){
  const el=$("tip");
  if(!mouse.inside||R.hover<0||G.tut||(drag&&drag.moved)){if(!el.classList.contains("hidden"))el.classList.add("hidden");tipKey="";return;}
  const html=tipHTML(R.hover);
  if(html!==tipKey){el.innerHTML=html;tipKey=html;}
  el.classList.remove("hidden");
  const w=el.offsetWidth,h=el.offsetHeight; let x=mouse.x+16,y=mouse.y+18;
  if(x+w>R.vw-4)x=mouse.x-w-12; if(y+h>R.vh-4)y=mouse.y-h-12;
  el.style.transform=`translate(${Math.round(x)}px,${Math.round(y)}px)`;
}

// ---------- actions ----------
function doAct(actStr){
  const Eg=E(), p=me(), a=actStr.split(":"), A=a[0], X=a[1], Y=a[2];
  if(Eg.phase==="over")return;
  if(!p.alive){toast("Tu es spectateur.","red");return;}
  if(A==="pct")send({type:"setPct",pct:+X});
  else if(A==="rally")send({type:"rally"});
  else if(A==="summon")send({type:"summon"});
  else if(A==="sendBoss")send({type:"sendBoss"});
  else if(A==="sendHeart")send({type:"sendHeart"});
  else if(A==="recall")send({type:"recall",id:+X});
  else if(A==="a"){
    if(X==="attack")send({type:"attack",tile:R.sel});
    else if(X==="fortify"){ if(R.sel<0||Eg.tiles[R.sel].o!==p.id){A.sfx("err");toast("Sélectionne d'abord une de tes cases.","red");}else send({type:"fortify",tile:R.sel}); }
  }
  else if(A==="d"){
    const o=+Y;
    if(X==="ally")send({type:"ally",to:o});
    else if(X==="gift")send({type:"gift",to:o,amount:25});
    else if(X==="break"){ if(armedBreak===o){send({type:"break",to:o});armedBreak=-1;} else {armedBreak=o;toast("Re-clique « Rompre » pour confirmer.","red");setTimeout(()=>{armedBreak=-1;},3000);} }
    else if(X==="betray"){ if(armedBreak===-o-100){send({type:"betray",to:o});armedBreak=-1;} else {armedBreak=-o-100;toast("Trahir = rupture immédiate + marque du parjure 3 min. Re-clique pour confirmer.","red",4000);setTimeout(()=>{armedBreak=-1;},4000);} }
  }
  else if(A==="of")send({type:"offer",id:+X,accept:Y==="acc"});
  refreshUI(true);
}
function handleTap(i){
  const Eg=E(); if(!Eg||G.tut||i<0)return;
  const p=me(), tl=Eg.tiles[i];
  if(Eg.phase==="over"||!p.alive){R.sel=i;refreshUI(true);return;}
  R.sel=i;
  if(tl.t===T.TREE&&Eg.phase==="boss")send({type:"sendBoss"});
  else if(tl.t===T.TREE&&Eg.phase==="heart")send({type:"sendHeart"});
  else if(tl.o===-1&&Eg.isLand(i)&&Eg.isAdjOwned(i,p.id))send({type:"attack",tile:i});
  else if(tl.o>=0&&tl.o!==p.id&&Eg.isAdjOwned(i,p.id)&&!p.allies.has(tl.o))send({type:"attack",tile:i});
  else if(tl.o===-1&&Eg.isLand(i)){A.sfx("err");toast("Trop loin : conquiers d'abord les cases entre toi et cette terre.","red");}
  else A.sfx("click");
  refreshUI(true);
}

// ---------- entrées carte ----------
function bindInputs(){
  const cv=R.cv, mmCv=R.mmCv;
  const localXY=e=>{const r=cv.getBoundingClientRect();return [e.clientX-r.left,e.clientY-r.top];};
  cv.addEventListener("pointerdown",e=>{
    if(!G.E)return; try{cv.setPointerCapture(e.pointerId);}catch(_){}
    const [x,y]=localXY(e); pointers.set(e.pointerId,{x,y});
    if(pointers.size===1)drag={id:e.pointerId,sx:x,sy:y,cx:R.cam.x,cy:R.cam.y,moved:false,button:e.button,touch:e.pointerType!=="mouse"};
    else if(pointers.size===2){drag=null;const [a,b]=[...pointers.values()],mx=(a.x+b.x)/2,my=(a.y+b.y)/2;pinch={d:Math.hypot(a.x-b.x,a.y-b.y)||1,z:R.cam.z,wx:mx/R.cam.z+R.cam.x,wy:my/R.cam.z+R.cam.y};}
  });
  cv.addEventListener("pointermove",e=>{
    if(!G.E)return; const [x,y]=localXY(e);
    if(e.pointerType==="mouse"){mouse.x=x;mouse.y=y;mouse.inside=true;}
    if(pointers.has(e.pointerId))pointers.set(e.pointerId,{x,y});
    if(pinch&&pointers.size===2){const [a,b]=[...pointers.values()],mx=(a.x+b.x)/2,my=(a.y+b.y)/2;R.cam.z=R.cam.tz=clamp(pinch.z*Math.hypot(a.x-b.x,a.y-b.y)/pinch.d,R.cam.zmin,R.cam.zmax);R.cam.x=pinch.wx-mx/R.cam.z;R.cam.y=pinch.wy-my/R.cam.z;R.clampCam();return;}
    if(drag&&drag.id===e.pointerId){
      const dx=x-drag.sx,dy=y-drag.sy;
      if(!drag.moved&&Math.hypot(dx,dy)>(drag.touch?10:5))drag.moved=true;
      if(!drag.moved)return;
      R.cam.x=drag.cx-dx/R.cam.z; R.cam.y=drag.cy-dy/R.cam.z; R.clampCam(); cv.style.cursor="grabbing";
    }
  });
  const endPointer=(e,cancel)=>{
    if(!G.E)return; pointers.delete(e.pointerId);
    if(pinch){if(pointers.size<2)pinch=null;drag=null;return;}
    if(drag&&drag.id===e.pointerId){
      const d=drag; drag=null; cv.style.cursor="crosshair";
      if(cancel||d.moved)return;
      if(d.button===2){R.sel=-1;refreshUI(true);return;}
      if(d.button===0){const [x,y]=localXY(e);handleTap(R.screenToTile(x,y));}
    }
  };
  cv.addEventListener("pointerup",e=>endPointer(e,false));
  cv.addEventListener("pointercancel",e=>endPointer(e,true));
  cv.addEventListener("pointerleave",e=>{if(e.pointerType==="mouse")mouse.inside=false;});
  cv.addEventListener("contextmenu",e=>e.preventDefault());
  cv.addEventListener("wheel",e=>{e.preventDefault();if(!G.E)return;const [x,y]=localXY(e);R.zoomAt(Math.pow(1.0018,-e.deltaY*(e.deltaMode===1?33:1)),x,y);},{passive:false});
  const mmJump=e=>{const r=mmCv.getBoundingClientRect();R.cam.x=(e.clientX-r.left)/r.width*W*TS-R.vw/R.cam.z/2;R.cam.y=(e.clientY-r.top)/r.height*H*TS-R.vh/R.cam.z/2;R.clampCam();};
  let mmDrag=false;
  mmCv.addEventListener("pointerdown",e=>{if(!G.E)return;mmDrag=true;try{mmCv.setPointerCapture(e.pointerId);}catch(_){}mmJump(e);});
  mmCv.addEventListener("pointermove",e=>{if(mmDrag)mmJump(e);});
  mmCv.addEventListener("pointerup",()=>{mmDrag=false;}); mmCv.addEventListener("pointercancel",()=>{mmDrag=false;});

  $("side").addEventListener("click",e=>{
    if(!G.E)return;
    const tb=e.target.closest("[data-tab]"); if(tb){setTab(tb.dataset.tab);A.sfx("click");return;}
    if(e.target.closest("#sideToggle")){const s=$("side");s.classList.toggle("collapsed");setText("sideToggle",s.classList.contains("collapsed")?"▲ Panneau":"▼ Panneau");return;}
    const b=e.target.closest("[data-act]"); if(!b)return; doAct(b.dataset.act);
  });
  $("ctxPanel").addEventListener("click",e=>{const b=e.target.closest("[data-act]");if(b&&G.E)doAct(b.dataset.act);});

  const MOVE=["KeyW","KeyA","KeyS","KeyD","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"];
  window.addEventListener("keydown",e=>{
    if(!G.E||!$("titleScreen").classList.contains("hidden"))return;
    if(e.target.tagName==="INPUT"){if(e.key==="Escape")e.target.blur();return;}
    const c=e.code;
    if(G.tut){if(c==="Enter"||c==="Space"){e.preventDefault();tutAdvance();}else if(c==="Escape")endTutorial();return;}
    if(!$("helpModal").classList.contains("hidden")){if(c==="Escape"||c==="KeyH"||c==="Enter")closeHelp();return;}
    if(MOVE.includes(c)){keys.add(c);e.preventDefault();return;}
    const pcts={Digit1:25,Digit2:50,Digit3:75,Digit4:100}; if(pcts[c]){send({type:"setPct",pct:pcts[c]});refreshUI(true);return;}
    switch(c){
      case"Space":e.preventDefault();G.togglePause();break;
      case"Escape":R.sel=-1;refreshUI(true);break;
      case"KeyF":G.cycleSpeed();break;
      case"KeyC":if(me().alive)R.focusTile(me().capital);break;
      case"KeyV":R.focusTile(E().center);break;
      case"KeyR":doAct("rally");break;
      case"KeyX":doAct("a:fortify");break;
      case"KeyG":{const ph=E().phase;if(ph==="summon")doAct("summon");else if(ph==="boss")doAct("sendBoss");else if(ph==="heart")doAct("sendHeart");break;}
      case"KeyT":{const t=["army","diplo","log"];setTab(t[(t.indexOf(tab)+1)%3]);break;}
      case"KeyH":openHelp();break;
      case"Equal":case"NumpadAdd":R.zoomAt(1.25,R.vw/2,R.vh/2);break;
      case"Minus":case"NumpadSubtract":R.zoomAt(.8,R.vw/2,R.vh/2);break;
      default:if(e.key==="+")R.zoomAt(1.25,R.vw/2,R.vh/2);else if(e.key==="-")R.zoomAt(.8,R.vw/2,R.vh/2);
    }
  });
  window.addEventListener("keyup",e=>keys.delete(e.code));
  window.addEventListener("blur",()=>keys.clear());

  $("pauseBtn").addEventListener("click",()=>G.togglePause());
  $("speedBtn").addEventListener("click",()=>G.cycleSpeed());
  $("muteBtn").addEventListener("click",()=>{$("muteBtn").textContent=A.toggleMute()?"Muet":"Son";});
  $("helpBtn").addEventListener("click",openHelp); $("helpClose").addEventListener("click",closeHelp);
  $("spectateBtn").addEventListener("click",()=>$("deadModal").classList.add("hidden"));
  $("deadReplay").addEventListener("click",backToTitle); $("replayBtn").addEventListener("click",backToTitle);
  $("multiBtn").addEventListener("click",()=>{A.ac();A.sfx("click");$("multiModal").classList.remove("hidden");});
  $("multiClose").addEventListener("click",()=>$("multiModal").classList.add("hidden"));
  $("soloBtn").addEventListener("click",()=>startFromTitle("solo"));
  $("playerName").addEventListener("keydown",e=>{if(e.key==="Enter")startFromTitle("solo");});
  $("diffSeg").addEventListener("click",e=>{const b=e.target.closest("[data-diff]");if(!b)return;diffKey=b.dataset.diff;store.set("heartwood_diff",diffKey);document.querySelectorAll("#diffSeg [data-diff]").forEach(x=>x.classList.toggle("on",x===b));});
  $("tutNext").addEventListener("click",tutAdvance); $("tutSkip").addEventListener("click",()=>{A.sfx("click");endTutorial();});
}
function openHelp(){$("helpModal").classList.remove("hidden");G.modal=true;}
function closeHelp(){$("helpModal").classList.add("hidden");G.modal=false;}

// ---------- écrans ----------
let diffKey=store.get("heartwood_diff")||"normal"; if(!root.HW.DIFF[diffKey])diffKey="normal";
function showTitle(){
  $("titleScreen").classList.remove("hidden");
  document.querySelectorAll("#diffSeg [data-diff]").forEach(b=>b.classList.toggle("on",b.dataset.diff===diffKey));
  $("tutoChk").checked=!store.get("heartwood_tuto");
  let st=null; try{st=JSON.parse(store.get("heartwood_stats")||"null");}catch(e){}
  $("bestLine").textContent=st&&st.games?`${st.games} partie${st.games>1?"s":""} · ${st.wins} victoire${st.wins>1?"s":""} · meilleur rang : #${st.bestRank}`:"";
  const n=store.get("heartwood_name"); if(n&&!$("playerName").value)$("playerName").value=n;
}
function startFromTitle(mode){
  A.ac();
  const name=($("playerName").value.replace(/[<>&"'`]/g,"").trim()||"Vous").slice(0,14);
  store.set("heartwood_name",name);
  $("titleScreen").classList.add("hidden"); $("endScreen").classList.add("hidden"); $("deadModal").classList.add("hidden");
  $("toasts").innerHTML=""; $("logBox").innerHTML=""; $("side").classList.remove("collapsed"); setText("sideToggle","▼ Panneau");
  keys.clear(); drag=null; pinch=null; armedBreak=-1; R.sel=-1;
  G.start({name,diff:diffKey,mode});
  ["ctxPanel","dOffers","dRank","dEmp","phaseAction","expList","lbStrip"].forEach(id=>{const el=$(id);if(el)el._h=null;});
  buildArmyTab(); R.resize();
  R.cam.z=R.cam.tz=clamp(Math.max(Math.min(R.vw/(W*TS),R.vh/(H*TS))*1.5,1.4),R.cam.zmin,3);
  R.focusTile(me().capital); setTab("army"); refreshUI(true); A.sfx("ally");
  if($("tutoChk").checked)startTutorial(); else toast("Clique les cases autour de ta capitale pour t'étendre !","gold",5000);
}
function backToTitle(){$("endScreen").classList.add("hidden");$("deadModal").classList.add("hidden");endTutorial(true);G.stop();showTitle();}
function showDead(k){$("deadTxt").textContent=k?`${k.name} a pris ta capitale.`:"Le Gardien a dévoré ta capitale.";$("deadModal").classList.remove("hidden");}
function showEnd(d){
  const Eg=E(), p=me(); endTutorial(true); $("deadModal").classList.add("hidden");
  const w=Eg.players[d.winner], iWon=d.winner===p.id;
  $("endTitle").textContent=iWon?"TU AS CAPTURÉ LE CŒUR":d.kind==="domination"?(iWon?"DOMINATION TOTALE":`${w.name} RÈGNE SEUL`):`${w?w.name:"Personne"} REMPORTE LE CŒUR`;
  $("endTitle").style.color=iWon?"var(--gold)":"var(--red)";
  $("endSub").textContent=d.kind==="heart"?`${w.name} a tenu le Cœur jusqu'au bout. Un seul vainqueur.`:d.kind==="domination"?`${w.name} a éliminé tous les empires avant même l'éveil du Gardien.`:`Le Cœur n'a jamais été tenu assez longtemps : le #1 l'emporte.`;
  const list=Eg.rankedList(), myRank=list.indexOf(p)+1;
  let st=null; try{st=JSON.parse(store.get("heartwood_stats")||"null");}catch(e){}
  st=st||{games:0,wins:0,bestRank:99}; st.games++; if(iWon)st.wins++; st.bestRank=Math.min(st.bestRank,iWon?1:myRank); store.set("heartwood_stats",JSON.stringify(st));
  $("endRecord").textContent=`Ton rang final : #${iWon?1:myRank} · ${st.wins} victoire${st.wins>1?"s":""} sur ${st.games} partie${st.games>1?"s":""}`;
  $("rankTable").innerHTML="<tr><th>#</th><th>EMPIRE</th><th>TERRES</th><th>ARMÉE</th><th>DÉGÂTS GARDIEN</th><th>CŒUR TENU</th></tr>"+
    list.map((q,k)=>`<tr class="${q.id===p.id?"me":""} ${q.id===d.winner?"win":""}"><td>${q.id===d.winner?"🏆":k+1}</td><td>${sw(q.color)} ${q.name}${q.alive?"":' <span class="tag dead">†</span>'}</td><td>${(Eg.landPct(q)*100).toFixed(1)} %</td><td>${fmt(q.army)}</td><td>${fmt(q.bossDmg)}</td><td>${q.heartHeld?q.heartHeld.toFixed(0)+" s":"—"}</td></tr>`).join("");
  $("storyBox").innerHTML=`<div class="sect">RÉCIT DE TA PARTIE</div>`+Eg.story.map(s=>`<div><span class="t">${fmtTime(s.t)}</span> ${s.txt}</div>`).join("");
  $("endScreen").classList.remove("hidden"); A.sfx(iWon?"ally":"kill");
}

// ---------- tutoriel ----------
const TUT=[
  {txt:"Voici ta <b class='goldt'>capitale</b>. Si elle tombe, tu es éliminé. Ton armée grandit toute seule avec ton territoire.",tile:()=>me().capital},
  {txt:"Clique une case <b class='greent'>neutre voisine</b> : tu y envoies une partie de ton armée, qui conquiert case après case.",tile:()=>{const Eg=E(),p=me();let best=-1,bd=1e9;for(let i=0;i<W*H;i++){const tl=Eg.tiles[i];if(tl.o===-1&&Eg.isLand(i)&&Eg.isAdjOwned(i,p.id)){const d=root.HW.distC(i,Eg.center);if(d<bd){bd=d;best=i;}}}return best>=0?best:me().capital;}},
  {txt:"Ce curseur règle la <b>part de ton armée</b> envoyée à chaque clic. Ce qui part ne défend plus chez toi.",el:()=>{setTab("army");return $("pctSlider");}},
  {txt:"Le classement compte les <b class='goldt'>% de terres</b>. Le <b>#1</b> à 15:00 pourra invoquer le Gardien… mais tout le monde le sait.",el:()=>$("lbStrip")},
  {txt:"Dans l'onglet <b class='tealt'>Diplo</b>, allie-toi, offre du pouvoir, ou trahis. Quand le Cœur apparaîtra, toutes les alliances tomberont.",el:()=>document.querySelector('#tabs [data-tab="diplo"]')},
  {txt:"<b class='redt'>15:00</b> : le Gardien s'éveille sur l'Arbre. Une fois vaincu, le Cœur apparaît : tiens-le 30 secondes pour gagner. Bonne chance !",el:()=>$("timerBox")},
];
function startTutorial(){$("side").classList.remove("collapsed");G.tut={step:0,tile:-1,el:null};$("tutRing").classList.remove("hidden");$("tutBox").classList.remove("hidden");showTutStep();}
function showTutStep(){
  const t=G.tut,s=TUT[t.step];
  if(s.tile){t.tile=s.tile();t.el=null;R.cam.z=R.cam.tz=clamp(2.2,R.cam.zmin,R.cam.zmax);R.focusTile(t.tile);}else{t.tile=-1;t.el=s.el();}
  $("tutStep").textContent=`TUTORIEL · ${t.step+1}/${TUT.length}`; $("tutTxt").innerHTML=s.txt;
  $("tutNext").textContent=t.step===TUT.length-1?"C'est parti !":"Suivant"; positionTut();
}
function tutAdvance(){if(!G.tut)return;A.sfx("click");if(++G.tut.step>=TUT.length)endTutorial();else showTutStep();}
function endTutorial(silent){
  if(!G.tut)return; G.tut=null;
  $("tutRing").classList.add("hidden"); $("tutBox").classList.add("hidden"); store.set("heartwood_tuto","1");
  if(!silent){R.focusTile(me().capital);toast("À toi de jouer : conquiers les cases autour de ta capitale !","gold",5000);}
}
function positionTut(){
  const t=G.tut; if(!t)return; let r;
  if(t.tile>=0){const cr=R.cv.getBoundingClientRect(),sz=TS*R.cam.z;r={x:cr.left+((t.tile%W)*TS-R.cam.x)*R.cam.z-6,y:cr.top+(((t.tile/W)|0)*TS-R.cam.y)*R.cam.z-6,w:sz+12,h:sz+12};}
  else if(t.el){const b=t.el.getBoundingClientRect();r={x:b.left-4,y:b.top-4,w:b.width+8,h:b.height+8};}else return;
  const ring=$("tutRing").style; ring.left=r.x+"px";ring.top=r.y+"px";ring.width=r.w+"px";ring.height=r.h+"px";
  const box=$("tutBox"),bw=box.offsetWidth,bh=box.offsetHeight;
  let y=r.y+r.h+12; if(y+bh>innerHeight-8)y=Math.max(8,r.y-bh-12);
  box.style.left=clamp(r.x+r.w/2-bw/2,8,innerWidth-bw-8)+"px"; box.style.top=y+"px";
}

function init(g){G=g;bindInputs();showTitle();}
function frame(){ // appelé à chaque image par main.js
  R.hover=mouse.inside?R.screenToTile(mouse.x,mouse.y):-1;
  updateTip(); if(G.tut)positionTut();
}
root.HWUI={init,onEvent,refreshUI,frame,keys,get dragging(){return !!(drag&&drag.moved);},toast,logMsg,showTitle};
})(window);
