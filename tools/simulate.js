#!/usr/bin/env node
"use strict";
/* Simulation sans interface : joue N parties complètes entre bots
   (le joueur humain est remplacé par un bot) et affiche des statistiques
   pour équilibrer le jeu.  Usage : node tools/simulate.js [nbParties] [seed] */
const path=require("path");
require(path.join(__dirname,"../js/util.js"));
require(path.join(__dirname,"../js/engine.js"));
require(path.join(__dirname,"../js/bots.js"));
const {Engine,Bots,GAME_LEN}=globalThis.HW;
const N=+process.argv[2]||5, seed0=+process.argv[3]||1;
const verbose=process.argv.includes("-v");
let stats={heart:0,domination:0,timeout:0,bossKilled:0,bossTimeout:0,dur:[],alive15:[],top15:[],neutralAt:[],attackers:[]};
for(let g=0;g<N;g++){
  const E=new Engine({seed:seed0+g,diff:"normal"});
  E.players[0].bot=true; E.players[0].pers="expander"; E.localPid=99; // aucun humain
  const bots=new Bots(E);
  let bossKilled=false, printed={};
  E.on((type,d)=>{
    if(type==="log"&&verbose&&/lg-war|lg-gold/.test(d.cls||""))console.log(`  [${Math.floor(d.t/60)}:${String(Math.floor(d.t%60)).padStart(2,"0")}] ${d.txt}`);
    if(type==="log"&&/GARDIEN TOMBE/.test(d.txt))bossKilled=true;
  });
  const dt=.25; let guard=0;
  while(E.phase!=="over"&&guard++<20000){
    E.step(dt); bots.step(dt);
    const m=Math.floor(E.time/60);
    if(verbose&&E.time%60<dt&&!printed[m]){printed[m]=1;
      const r=E.rankedList().slice(0,4).map(p=>`${p.name} ${Math.round(E.landPct(p)*100)}%/${Math.round(p.army)}`).join(" · ");
      let neutral=0;for(const t of E.tiles)if(t.o===-1&&globalThis.HW.isLandT(t.t))neutral++;
      console.log(`  ${m}:00  vivants=${E.alivePlayers().length} neutre=${neutral} | ${r}`);}
    if(E.time>=GAME_LEN&&E.time<GAME_LEN+dt){
      stats.alive15.push(E.alivePlayers().length);
      const r1=E.rankedList()[0]; stats.top15.push(Math.round(E.landPct(r1)*100));
      let neutral=0;for(const t of E.tiles)if(t.o===-1&&globalThis.HW.isLandT(t.t))neutral++; stats.neutralAt.push(neutral);
    }
  }
  stats[E.endKind]=(stats[E.endKind]||0)+1;
  if(E.boss){if(bossKilled)stats.bossKilled++;else stats.bossTimeout++;stats.attackers.push(E.boss.attackers.size);}
  stats.dur.push(Math.round(E.time));
  const w=E.players[E.winner];
  console.log(`Partie ${g+1} (seed ${seed0+g}) : fin=${E.endKind} à ${Math.floor(E.time/60)}:${String(Math.floor(E.time%60)).padStart(2,"0")} gagnant=${w?w.name:"-"} boss=${E.boss?`${bossKilled?"tué":"retiré"} hp=${Math.round(E.boss.maxHp)} attaquants=${E.boss.attackers.size}`:"jamais"}`);
}
const avg=a=>a.length?(a.reduce((s,x)=>s+x,0)/a.length).toFixed(1):"-";
console.log(`\nRésumé sur ${N} parties : cœur=${stats.heart} domination=${stats.domination} timeout=${stats.timeout} | boss tué=${stats.bossKilled} retiré=${stats.bossTimeout} attaquants moy=${avg(stats.attackers)}`);
console.log(`À 15:00 : vivants moy=${avg(stats.alive15)} part du #1 moy=${avg(stats.top15)}% cases neutres restantes moy=${avg(stats.neutralAt)} | durée moy=${avg(stats.dur)} s`);
