# HEARTWOOD

> **BUILD YOUR ARMY. BECOME #1. FIGHT THE GUARDIAN. TRUST NO ONE.**

Jeu de conquête multijoueur de 15 minutes, jouable dans le navigateur, sans installation.
Douze empires autour de l'Arbre-Monde. À 15:00, le joueur #1 obtient le droit d'invoquer le
Gardien. Plus il y a de joueurs contre le Gardien, plus il est fort. Quand il tombe, le Cœur
apparaît et toutes les alliances s'effondrent : celui qui tient le Cœur 30 secondes gagne.

Heartwood est construit à partir d'une copie de **Noirium** (`reference/noirium.html`, conservé
tel quel pour mémoire), entièrement retravaillée : plus d'or, de pétrole, de marché ni de
bâtiments ; la guerre, la diplomatie, le boss et la trahison sont le cœur du jeu.

## Lancer le jeu

Aucune compilation. Deux façons :

- **En local** : ouvrir `index.html` dans un navigateur (double-clic suffit).
- **Sur un site web** : copier le dossier tel quel (`index.html`, `css/`, `js/`) sur n'importe
  quel hébergement statique (GitHub Pages, Netlify, OVH, un simple dossier sur un serveur).
  Le dossier `reference/` et `tools/` ne sont pas nécessaires en ligne.

## Règles (V1)

| Élément | Fonctionnement |
| --- | --- |
| Carte | Île 64×48 cases générée à chaque partie, Arbre-Monde au centre, 8 racines. 12 capitales sur un anneau. |
| Armée | Grandit toute seule : `0,3 + 0,35 × √cases` soldats/s, plafond `30 + 8 × √cases + 0,8 × cases`. |
| Pouvoir ⚡ | `0,6 + 0,015 × cases + 0,35 × racines` par seconde. Sert aux capacités et à la diplomatie. |
| Conquête | Clic sur une case voisine : une part de l'armée (curseur 10–100 %) part conquérir case après case. Case neutre : 2 soldats (3 en montagne). |
| Défense | Garnison par case = armée ÷ cases × terrain (forêt ×1,3, montagne ×1,8, fortifiée ×2). L'attaquant perd la garnison, le défenseur la moitié. |
| Capitale | Défense = max(4 × garnison, 50 % de l'armée, 25 + 0,6 × cases). Capitale prise = empire éliminé, ses terres redeviennent neutres. |
| Trêve | 90 s (45 en difficile, 120 en facile) : personne n'attaque personne. |
| Classement | % des terres. Le #1 à 15:00 obtient le droit d'invoquer le Gardien (12 s pour le faire, sinon auto). |
| Coalition | Dès 3:00, si le #1 dépasse 20 % : les bots se liguent contre lui jusqu'à ce qu'il retombe sous 15 %. |
| Alliances | 20 ⚡ pour proposer. Un allié ne peut pas t'attaquer. Trahir = marque du parjure 3 min (plus personne ne s'allie à toi). |
| Capacités | Ralliement 60 ⚡ (+40 % d'attaque 20 s), Fortifier 30 ⚡ (défense ×2 sur une case), Offrir 25 ⚡ (améliore la relation). |
| Gardien | PV de base = max(300, 42 % de toutes les armées vivantes). Renfort par adversaire : 1 → 100 %, 2 → 160 %, 3 → 230 %, 4 → 310 %, 5 → 400 %, 6+ → 500 %. 1 soldat arrivé = 1 dégât (×1,25 pour l'invocateur). Il corrompt les terres autour de l'Arbre, puis celles de qui le frappe le plus. Retrait au bout de 3 min. |
| Cœur | Toutes les alliances tombent. Envoyer des soldats au centre. Prendre le Cœur coûte 1,5 × la garnison en place. Tenir 30 s = victoire (+8 s à chaque changement de mains, 75 s max). |

Les valeurs se règlent dans `js/engine.js` (constantes en tête de fichier, `armyCap`, `growth`,
`garrison`, `startBoss`, `stepBoss`) et `js/bots.js` (`PCT`, `attack`, `bossAct`, `heartAct`).

## Structure

```
index.html        page unique (écran titre, HUD, carte, panneau, modales)
css/style.css     style pixel (forêt sombre, or, corruption violette)
js/util.js        utilitaires + générateur aléatoire déterministe
js/engine.js      MOTEUR : tout l'état et toutes les règles, sans DOM
js/bots.js        IA des 11 bots (4 caractères : belliqueux, expansionniste, fourbe, diplomate)
js/net.js         couche transport (locale aujourd'hui, WebSocket demain)
js/audio.js       sons 8 bits synthétisés
js/render.js      rendu canvas : terrain, caméra, minimap, Arbre, Gardien, Cœur
js/ui.js          HUD, panneau latéral, entrées souris/tactile/clavier, tutoriel, écrans
js/main.js        démarrage et boucle principale
tools/simulate.js simulation sans interface pour équilibrer (node tools/simulate.js 10)
reference/        copie d'origine de Noirium
```

## Multijoueur : ce qui est prêt, ce qui manque

Prêt :
- Le moteur (`engine.js`) ne touche jamais au DOM et ne connaît pas les bots : il reçoit des
  **ordres** (`{type:"attack", pid, tile, pct}`, `ally`, `betray`, `sendBoss`…) via
  `applyOrder` et avance avec `step(dt)`.
- Il est **déterministe** : même graine + mêmes ordres = même partie. C'est la base d'un
  multijoueur en « lockstep » (chaque client rejoue les mêmes ordres).
- L'interface envoie ses ordres via `HWNet.LocalTransport` (`net.js`). Le bouton MULTIJOUEUR
  existe et affiche « bientôt ».

Manque :
- Un serveur (Node + WebSocket) qui crée une salle, distribue la graine, horodate les ordres
  par tic et les rediffuse. `RemoteTransport` dans `net.js` en est l'emplacement.
- Remplacer certains bots par des humains : `new Engine({humans:[{name},{name}…]})` accepte
  déjà plusieurs humains (les places restantes sont des bots).

## Équilibrage

`node tools/simulate.js 10 1` joue 10 parties entre bots (graines 1 à 10) et affiche : fin de
partie, durée, gagnant, PV du Gardien, nombre d'attaquants, survivants à 15:00, part du #1.
`-v` détaille minute par minute. Objectif visé : 4 à 7 survivants à 15:00, #1 entre 25 et 40 %,
Gardien tué en 1 à 2 minutes.
