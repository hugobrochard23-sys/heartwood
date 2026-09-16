"use strict";
/* ============================================================
   HEARTWOOD — utilitaires partagés (sans DOM : utilisables en Node)
   ============================================================ */
(function(root){
  const clamp=(v,a,b)=>v<a?a:v>b?b:v;
  // Générateur pseudo-aléatoire déterministe (mulberry32).
  // Le moteur n'utilise QUE ce générateur : une même graine rejoue la même partie,
  // ce qui est indispensable pour un futur multijoueur synchronisé.
  function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
  function makeRng(seed){
    const r=mulberry32(seed);
    const rnd=(a=1,b)=>b===undefined?r()*a:a+r()*(b-a);
    return {
      r, rnd,
      ri:(a,b)=>Math.floor(rnd(a,b+1)),
      pick:arr=>arr[Math.floor(r()*arr.length)],
      chance:p=>r()<p,
    };
  }
  const fmt=n=>Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g," ");
  const fmtTime=s=>{s=Math.max(0,Math.ceil(s));return `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;};
  const hexRgb=c=>{const n=parseInt(c.slice(1),16);return [(n>>16)&255,(n>>8)&255,n&255];};
  root.HWU={clamp,mulberry32,makeRng,fmt,fmtTime,hexRgb};
})(typeof window!=="undefined"?window:globalThis);
