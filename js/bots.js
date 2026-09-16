"use strict";
/* ============================================================
   HEARTWOOD — intelligence des bots (sans DOM)
   ------------------------------------------------------------
   Les bots ne touchent jamais l'état directement : ils lisent
   l'état et envoient des ordres via engine.applyOrder, exactement
   comme un joueur humain (ou un client distant, plus tard).
   ============================================================ */
(function(root){
const {W,H,T,NB,distC,isLandT,COST}=root.HW;
const {clamp}=root.HWU;

const PCT={warlord:60,expander:40,schemer:50,diplomat:35};

class Bots{
  constructor(engine){this.E=engine;}
  step(dt){
    const E=this.E; if(E.phase==="over")return;
    for(const p of E.players){
      if(!p.bot||!p.alive)continue;
      p.aiAcc+=dt;
      while(p.aiAcc>=2){p.aiAcc-=2;this.act(p);if(E.phase==="over")return;}
    }
  }
  act(p){
    const E=this.E;
    if(E.phase==="summon"&&E.summoner===p.id&&E.time>=E.summonAt-1){E.applyOrder({type:"summon",pid:p.id});return;}
    if(E.phase==="boss")this.bossAct(p);
    else if(E.phase==="heart"){this.heartAct(p);return;}
    this.expand(p);
    if(E.time>p.atkCd)this.attack(p);
    if(E.time>p.dipCd)this.diplo(p);
    this.abilities(p);
  }
  // une case neutre voisine, en privilégiant les racines et la proximité de la capitale
  bestNeutral(p){
    const E=this.E; let best=-1,bs=-1e9;
    for(let i=0;i<W*H;i++){
      const tl=E.tiles[i];
      if(tl.o!==-1||!isLandT(tl.t)||!E.isAdjOwned(i,p.id))continue;
      const s=(tl.t===T.ROOT?6:0)+(tl.t===T.PLAIN?2:tl.t===T.FOREST?1:0)-distC(i,p.capital)*.08+E.R.rnd(.8);
      if(s>bs){bs=s;best=i;}
    }
    return best;
  }
  expand(p){
    const E=this.E;
    if(E.time<p.expandCd||p.army<12)return;
    const i=this.bestNeutral(p); if(i<0){p.expandCd=E.time+6;return;}
    const pct=p.pers==="expander"?45:30;
    E.applyOrder({type:"attack",pid:p.id,tile:i,pct});
    p.expandCd=E.time+(p.pers==="expander"?3:5);
  }
  // choisir une case ennemie frontalière ; score = faiblesse de la cible, rancune, chasse au #1
  attack(p){
    const E=this.E, aggr=E.diff.aggr;
    p.atkCd=E.time+E.R.rnd(10,22)/aggr;
    const busy=E.exps.filter(e=>e.alive&&e.owner===p.id&&e.target>=0).length;
    if(busy>=2||p.army<40||E.truceActive())return;
    const r1=E.players[E.rank1];
    let best=-1,bs=-1e9,bestD=null;
    for(let i=0;i<W*H;i++){
      const tl=E.tiles[i]; if(tl.o<0||tl.o===p.id||!isLandT(tl.t))continue;
      const d=E.players[tl.o];
      if(!d.alive||p.allies.has(d.id)||(d.id===E.localPid&&E.truceActive())||!E.isAdjOwned(i,p.id))continue;
      const g=E.garrison(d,i);
      let s=(p.army*.5)/Math.max(g,1)*3;           // rapport de force local
      s-=(p.rel[d.id]??0)*.06;                      // rancune → plus probable
      s+=Math.max(0,60-d.army)*.12;                 // proie affaiblie : on achève
      if(E.time-d.lastHit<15&&d.lastAttacker!==p.id)s+=2; // déjà attaqué par un autre : curée
      if(E.coalition&&r1&&!p.allies.has(r1.id)){ if(d.id===r1.id)s+=6+E.landPct(r1)*20; else s-=3; } // chasse au #1
      if(p.pers==="warlord")s+=1.5;
      if(d.id===E.localPid)s+=(aggr-.8)*2;
      if(i===d.capital)s+=g<p.army*.45?10:-20;
      s-=distC(i,p.capital)*.02;
      if(s>bs){bs=s;best=i;bestD=d;}
    }
    if(p.army>=E.armyCap(p)*.95)bs+=2;
    if(best<0||bs<2.5)return;
    let pct=PCT[p.pers]*aggr; if(E.time-p.lastHit<20)pct*=.7; // on garde des troupes si on est attaqué
    pct=clamp(Math.round(pct),20,80);
    const need=E.avgGarrison(bestD)*10;
    if(p.army*pct/100<need)return;
    if(p.power>=COST.rally&&pct>=50&&E.R.chance(.5))E.applyOrder({type:"rally",pid:p.id});
    E.applyOrder({type:"attack",pid:p.id,tile:best,pct});
  }
  diplo(p){
    const E=this.E, R=E.R;
    p.dipCd=E.time+R.rnd(30,60);
    if(E.phase==="heart")return;
    const me=E.me(), r1=E.players[E.rank1];
    // proposer au joueur humain
    if(me&&me.alive&&!p.allies.has(me.id)&&(p.rel[me.id]??0)>25&&E.time-me.betrayT>180&&R.chance(p.pers==="diplomat"?.5:.3)&&E.landPct(me)<.25)
      E.sendOffer(p.id,me.id,"alliance",null,`${p.name} propose une alliance militaire.`);
    // coalition contre le #1
    if(E.coalition&&r1&&r1.id!==p.id&&!p.allies.has(r1.id)&&R.chance(.6)){
      const o=R.pick(E.players.filter(q=>q.alive&&q.id!==p.id&&q.id!==r1.id&&!q.allies.has(r1.id)&&!p.allies.has(q.id)));
      if(o){
        if(o.bot){if(p.power>=COST.ally&&E.R.chance(.7))E.applyOrder({type:"ally",pid:p.id,to:o.id});}
        else if(E.time-o.betrayT>180)E.sendOffer(p.id,o.id,"coalition",null,`${p.name} propose une coalition contre ${r1.name} (#1).`);
      }
    }
    // alliance ordinaire entre bots
    if(R.chance(p.pers==="diplomat"?.5:.25)&&p.power>=COST.ally){
      const o=R.pick(E.players.filter(q=>q.bot&&q.alive&&q.id!==p.id&&!p.allies.has(q.id)));
      if(o&&(p.rel[o.id]??0)>10)E.applyOrder({type:"ally",pid:p.id,to:o.id});
    }
    // le fourbe trahit un allié bien plus faible que lui
    if(p.pers==="schemer"&&p.allies.size&&R.chance(.15)){
      const tgt=E.players[R.pick([...p.allies])];
      if(tgt&&tgt.alive&&p.army>tgt.army*2&&!(tgt.id===E.localPid&&E.truceActive())){
        E.applyOrder({type:"betray",pid:p.id,to:tgt.id});
        p.atkCd=0;
      }
    }
    // aide à un allié attaqué
    if(p.allies.size&&p.power>80&&R.chance(.4)){
      const a=E.players[R.pick([...p.allies])];
      if(a&&a.alive&&E.time-a.lastHit<30)E.applyOrder({type:"gift",pid:p.id,to:a.id,amount:30});
    }
  }
  abilities(p){
    const E=this.E;
    if(p.power>=COST.fortify+20&&E.time-p.lastHit<40){
      // fortifier une case frontalière proche de la capitale
      let best=-1,bd=1e9;
      for(let i=0;i<W*H;i++){
        const tl=E.tiles[i]; if(tl.o!==p.id||tl.fort)continue;
        let border=false; for(const n of NB[i]){const o=E.tiles[n].o;if(o>=0&&o!==p.id&&!p.allies.has(o)){border=true;break;}}
        if(!border)continue;
        const d=distC(i,p.capital); if(d<bd){bd=d;best=i;}
      }
      if(best>=0)E.applyOrder({type:"fortify",pid:p.id,tile:best});
    }
  }
  bossAct(p){
    const E=this.E, R=E.R, b=E.boss;
    if(E.time<p.bossCd)return;
    const s=E.players[E.summoner];
    const isSummoner=E.summoner===p.id, allied=s&&p.allies.has(s.id);
    let pct=0;
    if(isSummoner)pct=55;
    else if(allied)pct=45;
    else if(p.joinedBoss)pct=35;
    else{
      // rejoindre ? plus le Gardien est bas, plus c'est tentant (coup de grâce)
      const low=1-b.hp/b.maxHp;
      const base={warlord:.35,expander:.25,diplomat:.3,schemer:.12}[p.pers]+low*.5;
      if(R.chance(base))pct=p.pers==="schemer"?60:40;
    }
    if(pct&&p.army*pct/100>=10){
      if(p.power>=COST.rally&&R.chance(.6))E.applyOrder({type:"rally",pid:p.id});
      E.applyOrder({type:"sendBoss",pid:p.id,pct});
    }
    p.bossCd=E.time+R.rnd(6,10);
  }
  heartAct(p){
    const E=this.E, R=E.R, h=E.heart;
    if(E.time<p.bossCd)return;
    p.bossCd=E.time+R.rnd(8,14);
    if(h.holder===p.id){ if(h.garrison<p.army*.5&&p.army>30)E.applyOrder({type:"sendHeart",pid:p.id,pct:40}); return; }
    const need=h.holder>=0?h.garrison*1.6+5:5;
    const pct=p.pers==="schemer"?85:65;
    if(p.army*pct/100>=need||h.holder<0){E.applyOrder({type:"sendHeart",pid:p.id,pct});return;}
    // pas assez pour prendre le Cœur : mordre un voisin affaibli
    if(p.army>40){p.atkCd=0;this.attack(p);}
  }
}
root.HW.Bots=Bots;
})(typeof window!=="undefined"?window:globalThis);
