"use strict";
/* ============================================================
   HEARTWOOD — moteur de jeu (sans DOM)
   ------------------------------------------------------------
   Tout l'état de la partie et toutes les règles vivent ici.
   L'interface (ui.js / render.js) ne fait que lire l'état et
   envoyer des ORDRES via engine.applyOrder(...).
   Les bots (bots.js) passent par le même chemin.
   → C'est ce qui permettra le multijoueur : le serveur fera
     tourner ce moteur et recevra les ordres des clients.
   ============================================================ */
(function(root){
const {clamp,makeRng,fmtTime}=root.HWU;

// ---------- constantes ----------
const W=64, H=48, TS=16;
const T={WATER:0,PLAIN:1,FOREST:2,MTN:3,TREE:4,ROOT:5,CORRUPT:6};
const TERR_NAMES=["Eau","Plaine","Forêt","Montagne","Arbre-Monde","Racine","Terre corrompue"];
const GAME_LEN=900;        // 15:00 → réveil du Gardien
const SUMMON_WAIT=12;      // délai laissé au #1 humain pour invoquer
const BOSS_MAX=180;        // durée max du combat contre le Gardien
const HEART_LEN=30;        // fenêtre de capture du Cœur
const HEART_EXT=8;         // prolongation quand le Cœur change de mains
const HEART_MAX=75;        // durée absolue max de la phase du Cœur
const N_PLAYERS=12;
const COST={fortify:30,rally:60,ally:20};
const RALLY_LEN=20, RALLY_MUL=1.4;
const POWER_MAX=300;

const DIFF={
  facile:   {label:"Facile",   truce:120, aggr:.75, grow:.85},
  normal:   {label:"Normal",   truce:90,  aggr:1,   grow:1},
  difficile:{label:"Difficile",truce:45,  aggr:1.3, grow:1.15},
};
const BOT_DEFS=[
  {name:"Korr",    color:"#c65b3f", pers:"warlord"},
  {name:"Vessa",   color:"#4f9e8f", pers:"diplomat"},
  {name:"Bramble", color:"#c98a3d", pers:"expander"},
  {name:"Sylth",   color:"#7f9e4a", pers:"schemer"},
  {name:"Ithar",   color:"#8d5f7f", pers:"warlord"},
  {name:"Moss",    color:"#5f8fb8", pers:"expander"},
  {name:"Dorn",    color:"#b85f8a", pers:"diplomat"},
  {name:"Ravel",   color:"#a0a24a", pers:"schemer"},
  {name:"Nyx",     color:"#6d6fb0", pers:"warlord"},
  {name:"Oakmund", color:"#b07a4a", pers:"expander"},
  {name:"Torvin",  color:"#4aa0a0", pers:"diplomat"},
];
const PERS_TXT={warlord:"belliqueux",diplomat:"diplomate",expander:"expansionniste",schemer:"fourbe"};

const NB=[];
for(let i=0;i<W*H;i++){const x=i%W,y=(i/W)|0,a=[];if(x>0)a.push(i-1);if(x<W-1)a.push(i+1);if(y>0)a.push(i-W);if(y<H-1)a.push(i+W);NB.push(a);}
const idx=(x,y)=>y*W+x;
const distC=(i,j)=>{const dx=(i%W)-(j%W),dy=((i/W)|0)-((j/W)|0);return Math.hypot(dx,dy);};
const isLandT=t=>t===T.PLAIN||t===T.FOREST||t===T.MTN||t===T.ROOT;
const worldCenter=i=>[(i%W)*TS+8,((i/W)|0)*TS+8];

// ---------- bruit de valeur pour la carte ----------
function vnoiseGrid(w,h,R){const g=new Float32Array(w*h);for(let i=0;i<w*h;i++)g[i]=R.r();return g;}
function vnoise(g,w,h,x,y){
  const xi=Math.floor(x),yi=Math.floor(y),fx=x-xi,fy=y-yi;
  const s=(a,b)=>g[((b%h+h)%h)*w+((a%w+w)%w)];
  const u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy);
  return s(xi,yi)*(1-u)*(1-v)+s(xi+1,yi)*u*(1-v)+s(xi,yi+1)*(1-u)*v+s(xi+1,yi+1)*u*v;
}

class Engine{
  constructor(opts){
    this.opts=opts;
    this.R=makeRng(opts.seed||((Math.random()*1e9)|0));
    this.listeners=[]; if(opts.listener)this.on(opts.listener);
    this.diff=DIFF[opts.diff]||DIFF.normal;
    this.localPid=0;
    this.newGame();
  }
  on(fn){this.listeners.push(fn);}
  emit(type,data){for(const fn of this.listeners)fn(type,data);}
  log(txt,cls,story){this.emit("log",{txt,cls,t:this.time});if(story)this.story.push({t:this.time,txt});}
  toast(txt,cls,ms,tile){this.emit("toast",{txt,cls,ms,tile});}
  sfx(k){this.emit("sfx",k);}
  me(){return this.players[this.localPid];}

  // ---------- nouvelle partie ----------
  newGame(){
    const R=this.R;
    const humans=this.opts.humans||[{name:"Vous"}];
    this.players=[];
    for(const h of humans)this.players.push(this.mkPlayer(this.players.length,h.name,h.color||"#f2cf5b",false,null));
    const defs=BOT_DEFS.slice(0,N_PLAYERS-this.players.length);
    for(const d of defs)this.players.push(this.mkPlayer(this.players.length,d.name,d.color,true,d.pers));
    for(const p of this.players)for(const q of this.players)if(p!==q)p.rel[q.id]=R.ri(-10,20);
    this.time=0; this.phase="play"; this.truce=this.diff.truce;
    this.tiles=[]; this.exps=[]; this.marches=[]; this.offers=[]; this.oid=1; this.eid=1;
    this.boss=null; this.heart=null; this.summoner=-1; this.summonAt=0; this.winner=-1; this.endKind="";
    this.story=[]; this.rank1=-1; this.coalition=false; this.coalitionTarget=-1; this.econAcc=0;
    this.center=idx(W/2|0,H/2|0);
    this.treeTiles=[]; this.flags={warn5:false,warn1:false,truceWarned:false,tree5:false,tree10:false,tree13:false,tree14:false,tree1430:false};
    this.genMap();
    this.landTotal=0; for(let i=0;i<W*H;i++)if(isLandT(this.tiles[i].t))this.landTotal++;
    this.computeRanks();
    this.log(`Douze empires autour de l'Arbre-Monde. Dans 15 minutes, le Gardien s'éveille.`,"lg-gold",true);
    this.log(`Trêve de ${fmtTime(this.truce)} : personne ne peut t'attaquer d'ici là.`,"lg-dip");
  }
  mkPlayer(id,name,color,bot,pers){
    const R=this.R;
    return {id,name,color,bot,pers,alive:true,army:16,power:20,tiles:0,capital:-1,rel:{},allies:new Set(),
      betrayT:-999,lastHit:-99,lastAttacker:-1,bossDmg:0,roots:0,atkPct:50,rallyUntil:0,rank:0,eliminatedAt:null,finalTiles:0,
      sentBoss:0,sentHeart:0,heartHeld:0,
      atkCd:R.rnd(20,40),dipCd:R.rnd(40,80),aiAcc:R.rnd(0,2),expandCd:0,bossCd:0,joinedBoss:false};
  }

  // ---------- carte ----------
  genMap(){
    const R=this.R, tiles=this.tiles, cx=W/2, cy=H/2;
    const n1=vnoiseGrid(16,12,R), n2=vnoiseGrid(16,12,R);
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      let h=vnoise(n1,16,12,x/7,y/7)*.62+vnoise(n2,16,12,x/2.6,y/2.6)*.38;
      const dx=(x-cx)/(W/2),dy=(y-cy)/(H/2);
      const rr=Math.hypot(dx,dy); h-=Math.max(0,rr-.68)*2.2; // grande île, côte irrégulière
      let t=h<.33?T.WATER:h<.56?T.PLAIN:h<.72?T.FOREST:T.MTN;
      const dv=Math.hypot((x-cx+.5),(y-cy+.5));
      if(dv<7.5&&t===T.WATER)t=T.PLAIN;
      if(dv<7.5&&t===T.MTN)t=T.FOREST;
      tiles[idx(x,y)]={t,o:-1,fort:0};
    }
    // l'Arbre : bloc 3x3 au centre
    const c0=this.center;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const i=c0+dx+dy*W;tiles[i].t=T.TREE;this.treeTiles.push(i);}
    // racines : 8 rayons de 2 à 5 cases
    for(let k=0;k<8;k++){
      const a=k/8*Math.PI*2+R.rnd(-.15,.15);
      for(let r=2;r<=5;r++){
        const x=Math.round(W/2+Math.cos(a)*r), y=Math.round(H/2+Math.sin(a)*r*.9);
        const tl=tiles[idx(x,y)]; if(tl.t!==T.TREE)tl.t=T.ROOT;
      }
    }
    // capitales sur un anneau
    const off=R.rnd(0,Math.PI*2), n=this.players.length;
    for(let k=0;k<n;k++){
      const a=off+k/n*Math.PI*2+R.rnd(-.08,.08);
      let sx=Math.round(cx+Math.cos(a)*(W/2-9)), sy=Math.round(cy+Math.sin(a)*(H/2-7));
      sx=clamp(sx,3,W-4); sy=clamp(sy,3,H-4);
      outer: for(let r=0;r<5;r++)for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
        const nx=clamp(sx+dx,3,W-4),ny=clamp(sy+dy,3,H-4);
        if(tiles[idx(nx,ny)].t===T.PLAIN){sx=nx;sy=ny;break outer;}
      }
      // pont de terre garanti vers le centre
      const steps=Math.ceil(Math.hypot(cx-sx,cy-sy));
      for(let s=0;s<=steps;s++){
        const lx=Math.round(sx+(cx-sx)*s/steps), ly=Math.round(sy+(cy-sy)*s/steps);
        if(Math.hypot(lx-cx,ly-cy)<2.5)break;
        for(const [ox,oy] of [[0,0],[1,0],[0,1]]){const tl=tiles[idx(clamp(lx+ox,0,W-1),clamp(ly+oy,0,H-1))]; if(tl.t===T.WATER)tl.t=T.PLAIN;}
      }
      const p=this.players[k], ci=idx(sx,sy);
      p.capital=ci;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const t2=tiles[idx(sx+dx,sy+dy)];
        if(!isLandT(t2.t)||t2.t===T.MTN)t2.t=T.PLAIN;
        t2.o=k;
      }
      p.tiles=9;
    }
  }

  // ---------- accès ----------
  isLand(i){return isLandT(this.tiles[i].t);}
  isAdjOwned(i,pid){const n=NB[i];for(let k=0;k<n.length;k++)if(this.tiles[n[k]].o===pid)return true;return false;}
  landPct(p){return (p.alive?p.tiles:p.finalTiles)/this.landTotal;}
  alivePlayers(){return this.players.filter(p=>p.alive);}
  truceActive(){return this.time<this.truce;}
  canFight(){return this.phase==="play"||this.phase==="summon"||this.phase==="boss"||this.phase==="heart";}
  armyCap(p){return 30+8*Math.sqrt(p.tiles)+p.tiles*.8;}
  growth(p){return (0.3+0.35*Math.sqrt(p.tiles))*(p.bot?this.diff.grow:1);}
  powerRate(p){return 0.6+p.tiles*0.015+p.roots*0.35;}
  rallyOn(p){return this.time<p.rallyUntil;}
  defMul(i){const tl=this.tiles[i];let m=tl.t===T.MTN?1.8:tl.t===T.FOREST?1.3:1;if(tl.fort)m*=2;return m;}
  // garnison qu'il faut vaincre pour prendre cette case
  garrison(d,i){
    const g=d.army/Math.max(d.tiles,1)*this.defMul(i);
    if(i===d.capital)return Math.max(g*4,d.army*.5,25+d.tiles*.6);
    return g;
  }
  // coût estimé (en soldats) d'une case ennemie moyenne — pour l'IA et l'affichage
  avgGarrison(d){return d.army/Math.max(d.tiles,1);}
  expRate(troops){return Math.min(8,1.2+Math.sqrt(Math.max(troops,0))*.3);}
  // rang #1 vivant
  computeRanks(){
    const sorted=this.players.filter(p=>p.alive).sort((a,b)=>b.tiles-a.tiles||b.army-a.army);
    sorted.forEach((p,k)=>p.rank=k+1);
    const r1=sorted[0]?sorted[0].id:-1;
    if(r1!==this.rank1&&r1>=0&&this.time>=60&&sorted[0]&&this.landPct(sorted[0])>=.08){
      this.rank1=r1;
      const p=this.players[r1];
      this.log(`${p.name} devient #1 (${Math.round(this.landPct(p)*100)} % des terres).`,"lg-gold",true);
      if(r1===this.localPid)this.toast("Tu es #1 ! Tout le monde le sait…","gold",4000);
    }else this.rank1=r1;
    return sorted;
  }
  rankedList(){return this.players.slice().sort((a,b)=>(a.alive!==b.alive)?(a.alive?-1:1):a.alive?(a.rank-b.rank):(b.finalTiles-a.finalTiles||(b.eliminatedAt??0)-(a.eliminatedAt??0)));}

  // ---------- ordres ----------
  applyOrder(o){
    const p=this.players[o.pid]; if(!p)return false;
    switch(o.type){
      case "attack": return this.orderAttack(p,o.tile,o.pct);
      case "setPct": p.atkPct=clamp(Math.round(o.pct),10,100); return true;
      case "fortify": return this.orderFortify(p,o.tile);
      case "rally": return this.orderRally(p);
      case "gift": return this.orderGift(p,o.to,o.amount);
      case "ally": return this.orderAlly(p,o.to);
      case "break": return this.orderBreak(p,o.to,false);
      case "betray": return this.orderBreak(p,o.to,true);
      case "offer": return this.orderOffer(p,o.id,o.accept);
      case "summon": return this.orderSummon(p);
      case "sendBoss": return this.orderSend(p,"boss",o.pct);
      case "sendHeart": return this.orderSend(p,"heart",o.pct);
      case "recall": {const e=this.exps.find(x=>x.id===o.id&&x.owner===p.id&&x.alive); if(!e)return false; this.endExp(e); if(p.id===this.localPid)this.sfx("click"); return true;}
    }
    return false;
  }
  fail(p,msg){if(p.id===this.localPid){this.sfx("err");this.toast(msg,"red");}return false;}

  orderAttack(p,i,pct){
    if(!p.alive||!this.canFight()||i<0||i>=W*H)return false;
    const tl=this.tiles[i];
    if(!this.isLand(i))return this.fail(p,"On ne peut pas conquérir cette case.");
    if(tl.o===p.id)return this.fail(p,"C'est déjà ton territoire.");
    if(!this.isAdjOwned(i,p.id))return this.fail(p,"Pas de frontière commune : étends-toi jusqu'ici.");
    const d=tl.o>=0?this.players[tl.o]:null;
    if(d){
      if(!d.alive)return false;
      if(p.allies.has(d.id))return this.fail(p,"C'est un allié ! Romps le pacte (ou trahis-le) dans l'onglet Diplo.");
      if(this.truceActive())return this.fail(p,`Trêve : aucune attaque avant ${fmtTime(this.truce-this.time)}.`);
    }
    pct=clamp(pct||p.atkPct,10,100);
    const troops=Math.floor(p.army*pct/100);
    if(troops<5)return this.fail(p,"Pas assez de soldats (5 minimum).");
    p.army-=troops;
    const target=d?d.id:-1;
    let ex=this.exps.find(e=>e.owner===p.id&&e.target===target&&e.alive);
    if(ex){ex.troops+=troops;ex.front.push(i);}
    else{ex={id:this.eid++,owner:p.id,target,troops,front:[i],acc:0,alive:true,captured:0,seed:i};this.exps.push(ex);}
    if(d){
      d.lastHit=this.time; d.lastAttacker=p.id; this.addRel(d.id,p.id,-25);
      if(p.id===this.localPid){this.sfx("war");this.log(`Tu lances ${troops} soldats contre ${d.name}.`,"lg-war");
        for(const q of this.players)if(q.bot&&q.alive&&q.id!==d.id&&q.allies.has(d.id))this.addRel(q.id,p.id,-10);}
      else if(d.id===this.localPid){this.sfx("war");this.emit("ping",{i,c:"#ff5a3c"});
        this.toast(`${p.name} t'attaque avec ${troops} soldats !`,"red",4500,i);this.log(`${p.name} t'attaque (${troops} soldats).`,"lg-war",true);}
    }else if(p.id===this.localPid)this.sfx("march");
    this.emit("expLaunch",{ex,i});
    return true;
  }
  orderFortify(p,i){
    if(!p.alive||i<0)return false;
    const tl=this.tiles[i];
    if(tl.o!==p.id)return this.fail(p,"Fortifie une case de ton territoire.");
    if(tl.fort)return this.fail(p,"Déjà fortifiée.");
    if(p.power<COST.fortify)return this.fail(p,`Il faut ${COST.fortify} ⚡ pour fortifier.`);
    p.power-=COST.fortify; tl.fort=1; this.emit("tile",i);
    if(p.id===this.localPid){this.sfx("build");this.emit("float",{i,txt:"Fortifié",c:"#b9d389"});}
    return true;
  }
  orderRally(p){
    if(!p.alive)return false;
    if(this.rallyOn(p))return this.fail(p,"Ralliement déjà actif.");
    if(p.power<COST.rally)return this.fail(p,`Il faut ${COST.rally} ⚡.`);
    p.power-=COST.rally; p.rallyUntil=this.time+RALLY_LEN;
    if(p.id===this.localPid){this.sfx("rally");this.toast(`Ralliement : +40 % d'attaque pendant ${RALLY_LEN} s !`,"gold");}
    return true;
  }
  orderGift(p,to,amount){
    const q=this.players[to]; if(!p.alive||!q||!q.alive||q===p)return false;
    amount=Math.floor(clamp(amount||25,1,p.power));
    if(amount<1)return this.fail(p,"Pas de pouvoir à offrir.");
    p.power-=amount; q.power=Math.min(POWER_MAX,q.power+amount);
    this.addRel(q.id,p.id,Math.round(amount/4)+4);
    if(p.id===this.localPid){this.sfx("coin");this.log(`Tu offres ${amount} ⚡ à ${q.name}.`,"lg-dip");this.toast(`${q.name} apprécie ton cadeau.`,"green");}
    else if(q.id===this.localPid){this.toast(`${p.name} t'offre ${amount} ⚡ !`,"green");}
    return true;
  }
  orderAlly(p,to){
    const q=this.players[to]; if(!p.alive||!q||!q.alive||q===p||p.allies.has(q.id))return false;
    if(this.phase==="heart")return this.fail(p,"Plus d'alliances : le Cœur est apparu.");
    if(p.power<COST.ally)return this.fail(p,`Une proposition coûte ${COST.ally} ⚡.`);
    p.power-=COST.ally;
    if(!q.bot){ // proposition à un humain : passe par une offre
      this.sendOffer(p.id,q.id,"alliance",null,`${p.name} propose une alliance militaire.`);
      return true;
    }
    if(this.botAcceptsAlliance(q,p)){this.makeAlliance(p.id,q.id);}
    else{
      this.addRel(q.id,p.id,-3);
      if(p.id===this.localPid){
        const why=this.time-p.betrayT<180?"Personne ne s'allie à un traître.":this.landPct(p)>.22?"Tu es trop puissant : on se méfie de toi.":q.rel[p.id]<0?"Il ne t'aime pas. Offre-lui du pouvoir d'abord ?":"Il hésite. Réessaie plus tard ou offre-lui du pouvoir.";
        this.log(`${q.name} décline ton alliance.`,"lg-dip");this.toast(`${q.name} refuse. ${why}`,"red",4500);this.sfx("err");
      }
    }
    return true;
  }
  botAcceptsAlliance(q,p){
    if(this.time-p.betrayT<180)return false;
    let prob=.25+(q.rel[p.id]??0)/150+(q.pers==="diplomat"?.2:q.pers==="warlord"?-.1:0);
    if(this.time-q.lastHit<60&&q.lastAttacker===p.id)prob-=.5;
    const share=this.landPct(p);
    if(share>.22)prob-=.35; if(share>.3)prob-=.3;
    if(q.allies.size>=3)prob-=.3;
    if(this.time-q.lastHit<30)prob+=.15; // il a besoin d'aide
    return this.R.chance(clamp(prob,0,.95));
  }
  orderBreak(p,to,betrayal){
    const q=this.players[to]; if(!p.alive||!q||!p.allies.has(q.id))return false;
    if(betrayal&&this.truceActive())return this.fail(p,"Pas de trahison pendant la trêve.");
    this.breakAlliance(p.id,q.id,betrayal);
    return true;
  }
  orderOffer(p,id,accept){
    const o=this.offers.find(x=>x.id===id&&x.to===p.id); if(!o)return false;
    this.offers=this.offers.filter(x=>x!==o);
    const from=this.players[o.from];
    if(accept){
      if(o.kind==="alliance"&&from.alive&&p.alive)this.makeAlliance(o.from,p.id);
      else if(o.kind==="coalition"&&from.alive&&p.alive){this.makeAlliance(o.from,p.id);}
    }else{this.addRel(o.from,p.id,-3);if(p.id===this.localPid)this.log(`Tu déclines l'offre de ${from.name}.`,"lg-dip");}
    return true;
  }
  sendOffer(from,to,kind,payload,txt){
    if(this.offers.filter(o=>o.to===to).length>=3||this.offers.some(o=>o.from===from&&o.to===to))return;
    const o={id:this.oid++,from,to,kind,payload,txt,exp:this.time+45};
    this.offers.push(o);
    if(to===this.localPid){this.toast(`Offre de ${this.players[from].name} : voir l'onglet Diplo.`,"gold");this.sfx("alert");}
    this.emit("offer",o);
  }
  orderSummon(p){
    if(this.phase!=="summon"||p.id!==this.summoner)return false;
    this.startBoss(); return true;
  }
  orderSend(p,kind,pct){
    if(!p.alive)return false;
    if(kind==="boss"&&this.phase!=="boss")return this.fail(p,"Le Gardien n'est pas là.");
    if(kind==="heart"&&this.phase!=="heart")return this.fail(p,"Le Cœur n'est pas encore apparu.");
    pct=clamp(pct||p.atkPct,10,100);
    const troops=Math.floor(p.army*pct/100);
    if(troops<5)return this.fail(p,"Pas assez de soldats (5 minimum).");
    p.army-=troops;
    const [x,y]=worldCenter(p.capital),[tx,ty]=worldCenter(this.center);
    this.marches.push({owner:p.id,kind,troops,x,y,tx,ty,speed:46,alive:true});
    if(kind==="boss")p.sentBoss+=troops; else p.sentHeart+=troops;
    if(p.id===this.localPid){this.sfx("march");this.log(`Tu envoies ${troops} soldats ${kind==="boss"?"contre le Gardien":"vers le Cœur"}.`,"lg-war",true);}
    else if(kind==="boss"&&!p.joinedBoss)this.log(`${p.name} marche sur le Gardien (${troops} soldats).`,"lg-ev");
    else if(kind==="heart")this.log(`${p.name} envoie ${troops} soldats vers le Cœur.`,"lg-ev");
    this.emit("march",{pid:p.id,kind});
    return true;
  }

  // ---------- diplomatie ----------
  addRel(a,b,d){const p=this.players[a];if(!p)return;p.rel[b]=clamp((p.rel[b]??0)+d,-100,100);}
  makeAlliance(aid,did){
    const a=this.players[aid],d=this.players[did];
    if(a.allies.has(did))return;
    a.allies.add(did); d.allies.add(aid);
    this.addRel(aid,did,20); this.addRel(did,aid,20);
    // les expéditions en cours entre eux s'arrêtent
    for(const e of this.exps)if(e.alive&&((e.owner===aid&&e.target===did)||(e.owner===did&&e.target===aid)))this.endExp(e);
    const mine=aid===this.localPid||did===this.localPid;
    this.log(`${a.name} et ${d.name} scellent une alliance.`,"lg-dip",mine);
    if(mine){this.sfx("ally");this.toast(`Alliance avec ${aid===this.localPid?d.name:a.name} !`,"green");}
    this.emit("alliance",{a:aid,b:did});
  }
  breakAlliance(aid,did,betrayal){
    const a=this.players[aid],d=this.players[did];
    a.allies.delete(did); d.allies.delete(aid);
    const mine=aid===this.localPid||did===this.localPid;
    if(betrayal){
      a.betrayT=this.time;
      this.addRel(did,aid,-70);
      for(const q of this.players)if(q.id!==aid&&q.id!==did)this.addRel(q.id,aid,-25);
      this.log(`${a.name} TRAHIT ${d.name} ! Tous s'en souviendront.`,"lg-war",true);
      if(did===this.localPid){this.toast(`${a.name} t'a trahi !`,"red",5000);this.sfx("kill");}
      else if(aid===this.localPid){this.toast("Trahison accomplie. Marque du parjure pendant 3 minutes.","red",4500);this.sfx("kill");}
    }else{
      this.addRel(did,aid,-20);
      this.log(`${a.name} rompt son pacte avec ${d.name}.`,"lg-dip",mine);
      if(did===this.localPid)this.toast(`${a.name} rompt votre alliance.`,"red");
    }
    this.emit("alliance",{a:aid,b:did,broken:true});
  }
  dissolveAllAlliances(){
    for(const p of this.players)p.allies.clear();
    this.offers=[];
    this.emit("alliance",{all:true});
  }

  // ---------- capture / élimination ----------
  captureTile(p,i){
    const tl=this.tiles[i],prev=tl.o;
    tl.o=p.id; tl.fort=0; p.tiles++;
    if(prev>=0){this.players[prev].tiles--;}
    this.emit("tile",i); this.emit("flash",{i,t:.45,c:p.color});
  }
  corruptTile(i){
    const tl=this.tiles[i];
    if(tl.t===T.CORRUPT||tl.t===T.TREE||tl.t===T.WATER)return false;
    const o=tl.o;
    if(o>=0&&this.players[o].capital===i)return false; // jamais une capitale
    if(o>=0)this.players[o].tiles--;
    tl.o=-1; tl.fort=0; tl.t=T.CORRUPT;
    this.emit("tile",i); this.emit("flash",{i,t:.6,c:"#7a3fa0"});
    return true;
  }
  eliminate(v,k){
    if(!v.alive)return;
    v.alive=false; v.eliminatedAt=this.time; v.finalTiles=v.tiles;
    if(k){k.army+=Math.floor(v.army*.25);}
    v.army=0;
    for(let i=0;i<W*H;i++)if(this.tiles[i].o===v.id){this.tiles[i].o=-1;this.tiles[i].fort=0;}
    v.tiles=0;
    for(const p of this.players)p.allies.delete(v.id);
    v.allies.clear();
    this.offers=this.offers.filter(o=>o.from!==v.id&&o.to!==v.id);
    for(const e of this.exps)if(e.alive&&(e.owner===v.id||e.target===v.id))e.alive=false;
    for(const m of this.marches)if(m.owner===v.id)m.alive=false;
    if(this.heart&&this.heart.holder===v.id){this.heart.holder=-1;this.heart.garrison=0;}
    this.emit("map");
    this.log(`${v.name} est éliminé${k?` par ${k.name}`:" par le Gardien"}.`,"lg-war",true);
    if(v.id===this.localPid){this.sfx("kill");this.emit("dead",{k});}
    else{this.toast(`${v.name} est éliminé${k?` par ${k.name}`:""} !`,"gold",4500);if(k&&k.id===this.localPid)this.sfx("kill");}
    if(this.alivePlayers().length<=1)this.endGame("domination",this.alivePlayers()[0]?.id??-1);
  }

  // ---------- expéditions ----------
  endExp(e){
    if(!e.alive)return;
    e.alive=false;
    const p=this.players[e.owner];
    if(p.alive&&e.troops>0)p.army+=Math.floor(e.troops);
    e.troops=0;
  }
  stepExps(dt){
    for(const e of this.exps){
      if(!e.alive)continue;
      const p=this.players[e.owner];
      if(!p.alive){e.alive=false;continue;}
      const d=e.target>=0?this.players[e.target]:null;
      if(d&&(!d.alive||p.allies.has(d.id))){this.endExp(e);continue;}
      e.acc+=this.expRate(e.troops)*dt;
      const mul=this.rallyOn(p)?RALLY_MUL:1;
      while(e.acc>=1&&e.alive){
        e.acc-=1;
        // choisir une case du front encore valide
        let i=-1;
        while(e.front.length){
          const k=Math.floor(this.R.r()*e.front.length), c=e.front[k];
          e.front[k]=e.front[e.front.length-1]; e.front.pop();
          const tl=this.tiles[c];
          if(tl.o===e.target&&isLandT(tl.t)&&this.isAdjOwned(c,p.id)){i=c;break;}
        }
        if(i<0){this.endExp(e);break;}
        const tl=this.tiles[i];
        if(!d){ // terre neutre : 1 soldat par case (2 en montagne)
          const cost=tl.t===T.MTN?3:2;
          if(e.troops<cost){this.endExp(e);break;}
          e.troops-=cost; this.captureTile(p,i); e.captured++;
        }else{
          const g=this.garrison(d,i)/mul;
          if(i===d.capital&&e.troops<g){e.acc+=1;if(!e.front.length){this.endExp(e);}continue;}
          if(e.troops>=g){
            e.troops-=g; d.army=Math.max(0,d.army-g*.5);
            const wasCap=i===d.capital;
            this.captureTile(p,i); e.captured++;
            if(d.id===this.localPid&&e.captured%8===1)this.emit("ping",{i,c:"#ff5a3c"});
            if(wasCap){
              this.log(`${p.name} prend la capitale de ${d.name} !`,"lg-war",p.id===this.localPid||d.id===this.localPid);
              this.emit("flash",{i,t:1,c:"#ffffff"});
              this.eliminate(d,p); e.alive=false; break;
            }
          }else{
            d.army=Math.max(0,d.army-e.troops*.5);
            e.troops=0; e.alive=false;
            if(p.id===this.localPid)this.toast(`Ton offensive contre ${d.name} est brisée.`,"red",3500,i);
            else if(d.id===this.localPid)this.toast(`Tu brises l'offensive de ${p.name} !`,"green",3500,i);
            this.emit("flash",{i,t:.6,c:"#d1543a"});
            break;
          }
        }
        for(const n of NB[i]){const t2=this.tiles[n];if(t2.o===e.target&&isLandT(t2.t))e.front.push(n);}
        if(e.troops<=0){e.alive=false;break;}
      }
    }
    if(this.exps.length>40||this.exps.some(e=>!e.alive))this.exps=this.exps.filter(e=>e.alive);
  }

  // ---------- marches vers le centre (Gardien / Cœur) ----------
  stepMarches(dt){
    for(const m of this.marches){
      if(!m.alive)continue;
      const dx=m.tx-m.x,dy=m.ty-m.y,dist=Math.hypot(dx,dy),mv=m.speed*dt;
      if(dist<=mv){m.alive=false;this.arriveMarch(m);continue;}
      m.x+=dx/dist*mv; m.y+=dy/dist*mv;
    }
    if(this.marches.some(m=>!m.alive))this.marches=this.marches.filter(m=>m.alive);
  }
  arriveMarch(m){
    const p=this.players[m.owner]; if(!p.alive)return;
    if(m.kind==="boss"){
      if(this.phase!=="boss"){p.army+=m.troops;return;}
      const b=this.boss;
      if(!b.attackers.has(p.id)){
        b.attackers.add(p.id); p.joinedBoss=true;
        const n=Math.min(6,b.attackers.size), mult=1+.6*(n-1)+.05*(n-1)*(n-2);
        const newMax=Math.round(b.baseHp*mult);
        b.hp+=newMax-b.maxHp; b.maxHp=newMax;
        this.log(`${p.name} rejoint le combat : le Gardien se renforce (${b.attackers.size} adversaire${b.attackers.size>1?"s":""}, ${Math.round(mult*100)} %).`,"lg-ev",true);
        if(n>1)this.toast(`${p.name} rejoint le combat : le Gardien passe à ${Math.round(mult*100)} % !`,"gold",4000);
      }
      let dmg=m.troops*(p.id===this.summoner?1.25:1)*(this.rallyOn(p)?1.2:1);
      b.hp-=dmg; p.bossDmg+=dmg;
      this.emit("bossHit",{pid:p.id,dmg});
      if(b.hp<=0)this.bossDies();
    }else{
      if(this.phase!=="heart"){p.army+=m.troops;return;}
      const h=this.heart;
      if(h.holder<0||h.holder===p.id){
        const first=h.holder<0;
        h.holder=p.id; h.garrison+=m.troops;
        if(first)this.heartTaken(p);
      }else{
        const holder=this.players[h.holder];
        if(m.troops>h.garrison*1.5){
          h.garrison=Math.floor(m.troops-h.garrison*1.5); h.holder=p.id;
          this.heartTaken(p,holder);
        }else{
          h.garrison=Math.max(0,h.garrison-m.troops/1.5);
          if(p.id===this.localPid)this.toast(`Tes ${m.troops} soldats meurent devant le Cœur (${holder.name} tient bon).`,"red");
        }
      }
      this.emit("heartFight",{pid:p.id});
    }
  }
  heartTaken(p,from){
    const h=this.heart;
    h.captures++;
    if(h.captures>1&&h.elapsed<HEART_MAX-HEART_EXT)h.t=Math.max(h.t,HEART_EXT);
    this.log(`${p.name} s'empare du Cœur${from?` (arraché à ${from.name})`:""} !`,"lg-gold",true);
    this.toast(`${p.id===this.localPid?"TU TIENS LE CŒUR":p.name+" tient le Cœur"} — ${Math.ceil(h.t)} s !`,p.id===this.localPid?"green":"red",3500);
    this.sfx(p.id===this.localPid?"ally":"alert");
    this.emit("heartTaken",{pid:p.id});
  }

  // ---------- Gardien ----------
  startSummon(){
    this.phase="summon";
    const s=this.computeRanks()[0];
    this.summoner=s?s.id:-1;
    this.summonAt=this.time+(s&&!s.bot?SUMMON_WAIT:this.R.rnd(2,5));
    this.log(`15:00 — L'ARBRE S'OUVRE. ${s.name} (#1) détient le droit d'invoquer le Gardien.`,"lg-war",true);
    if(s.id===this.localPid)this.toast("Tu es #1 : invoque le Gardien !","gold",SUMMON_WAIT*1000);
    else this.toast(`${s.name} est #1 : le Gardien va être invoqué.`,"red",5000);
    this.sfx("alert"); this.emit("shake",6); this.emit("phase","summon");
  }
  startBoss(){
    const total=this.alivePlayers().reduce((s,p)=>s+p.army,0);
    const baseHp=Math.max(300,Math.round(total*.22));
    this.boss={hp:baseHp,maxHp:baseHp,baseHp,attackers:new Set(),stage:1,lashAcc:0,t:0,summoner:this.summoner};
    this.phase="boss";
    const s=this.players[this.summoner];
    this.log(`LE GARDIEN S'ÉVEILLE, invoqué par ${s?s.name:"personne"}.`,"lg-war",true);
    this.toast("THE GUARDIAN AWAKENS","red",6000);
    this.sfx("roar"); this.emit("shake",12); this.emit("phase","boss");
  }
  stepBoss(dt){
    const b=this.boss; b.t+=dt;
    const r=b.hp/b.maxHp;
    const stage=Math.max(b.stage,r>.5?1:r>.25?2:r>.1?3:4);
    if(stage!==b.stage){
      b.stage=stage;
      const names={2:"LE GARDIEN ENTRE EN RAGE : il dévore les terres autour de l'Arbre.",3:"FRÉNÉSIE : le Gardien s'acharne sur celui qui le blesse le plus.",4:"DERNIER SOUFFLE : achevez-le vite !"};
      this.log(names[stage],"lg-war",true); this.toast(names[stage].split(" : ")[0],"red",4500); this.sfx("roar"); this.emit("shake",8);
    }
    const interval=[0,6,4,3,2][stage];
    b.lashAcc+=dt;
    if(b.lashAcc>=interval){
      b.lashAcc=0;
      const K=[0,1,2,3,4][stage];
      this.lash(K);
      if(stage>=3){
        let top=null; for(const id of b.attackers){const p=this.players[id];if(p.alive&&(!top||p.bossDmg>top.bossDmg))top=p;}
        if(top)this.lashPlayer(top,stage===4?3:2);
      }
      this.emit("shake",2+stage);
      this.sfx("lash");
    }
    if(b.t>=BOSS_MAX){
      this.log("Le Gardien se retire dans les racines… mais le Cœur est à nu.","lg-war",true);
      this.toast("Le Gardien se retire dans les racines.","gold",5000);
      this.startHeart();
    }
  }
  // corrompt K cases de terre les plus proches de l'Arbre
  lash(K){
    const cand=[];
    for(let i=0;i<W*H;i++){const tl=this.tiles[i];if(isLandT(tl.t))cand.push(i);}
    cand.sort((a,b)=>distC(a,this.center)-distC(b,this.center));
    let n=0; for(const i of cand){if(n>=K)break;if(this.corruptTile(i))n++;}
  }
  lashPlayer(p,K){
    const cand=[];
    for(let i=0;i<W*H;i++)if(this.tiles[i].o===p.id)cand.push(i);
    cand.sort((a,b)=>distC(a,this.center)-distC(b,this.center));
    let n=0; for(const i of cand){if(n>=K)break;if(this.corruptTile(i))n++;}
    if(n&&p.id===this.localPid)this.toast("Le Gardien frappe tes terres !","red",2500);
  }
  bossDies(){
    const b=this.boss; b.hp=0;
    let top=null; for(const p of this.players)if(p.bossDmg>0&&(!top||p.bossDmg>top.bossDmg))top=p;
    this.log(`LE GARDIEN TOMBE${top?` — coup de grâce collectif, ${top.name} a frappé le plus fort`:""}.`,"lg-gold",true);
    this.toast("THE GUARDIAN FALLS","gold",5000); this.sfx("boom"); this.emit("shake",14);
    this.startHeart();
  }

  // ---------- Cœur ----------
  startHeart(){
    this.phase="heart";
    this.heart={holder:-1,garrison:0,t:HEART_LEN,elapsed:0,captures:0};
    for(const m of this.marches)if(m.kind==="boss"){m.alive=false;this.players[m.owner].army+=m.troops;}
    this.dissolveAllAlliances();
    this.log("LE CŒUR APPARAÎT. Toutes les alliances sont rompues : ne fais confiance à personne.","lg-war",true);
    this.toast("THE HEART HAS APPEARED — ALLIANCES ENDED","gold",6000);
    this.sfx("heart"); this.emit("phase","heart");
  }
  stepHeart(dt){
    const h=this.heart; h.elapsed+=dt;
    if(h.holder>=0){
      h.t-=dt; this.players[h.holder].heartHeld+=dt;
      if(h.t<=0){this.endGame("heart",h.holder);return;}
    }else if(h.elapsed>=HEART_MAX){
      const r=this.computeRanks()[0]; this.endGame("timeout",r?r.id:-1); return;
    }
    if(h.elapsed>=HEART_MAX+30){const r=this.computeRanks()[0];this.endGame("timeout",h.holder>=0?h.holder:(r?r.id:-1));}
  }

  // ---------- fin ----------
  endGame(kind,winner){
    if(this.phase==="over")return;
    this.phase="over"; this.winner=winner; this.endKind=kind;
    for(const p of this.players)if(p.alive)p.finalTiles=p.tiles;
    const w=this.players[winner];
    if(w)this.log(kind==="heart"?`${w.name} garde le Cœur : victoire !`:kind==="domination"?`${w.name} règne seul sur la carte.`:`Le Cœur n'a trouvé personne : ${w.name} (#1) l'emporte.`,"lg-gold",true);
    this.emit("end",{kind,winner});
  }

  // ---------- tic économique (1 fois par seconde) ----------
  econTick(){
    for(const p of this.players){
      if(!p.alive)continue;
      let roots=0; for(let i=0;i<W*H;i++)if(this.tiles[i].o===p.id&&this.tiles[i].t===T.ROOT)roots++;
      p.roots=roots;
      const cap=this.armyCap(p);
      if(p.army<cap)p.army=Math.min(cap,p.army+this.growth(p));
      else p.army=Math.max(cap,p.army-(p.army-cap)*.03);
      p.power=Math.min(POWER_MAX,p.power+this.powerRate(p));
    }
    this.offers=this.offers.filter(o=>o.exp>this.time);
    for(const p of this.players)for(const q of this.players){
      if(p===q)continue;
      if(p.allies.has(q.id))this.addRel(p.id,q.id,.3); else p.rel[q.id]=(p.rel[q.id]??0)*.997;
    }
    this.computeRanks();
    const r1=this.players[this.rank1];
    if(r1&&this.phase!=="heart"){
      const share=this.landPct(r1);
      const tgt=this.coalition?this.players[this.coalitionTarget]:null;
      if(this.coalition&&tgt&&tgt.alive&&this.landPct(tgt)>=.15){ /* cible conservée */ }
      else if(!this.coalition&&this.time>=Math.max(180,this.truce)&&share>=.2&&this.time-(this.coalitionT||-99)>=45){
        this.coalitionT=this.time;
        this.coalition=true; this.coalitionTarget=r1.id;
        this.log(`LA CHASSE AU #1 COMMENCE : les empires se liguent contre ${r1.name}.`,"lg-war",true);
        this.toast(r1.id===this.localPid?"Les empires se liguent contre toi !":`Les empires se liguent contre ${r1.name}.`,"red",5000); this.sfx("alert");
      }else if(this.coalition){
        this.coalition=false;
        this.log(`La coalition se disloque : ${this.players[this.coalitionTarget].name} n'est plus la menace principale.`,"lg-dip");
      }
    }
    if(this.phase==="play"){
      const left=GAME_LEN-this.time, F=this.flags;
      const mark=(k,tt,txt,cls)=>{if(!F[k]&&this.time>=tt){F[k]=true;this.log(txt,"lg-ev",true);this.toast(txt,cls||"gold",4500);this.sfx("alert");this.emit("tree",k);}};
      mark("tree5",300,"L'Arbre-Monde commence à luire.");
      mark("tree10",600,"Les racines de l'Arbre remuent…");
      mark("tree13",780,"Une corruption sombre gagne l'Arbre.","red");
      mark("tree14",840,"L'Arbre tremble. Plus qu'une minute.","red");
      mark("tree1430",870,"30 SECONDES. Le #1 obtiendra le droit d'invoquer le Gardien.","red");
      if(!F.truceWarned&&this.time>=this.truce){F.truceWarned=true;this.toast("Fin de la trêve : les empires peuvent t'attaquer !","red",5000);this.log("Fin de la trêve.","lg-war");this.sfx("alert");}
      if(left<=60)this.emit("shake",1);
    }
  }

  // ---------- pas de simulation ----------
  step(dt){
    if(this.phase==="over")return;
    this.time+=dt; this.econAcc+=dt;
    while(this.econAcc>=1){this.econAcc-=1;this.econTick();if(this.phase==="over")return;}
    this.stepExps(dt); if(this.phase==="over")return;
    this.stepMarches(dt); if(this.phase==="over")return;
    if(this.phase==="play"&&this.time>=GAME_LEN)this.startSummon();
    else if(this.phase==="summon"){
      const s=this.players[this.summoner];
      if(!s||!s.alive){this.startSummon();}
      else if(this.time>=this.summonAt)this.startBoss();
    }
    else if(this.phase==="boss")this.stepBoss(dt);
    else if(this.phase==="heart")this.stepHeart(dt);
  }
}

root.HW={W,H,TS,T,TERR_NAMES,GAME_LEN,SUMMON_WAIT,BOSS_MAX,HEART_LEN,HEART_MAX,N_PLAYERS,COST,RALLY_LEN,POWER_MAX,DIFF,BOT_DEFS,PERS_TXT,NB,idx,distC,isLandT,worldCenter,Engine};
})(typeof window!=="undefined"?window:globalThis);
