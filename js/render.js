"use strict";
/* ============================================================
   HEARTWOOD — rendu (canvas pixel-art, caméra, minimap, Arbre)
   ============================================================ */
(function(root){
const {W,H,TS,T,worldCenter,GAME_LEN}=root.HW;
const {clamp,mulberry32,hexRgb}=root.HWU;
const $=id=>document.getElementById(id);

function px(g,x,y,w,h,c){g.fillStyle=c;g.fillRect(x,y,w,h);}
function sh(c,f=0.72){const [r,gg,b]=hexRgb(c);return `rgb(${(r*f)|0},${(gg*f)|0},${(b*f)|0})`;}

// ---------- atlas des terrains ----------
let atlas=null;
function buildAtlas(){
  if(atlas)return;
  atlas=document.createElement("canvas"); atlas.width=TS*4; atlas.height=TS*7;
  const g=atlas.getContext("2d");
  for(let v=0;v<4;v++)for(let t=0;t<7;t++)paintTile(g,v*TS,t*TS,t,v*97+13+t*31);
}
function paintTile(g,ox,oy,t,seed){
  const R=mulberry32(seed), put=(x,y,w,h,c)=>px(g,ox+x,oy+y,w,h,c);
  if(t===T.WATER){
    put(0,0,16,16,"#24484f");
    for(let i=0;i<4;i++){const x=(R()*13)|0,y=(R()*14)|0;put(x,y+1,3,1,"#2f5d66");put(x+1,y,1,1,"#3d747f");}
  }else if(t===T.PLAIN||t===T.FOREST||t===T.ROOT){
    put(0,0,16,16,"#6f8a4c");
    for(let i=0;i<9;i++){const x=(R()*16)|0,y=(R()*16)|0;put(x,y,1,1,R()<.5?"#7d9a57":"#617a42");}
    if(t===T.FOREST){
      for(const [tx,ty] of [[3,3],[10,6],[5,9]]){
        put(tx+1,ty+4,1,2,"#4d3b2a");
        put(tx,ty+1,3,3,"#35502c"); put(tx+1,ty,1,1,"#35502c"); put(tx+1,ty+1,1,1,"#4a6b3a");
      }
    }
    if(t===T.ROOT){
      // racine : une veine brune qui traverse la case
      put(0,7,16,2,"#4a3624"); put(2,6,5,1,"#5d452e"); put(9,9,5,1,"#5d452e"); put(6,4,2,3,"#4a3624"); put(11,9,2,4,"#4a3624");
      put(3,8,2,1,"#7a5c3c"); put(12,7,2,1,"#7a5c3c");
    }
  }else if(t===T.MTN){
    put(0,0,16,16,"#66665c");
    for(let i=0;i<6;i++){const x=(R()*16)|0,y=(R()*16)|0;put(x,y,1,1,R()<.5?"#72726a":"#5a5a50");}
    put(6,3,3,2,"#8d8a7d"); put(5,5,5,2,"#8d8a7d"); put(4,7,7,3,"#83806f"); put(3,10,9,3,"#767364");
    put(7,4,2,2,"#a19d8c"); put(8,6,3,8,"#504e46");
  }else if(t===T.TREE){
    put(0,0,16,16,"#3a2c1e");
    for(let i=0;i<8;i++){put((R()*16)|0,(R()*16)|0,1,1,R()<.5?"#2f2318":"#4a3826");}
  }else if(t===T.CORRUPT){
    put(0,0,16,16,"#2a1a33");
    for(let i=0;i<8;i++){put((R()*16)|0,(R()*16)|0,1,1,R()<.5?"#3b2549":"#1c1122");}
    put(3,4,6,1,"#5a3a78"); put(8,5,1,5,"#5a3a78"); put(9,10,4,1,"#4a2f63"); put(2,11,2,1,"#6b48a0");
  }
}
const sprCache=new Map();
function sprite(kind,color){
  const key=kind+":"+color; if(sprCache.has(key))return sprCache.get(key);
  const c=document.createElement("canvas"); c.width=TS; c.height=TS; const g=c.getContext("2d"), col=color;
  if(kind==="capital"){
    px(g,1,14,14,1,"rgba(0,0,0,.3)");
    px(g,2,9,12,5,"#8b8676"); px(g,2,9,12,1,"#a29c8a");
    for(const x of [2,5,8,12])px(g,x,8,2,1,"#8b8676");
    px(g,1,5,3,10,"#77715f"); px(g,12,5,3,10,"#77715f");
    px(g,1,4,1,1,"#77715f"); px(g,3,4,1,1,"#77715f"); px(g,12,4,1,1,"#77715f"); px(g,14,4,1,1,"#77715f");
    px(g,5,2,6,12,"#77715f"); px(g,5,1,2,1,"#77715f"); px(g,9,1,2,1,"#77715f"); px(g,5,2,6,1,"#8b8676");
    px(g,6,4,1,2,"#1d1810"); px(g,9,4,1,2,"#1d1810");
    px(g,6,7,4,4,col); px(g,6,10,4,1,sh(col));
    px(g,7,11,3,4,"#1d1810"); px(g,7,11,1,1,"#4a3a28");
  }else if(kind==="fort"){
    for(const x of [1,4,7,10,13]){px(g,x,3,2,11,"#6b4f33");px(g,x,2,2,1,"#8a6a45");px(g,x,3,1,11,"#7d5d3c");}
    px(g,0,6,16,1,"#4a3624"); px(g,0,11,16,1,"#4a3624");
    px(g,1,14,14,1,col);
  }
  sprCache.set(key,c); return c;
}

// ---------- état du rendu ----------
const cv=$("map"), ctx=cv.getContext("2d");
const mmCv=$("minimap"), mmCtx=mmCv.getContext("2d");
const cam={x:0,y:0,z:2,tz:2,ax:0,ay:0,vx:0,vy:0,zmin:.5,zmax:4};
let vw=1,vh=1,DPR=1;
const layer=document.createElement("canvas"); layer.width=W*TS; layer.height=H*TS;
const lg=layer.getContext("2d");
const mmBase=document.createElement("canvas"); mmBase.width=W; mmBase.height=H;
const TERR_RGB=["#1f3d44","#4a5c34","#364a2c","#55554a","#3a2c1e","#5a4630","#2a1a33"].map(hexRgb);
const fx={flashes:[],floats:[],pings:[],parts:[],shake:0,hitFlash:0};
let dirty=true, dirtyTiles=new Set(), mmDirty=true, E=null;
let hover=-1, sel=-1;

function init(engine){E=engine;buildAtlas();sprCache.clear();dirty=true;dirtyTiles.clear();mmDirty=true;fx.flashes=[];fx.floats=[];fx.pings=[];fx.parts=[];fx.shake=0;}
function markTile(i){dirtyTiles.add(i);for(const n of root.HW.NB[i])dirtyTiles.add(n);}
function markAll(){dirty=true;}

function resize(){
  const r=cv.parentElement.getBoundingClientRect();
  DPR=Math.min(window.devicePixelRatio||1,2);
  vw=Math.max(1,r.width); vh=Math.max(1,r.height);
  cv.width=Math.round(vw*DPR); cv.height=Math.round(vh*DPR);
  const fit=Math.min(vw/(W*TS),vh/(H*TS));
  cam.zmin=clamp(fit*.9,.3,1.5); cam.zmax=4;
  cam.z=clamp(cam.z,cam.zmin,cam.zmax); cam.tz=clamp(cam.tz,cam.zmin,cam.zmax);
  clampCam();
}
function clampCam(){
  const mw=W*TS,mh=H*TS,ww=vw/cam.z,wh=vh/cam.z,m=48;
  cam.x=ww>=mw+2*m?(mw-ww)/2:clamp(cam.x,-m,mw-ww+m);
  cam.y=wh>=mh+2*m?(mh-wh)/2:clamp(cam.y,-m,mh-wh+m);
}
function zoomAt(f,ax,ay){cam.tz=clamp(cam.tz*f,cam.zmin,cam.zmax);cam.ax=ax;cam.ay=ay;}
function focusTile(i){const [x,y]=worldCenter(i);cam.x=x-vw/cam.z/2;cam.y=y-vh/cam.z/2;clampCam();}
function updateCamera(rdt,keys){
  let kx=0,ky=0;
  if(keys.has("KeyA")||keys.has("ArrowLeft"))kx--;
  if(keys.has("KeyD")||keys.has("ArrowRight"))kx++;
  if(keys.has("KeyW")||keys.has("ArrowUp"))ky--;
  if(keys.has("KeyS")||keys.has("ArrowDown"))ky++;
  const sp=650/cam.z, k=Math.min(1,rdt*12);
  cam.vx+=(kx*sp-cam.vx)*k; cam.vy+=(ky*sp-cam.vy)*k;
  if(Math.abs(cam.vx)>.5||Math.abs(cam.vy)>.5){cam.x+=cam.vx*rdt;cam.y+=cam.vy*rdt;clampCam();}
  if(Math.abs(cam.tz-cam.z)>.0005){
    const wx=cam.ax/cam.z+cam.x, wy=cam.ay/cam.z+cam.y;
    cam.z+=(cam.tz-cam.z)*Math.min(1,rdt*14);
    if(Math.abs(cam.tz-cam.z)<.002)cam.z=cam.tz;
    cam.x=wx-cam.ax/cam.z; cam.y=wy-cam.ay/cam.z; clampCam();
  }
}
const screenToTile=(sx,sy)=>{
  const wx=sx/cam.z+cam.x, wy=sy/cam.z+cam.y, tx=Math.floor(wx/TS), ty=Math.floor(wy/TS);
  return (tx>=0&&tx<W&&ty>=0&&ty<H)?ty*W+tx:-1;
};

// ---------- couche statique ----------
function drawTile(i){
  const g=lg, tiles=E.tiles, x=i%W, y=(i/W)|0, tl=tiles[i], X=x*TS, Y=y*TS, v=(x*7+y*13)%4;
  g.drawImage(atlas,v*TS,tl.t*TS,TS,TS,X,Y,TS,TS);
  const o=tl.o;
  if(o>=0){
    const p=E.players[o];
    g.fillStyle=p.color; g.globalAlpha=.32; g.fillRect(X,Y,TS,TS); g.globalAlpha=1;
    if(x===0||tiles[i-1].o!==o)g.fillRect(X,Y,2,TS);
    if(x===W-1||tiles[i+1].o!==o)g.fillRect(X+TS-2,Y,2,TS);
    if(y===0||tiles[i-W].o!==o)g.fillRect(X,Y,TS,2);
    if(y===H-1||tiles[i+W].o!==o)g.fillRect(X,Y+TS-2,TS,2);
    if(i===p.capital)g.drawImage(sprite("capital",p.color),X,Y);
    else if(tl.fort)g.drawImage(sprite("fort",p.color),X,Y);
  }
}
function drawLayer(){
  lg.imageSmoothingEnabled=false;
  if(dirty){for(let i=0;i<W*H;i++)drawTile(i);dirty=false;}
  else for(const i of dirtyTiles)drawTile(i);
  dirtyTiles.clear(); mmDirty=true;
}
function renderMinimap(now){
  if(mmDirty){
    const g=mmBase.getContext("2d"),img=g.createImageData(W,H);
    for(let i=0;i<W*H;i++){
      const tl=E.tiles[i]; const c=TERR_RGB[tl.t]; let r=c[0],gg=c[1],b=c[2];
      if(tl.o>=0){const pc=hexRgb(E.players[tl.o].color);r=r*.3+pc[0]*.7;gg=gg*.3+pc[1]*.7;b=b*.3+pc[2]*.7;}
      const k=i*4; img.data[k]=r;img.data[k+1]=gg;img.data[k+2]=b;img.data[k+3]=255;
    }
    g.putImageData(img,0,0); mmDirty=false;
  }
  const mw=mmCv.width,mh=mmCv.height;
  mmCtx.imageSmoothingEnabled=false; mmCtx.clearRect(0,0,mw,mh); mmCtx.drawImage(mmBase,0,0,mw,mh);
  const sx=mw/(W*TS), sy=mh/(H*TS);
  for(const p of fx.pings){
    if(((now/200)|0)%2)continue;
    const [x,y]=worldCenter(p.i); mmCtx.fillStyle=p.c||"#ff5a3c"; mmCtx.fillRect(x*sx-3,y*sy-3,6,6);
  }
  mmCtx.strokeStyle="#dfe8c8"; mmCtx.lineWidth=1;
  mmCtx.strokeRect(cam.x*sx+.5,cam.y*sy+.5,(vw/cam.z)*sx,(vh/cam.z)*sy);
}

// ---------- l'Arbre-Monde, le Gardien, le Cœur ----------
const treeR=mulberry32(4242);
const LEAVES=[]; for(let i=0;i<260;i++){const a=treeR()*Math.PI*2,r=Math.sqrt(treeR())*50;LEAVES.push({x:Math.cos(a)*r,y:Math.sin(a)*r*.75-42,s:3+((treeR()*4)|0),k:treeR()});}
LEAVES.sort((a,b)=>a.k-b.k);
function treeState(){
  const t=E.time, ph=E.phase;
  let glow=t>=300?clamp((t-300)/120,0,1):0;
  let roots=t>=600?clamp((t-600)/60,0,1):0;
  let corrupt=t>=780?clamp((t-780)/120,0,1):0;
  let tremble=t>=840?clamp((t-840)/60,0,1):0;
  if(ph==="boss"){glow=1;roots=1;corrupt=1;tremble=.4;}
  if(ph==="heart"){glow=1;roots=1;corrupt=.4;tremble=0;}
  if(ph==="over"){tremble=0;}
  return {glow,roots,corrupt,tremble};
}
function drawTree(now){
  const [cx,cy]=worldCenter(E.center), st=treeState(), t=now/1000;
  const jx=st.tremble?(Math.random()-.5)*4*st.tremble:0, jy=st.tremble?(Math.random()-.5)*3*st.tremble:0;
  // halo
  if(st.glow>0){
    const rad=90+10*Math.sin(t*2), g=ctx.createRadialGradient(cx,cy-30,4,cx,cy-30,rad);
    const col=st.corrupt>.5?"160,90,220":"200,240,120";
    g.addColorStop(0,`rgba(${col},${.45*st.glow*(st.corrupt>.5?1.2:1)})`); g.addColorStop(1,`rgba(${col},0)`);
    ctx.fillStyle=g; ctx.fillRect(cx-rad,cy-30-rad,rad*2,rad*2);
  }
  // racines animées
  if(st.roots>0){
    ctx.strokeStyle=st.corrupt>.5?"#5a3a78":"#4a3624"; ctx.lineWidth=3; ctx.lineCap="round";
    for(let k=0;k<8;k++){
      const a=k/8*Math.PI*2, len=40+18*st.roots;
      ctx.beginPath(); ctx.moveTo(cx+jx,cy+6+jy);
      for(let s=1;s<=4;s++){const d=len*s/4, w=Math.sin(t*3+k+s)*3*st.roots;ctx.lineTo(cx+Math.cos(a)*d+Math.cos(a+1.57)*w+jx,cy+6+Math.sin(a)*d*.9+Math.sin(a+1.57)*w+jy);}
      ctx.stroke();
    }
  }
  // tronc
  const trunk=st.corrupt>.6?"#3b2340":"#5a3f28", trunkL=st.corrupt>.6?"#54355e":"#7a5638";
  ctx.fillStyle="rgba(0,0,0,.35)"; ctx.fillRect(cx-30+jx,cy+6+jy,60,8);
  ctx.fillStyle=trunk; ctx.fillRect(cx-10+jx,cy-40+jy,20,52); ctx.fillRect(cx-22+jx,cy-2+jy,14,10); ctx.fillRect(cx+8+jx,cy+2+jy,16,8);
  ctx.fillRect(cx-26+jx,cy-52+jy,10,22); ctx.fillRect(cx+16+jx,cy-56+jy,10,26);
  ctx.fillStyle=trunkL; ctx.fillRect(cx-10+jx,cy-40+jy,5,52); ctx.fillRect(cx-26+jx,cy-52+jy,3,22); ctx.fillRect(cx+16+jx,cy-56+jy,3,26);
  // feuillage
  for(const l of LEAVES){
    const c=l.k<st.corrupt?(l.k<.5?"#6b3f95":"#3d2454"):(l.k<.33?"#3f6b2e":l.k<.66?"#5a8f3c":"#7fb04e");
    const gl=st.glow>0&&l.k>.7?`rgba(230,255,160,${.5*st.glow})`:null;
    ctx.fillStyle="#1d2a16"; ctx.fillRect(Math.round(cx+l.x+jx)-1,Math.round(cy+l.y+jy+Math.sin(t*1.5+l.k*6)*st.glow*1.5)-1,l.s+2,l.s+2);
    ctx.fillStyle=c; ctx.fillRect(Math.round(cx+l.x+jx),Math.round(cy+l.y+jy+Math.sin(t*1.5+l.k*6)*st.glow*1.5),l.s,l.s);
    if(gl&&((now/300+l.k*10)|0)%3===0){ctx.fillStyle=gl;ctx.fillRect(Math.round(cx+l.x+jx),Math.round(cy+l.y+jy),1,1);}
  }
  if(E.phase==="boss"&&E.boss)drawGuardian(cx+jx,cy+jy,now);
  if(E.phase==="heart"||(E.phase==="over"&&E.heart))drawHeart(cx,cy,now);
}
function drawGuardian(cx,cy,now){
  const b=E.boss, t=now/1000, bob=Math.sin(t*2)*3, stage=b.stage;
  const hit=fx.hitFlash>0;
  const body=hit?"#ffffff":stage>=3?"#3a1030":"#1f1230", edge=hit?"#ffffff":"#5a2a70";
  const y=cy-56+bob;
  // ombre
  ctx.fillStyle="rgba(0,0,0,.35)"; ctx.fillRect(cx-26,cy+8,52,6);
  // corps
  ctx.fillStyle=body; ctx.fillRect(cx-22,y-10,44,42); ctx.fillRect(cx-30,y+2,8,22); ctx.fillRect(cx+22,y+2,8,22);
  ctx.fillStyle=edge; ctx.fillRect(cx-22,y-10,44,3); ctx.fillRect(cx-22,y-10,3,42);
  // cornes
  ctx.fillStyle=edge; ctx.fillRect(cx-20,y-22,6,14); ctx.fillRect(cx+14,y-22,6,14); ctx.fillRect(cx-24,y-28,6,8); ctx.fillRect(cx+18,y-28,6,8);
  // griffes
  ctx.fillStyle="#d9d2c0"; for(const gx of [-30,-26,22,26]){ctx.fillRect(cx+gx,y+24,3,6);}
  // yeux
  const eye=stage>=4?"#ff3b3b":stage>=2?"#ff8a3b":"#ffd23f";
  const blink=((now/1200)|0)%7===0?1:5;
  ctx.fillStyle=eye; ctx.fillRect(cx-12,y+2,7,blink); ctx.fillRect(cx+5,y+2,7,blink);
  ctx.fillStyle=`rgba(255,120,60,${.25+.15*Math.sin(t*6)})`; ctx.fillRect(cx-14,y,11,9); ctx.fillRect(cx+3,y,11,9);
  // gueule
  ctx.fillStyle="#0c0610"; ctx.fillRect(cx-10,y+18,20,5);
  ctx.fillStyle="#e8e0d0"; for(let k=0;k<5;k++)ctx.fillRect(cx-9+k*4,y+18,2,2);
}
function drawHeart(cx,cy,now){
  const t=now/1000, s=1+.12*Math.sin(t*5), h=E.heart;
  const col=h&&h.holder>=0?E.players[h.holder].color:"#ff4d6d";
  const g=ctx.createRadialGradient(cx,cy-34,2,cx,cy-34,40*s);
  g.addColorStop(0,"rgba(255,80,110,.55)"); g.addColorStop(1,"rgba(255,80,110,0)");
  ctx.fillStyle=g; ctx.fillRect(cx-40,cy-74,80,80);
  ctx.save(); ctx.translate(cx,cy-34); ctx.scale(s,s);
  ctx.fillStyle="#ff4d6d";
  ctx.fillRect(-12,-8,8,8); ctx.fillRect(4,-8,8,8); ctx.fillRect(-14,-4,28,6); ctx.fillRect(-12,2,24,4); ctx.fillRect(-8,6,16,4); ctx.fillRect(-4,10,8,3); ctx.fillRect(-2,13,4,2);
  ctx.fillStyle="#ffb3c1"; ctx.fillRect(-10,-6,3,3);
  ctx.strokeStyle=col; ctx.lineWidth=2; ctx.strokeRect(-15,-9,30,25);
  ctx.restore();
}

// ---------- rendu principal ----------
function render(now,ui){
  ctx.setTransform(1,0,0,1,0,0); ctx.imageSmoothingEnabled=false;
  ctx.fillStyle="#0d1a1e"; ctx.fillRect(0,0,cv.width,cv.height);
  if(dirty||dirtyTiles.size)drawLayer();
  const shk=fx.shake, shx=shk>0?(Math.random()-.5)*2*shk:0, shy=shk>0?(Math.random()-.5)*2*shk:0;
  const s=cam.z*DPR;
  ctx.setTransform(s,0,0,s,Math.round((-cam.x*cam.z+shx)*DPR),Math.round((-cam.y*cam.z+shy)*DPR));
  ctx.drawImage(layer,0,0);
  for(const f of fx.flashes){ctx.globalAlpha=Math.max(f.t,0)*.8;ctx.fillStyle=f.c;ctx.fillRect((f.i%W)*TS,((f.i/W)|0)*TS,TS,TS);}
  ctx.globalAlpha=1;
  drawTree(now);
  // marches vers le centre
  for(const m of E.marches){
    if(!m.alive)continue;
    const p=E.players[m.owner];
    ctx.fillStyle="#0c0906"; ctx.fillRect(Math.round(m.x)-4,Math.round(m.y)-4,8,8);
    ctx.fillStyle=p.color; ctx.fillRect(Math.round(m.x)-3,Math.round(m.y)-3,6,6);
  }
  for(const p of fx.pings){
    const x=(p.i%W)*TS,y=((p.i/W)|0)*TS,r=4+((now/60)%12);
    ctx.strokeStyle=p.c||"#ff5a3c"; ctx.lineWidth=1.5; ctx.globalAlpha=Math.min(1,p.t)*.8;
    ctx.strokeRect(x+8-r,y+8-r,r*2,r*2);
  }
  ctx.globalAlpha=1;
  if(sel>=0){ctx.strokeStyle="#ffffff";ctx.lineWidth=2;ctx.globalAlpha=.55+.45*Math.sin(now/180);ctx.strokeRect((sel%W)*TS+1,((sel/W)|0)*TS+1,TS-2,TS-2);ctx.globalAlpha=1;}
  if(hover>=0&&hover!==sel&&!ui.dragging){
    const tl=E.tiles[hover], me=E.me(); let col="rgba(223,232,200,.6)";
    if(me.alive&&E.canFight()){
      if(tl.o===-1&&E.isLand(hover)&&E.isAdjOwned(hover,me.id))col="#b9d389";
      else if(tl.o>=0&&tl.o!==me.id&&E.isAdjOwned(hover,me.id)&&!me.allies.has(tl.o))col="#ff7a5c";
      else if(tl.t===T.TREE&&(E.phase==="boss"||E.phase==="heart"))col="#ff4d6d";
    }
    ctx.strokeStyle=col; ctx.lineWidth=1.5; ctx.strokeRect((hover%W)*TS+1,((hover/W)|0)*TS+1,TS-2,TS-2);
  }
  for(const p of fx.parts){ctx.globalAlpha=Math.max(p.life/p.max,0)*.6;ctx.fillStyle=p.c;ctx.fillRect(p.x,p.y,p.size,p.size);}
  ctx.globalAlpha=1;
  // espace écran : noms, nombres des marches, textes flottants
  ctx.setTransform(DPR,0,0,DPR,0,0); ctx.textAlign="center"; ctx.textBaseline="alphabetic";
  if(cam.z>=.8){
    ctx.font="10px Silkscreen, monospace";
    for(const p of E.players){
      if(!p.alive)continue;
      const [wx,wy]=worldCenter(p.capital);
      const x=Math.round((wx-cam.x)*cam.z), y=Math.round((wy-8-cam.y)*cam.z)-4;
      if(x<-80||x>vw+80||y<-20||y>vh+20)continue;
      const txt=`#${p.rank} ${p.name}`, tw=ctx.measureText(txt).width;
      ctx.fillStyle="rgba(8,12,8,.8)"; ctx.fillRect(x-tw/2-3,y-10,tw+6,13);
      ctx.fillStyle=p.rank===1?"#ffd23f":p.color; ctx.fillText(txt,x,y);
    }
  }
  ctx.font="16px VT323, monospace"; ctx.lineWidth=3; ctx.strokeStyle="#0c0906";
  for(const m of E.marches){
    if(!m.alive)continue;
    const x=(m.x-cam.x)*cam.z, y=(m.y-cam.y)*cam.z-8;
    ctx.strokeText(String(m.troops),x,y); ctx.fillStyle=E.players[m.owner].color; ctx.fillText(String(m.troops),x,y);
  }
  ctx.font="20px VT323, monospace";
  for(const f of fx.floats){
    const x=(f.x-cam.x)*cam.z, y=(f.y-cam.y)*cam.z-(1.4-f.t)*34-8;
    ctx.globalAlpha=clamp(f.t/.5,0,1); ctx.strokeText(f.txt,x,y); ctx.fillStyle=f.c; ctx.fillText(f.txt,x,y);
  }
  ctx.globalAlpha=1; ctx.textAlign="left";
  renderMinimap(now);
}
function tickFx(rdt){
  for(const f of fx.flashes)f.t-=rdt; for(const f of fx.floats)f.t-=rdt; for(const p of fx.pings)p.t-=rdt;
  if(fx.flashes.length&&fx.flashes[0].t<=0)fx.flashes=fx.flashes.filter(f=>f.t>0);
  if(fx.floats.some(f=>f.t<=0))fx.floats=fx.floats.filter(f=>f.t>0);
  if(fx.pings.some(p=>p.t<=0))fx.pings=fx.pings.filter(p=>p.t>0);
  for(const p of fx.parts){p.x+=p.vx*rdt;p.y+=p.vy*rdt;p.life-=rdt;}
  if(fx.parts.some(p=>p.life<=0))fx.parts=fx.parts.filter(p=>p.life>0);
  fx.shake=Math.max(0,fx.shake-rdt*6); fx.hitFlash=Math.max(0,fx.hitFlash-rdt);
  if(fx.flashes.length>300)fx.flashes.splice(0,fx.flashes.length-300);
}
function addFloat(i,txt,c){const [x,y]=worldCenter(i);fx.floats.push({x,y,txt,c,t:1.4});}
function spawnTreeParticles(dt){
  if(!E)return; const st=treeState(); if(st.glow<=0&&E.phase==="play")return;
  const [cx,cy]=worldCenter(E.center);
  const rate=E.phase==="boss"?.05:st.corrupt>0?.12:.35;
  fx.pAcc=(fx.pAcc||0)+dt;
  if(fx.pAcc>rate){fx.pAcc=0;
    const col=st.corrupt>.5?["#8a5ad0","#5a3a78","#c090ff"]:["#d8ff9a","#a8e070","#fff7b0"];
    fx.parts.push({x:cx+(Math.random()-.5)*40,y:cy-10,vx:(Math.random()-.5)*12,vy:-18-Math.random()*14,life:1.5+Math.random()*2,max:3.5,size:1+((Math.random()*2)|0),c:col[(Math.random()*3)|0]});}
}

root.HWRender={init,resize,render,tickFx,cam,fx,markTile,markAll,zoomAt,focusTile,updateCamera,screenToTile,clampCam,addFloat,spawnTreeParticles,
  get vw(){return vw;},get vh(){return vh;},get hover(){return hover;},set hover(v){hover=v;},get sel(){return sel;},set sel(v){sel=v;},cv,mmCv};
})(window);
