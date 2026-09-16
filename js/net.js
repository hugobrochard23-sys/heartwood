"use strict";
/* ============================================================
   HEARTWOOD — couche réseau
   ------------------------------------------------------------
   L'interface n'appelle jamais engine.applyOrder directement :
   elle passe par un "transport". Aujourd'hui, le seul transport
   est local (solo contre des bots). Pour le multijoueur, il
   suffira d'ajouter un transport WebSocket qui envoie les ordres
   au serveur et reçoit les ordres des autres joueurs, sans
   toucher au moteur ni à l'interface.

   Protocole prévu (à implémenter côté serveur) :
     client → serveur : {t:"order", order:{type,pid,...}}
     serveur → clients : {t:"tick", n, orders:[...]}  (pas de temps synchronisé)
     serveur → clients : {t:"start", seed, players:[...]}
   Le moteur étant déterministe (même graine → même partie), il
   suffit de rejouer les mêmes ordres au même tic partout.
   ============================================================ */
(function(root){
class LocalTransport{
  constructor(engine){this.engine=engine;this.mode="solo";}
  send(order){return this.engine.applyOrder(order);}
  close(){}
}
class RemoteTransport{
  constructor(){this.mode="online";}
  send(){throw new Error("Multijoueur : pas encore disponible.");}
  close(){}
}
root.HWNet={LocalTransport,RemoteTransport,ONLINE_READY:false};
})(window);
