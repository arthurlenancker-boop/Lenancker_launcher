# Brief de recherche — Cartes mémos : répétition espacée et test actif

Fondements scientifiques de l'app **Révision** (cartes mémos) du Lenancker
Launcher. Même démarche que pour l'app Focus : chaque choix d'interface découle
de la littérature, avec les limites assumées.

## 1. La courbe de l'oubli et l'effet d'espacement

- **Ebbinghaus (1885)** — *Über das Gedächtnis* : la rétention décroît
  exponentiellement après l'apprentissage ; chaque rappel réussi « aplatit »
  la courbe suivante. C'est la base empirique de la répétition espacée.
- **Cepeda et al. (2006)** — méta-analyse de 254 expériences (184 sourates…
  839 tests) : l'espacement améliore durablement la rétention par rappel
  massé (« cramming »). L'intervalle optimal croît avec l'horizon de
  rétention (≈ 10-20 % de l'horizon pour un rappel à long terme).

Conclusion retenue : réviser **juste avant d'oublier**, à intervalles croissants
— pas à intervalles fixes.

## 2. SM-2 : l'algorithme d'ordonnancement (Wozniak, SuperMemo)

- **Wozniak (1990)** — *Economics of Learning* (SuperMemo) : SM-2 associe à
  chaque item une **facilité** (ease, facteur de difficulté ≥ 1,3) et un
  **intervalle** en jours ; la note de rappel (qualité) ajuste l'un et l'autre.
- **Anki** adapte SM-2 avec quatre boutons de rappel (Encore / Difficile /
  Moyen / Facile), un plancher d'ease à 1,3, et un échelonnement des premiers
  pas d'apprentissage. C'est cette variante, simple et éprouvée par des
  millions d'utilisateurs, que nous implémentons :

| Bouton | Effet SM-2 modifié |
| --- | --- |
| Encore | intervalle remis à zéro, ré-affichage dans la session (≈ 10 min), ease −0,20, oublis + 1 |
| Difficile | intervalle × 1,2, ease −0,15 |
| Moyen | intervalle × ease |
| Facile | intervalle × ease × 1,3, ease +0,15 |

Premier « vrai » rappel : 1-2-4 jours selon la difficulté déclarée. Intervalle
cappé à 1 an. L'algorithme vit dans `core.js`, **pur et testable sous Node**
comme le moteur de Focus.

## 3. Le test actif (testing effect)

- **Roediger & Karpicke (2006)** — *Test-Enhanced Learning*: se **tester** retient
  mieux que relire, surtout à une semaine et plus ; l'effet persiste sur
  l'apprentissage applicatif, pas seulement le rappel par cœur.
- **Bjork & Bjork (2011)** — *desirable difficulties* : l'effort de récupération
  est précieux — ne pas révéler la réponse trop vite. D'où l'interface : le
  recto s'affiche, la réponse n'apparaît **que** sur action explicite, et
  l'auto-évaluation précède la correction.
- **Karpicke & Blunt (2011)** — le test actif rivalise avec le mind-mapping
  pour l'apprentissage conceptuel.

Conclusion retenue : l'unité de révision est une **question-réponse**
(recto/verso) que l'on évalue soi-même, pas une fiche qu'on relit.

## 4. Absence d'ambiguïté sur les priorités

- **Reprise de session courte et quotidienne** : la régularité bat le volume
  (Cepeda et al. 2006) ; l'app affiche « à réviser aujourd'hui » et une série
  de jours, comme Focus — pas de compteur de honte, pas de gamification
  punitive (les rapports TDA/H du brief Focus valent ici : récompense douce,
  jamais de sanction).
- **Nouvelles cartes plafonnées par jour** (20 par défaut, réglable) : éviter
  l'empilement de cartes nouvelles qui étoufferait les révisions dues.

## 5. Stockage (PWA) — décisions

Les cartes sont du texte compact : quelques milliers de cartes tiennent
largement dans localStorage (≈ 1-2 Mo). Reprends la pile éprouvée de Focus :

1. **Stockage en cascade** (`lenanckerStorage` dans `common.js`) :
   localStorage → sessionStorage → mémoire, avec miroir en RAM.
2. **`navigator.storage.persist()`** demandé dès la première donnée écrite
   (réduit l'éviction sur Android/PWA).
3. **Export/Import JSON** (paquets, cartes, série de jours), fusion sans
   doublon par identifiant — portable entre site, localhost et .exe.
4. **Pas de journal de révisions** : seuls les compteurs agrégés par carte
   sont stockés (ease, interval, répétitions, oublis, dernière révision) —
   le volume reste borné même à long terme.

## 6. Choix assumés et limites

- Une seule **direction d'étude** par carte (recto → verso) ; le double sens
  arrive si le besoin s'en fait ressentir — pas de complexité préventive.
- Le texte simple (Markdown léger : gras, listes) suffit ; les images par
  carte alourdiraient le stockage et sortent du périmètre école actuel.
- Les révisions d'une même session mélangent les due les plus anciennes
  d'abord, puis les nouvelles dans l'ordre de création — pas d'interleaving
  multi-paquets en v1 (Kornell & Bjork 2008 plaident pour, mais l'app se
  voulait simple et le besoin réel reste à prouver).

## Références

1. Ebbinghaus, H. (1885). *Über das Gedächtnis*. Duncker & Humblot.
2. Wozniak, P. (1990). *Economics of Learning* (SuperMemo SM-2). SuperMemo R&D.
3. Cepeda, N. J., Pashler, H., Vul, E., Wixted, J. T., & Rohrer, D. (2006).
   Distributed practice in verbal recall tasks: A review and quantitative
   synthesis. *Psychological Bulletin*, 132(3), 354-380.
4. Roediger, H. L., & Karpicke, J. D. (2006). Test-enhanced learning: Taking
   memory tests improves long-term retention. *Psychological Science*, 17(3), 249-255.
5. Bjork, R. A., & Bjork, E. L. (2011). Making things hard on yourself, but in
   a good way: Creating desirable difficulties to enhance learning.
   In *Psychology and the real world*. Worth.
6. Karpicke, J. D., & Blunt, M. R. (2011). Retrieval practice produces more
   learning than concept mapping. *Science*, 331(6018), 772-775.
7. Kornell, N., & Bjork, R. A. (2008). Learning concepts and categories: Is
   spacing the « enemy of induction »? *Psychological Science*, 19(6), 585-592.
