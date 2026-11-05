# Brief de recherche — Comment se concentrer le mieux quand on a un TDA/H ou un TSA

Objectif : fonder le design de l'app **Pomodoro/Focus** du Lenancker Launcher sur des
stratégies **soutenues par des études scientifiques publiées** (revues systématiques,
méta-analyses, essais contrôlés, recommandations cliniques), pas sur des intuitions.

Recherches effectuées le 05/11/2026 (sources vérifiées via moteurs académiques et éditeurs).

---

## 1. TDA/H (ADHD)

### 1.1 Cadre clinique de référence
- **NICE NG87** (2018, mis à jour 2025) : modifications environnementales d'abord,
  intervention psychologique structurée centrée TDA/H ; médicaments si gêne significative
  persistante. https://www.nice.org.uk/guidance/ng87
- **Lancet Psychiatry 2025** (méta-analyse en réseau, PIIS2215-0366(24)00360-2) et
  revue systématique 2025 (PMC11825462) : la **TCC est efficace à court et long terme**
  sur les symptômes TDA/H. Les interventions comportementales sont le socle non médicamenteux.

### 1.2 La technique Pomodoro elle-même :证据 nuancée
- **Aucun essai randomisé** de la méthode Pomodoro n'existe spécifiquement chez des
  personnes TDA/H (CHADD la recommande comme avis d'expert, avec les minuteurs visuels,
  pour la « cécité du temps » / time blindness).
- **Étude contrôlée en ligne 2024, n = 94 étudiants** (Smits, Wenzel, de Vries et al.,
  *Healthcare* 15(7):861, MDPI, données 2024) comparant **Pomodoro 25/5 vs Flowtime vs
  pauses auto-régulées** : aucune différence globale de productivité, d'achèvement ou de
  flow... **MAIS** les pauses Pomodoro systématiques entraînent une **augmentation plus
  rapide de la fatigue et un déclin plus rapide de la motivation** que les pauses
  auto-régulées. Confirmé par le suivi 2025 (*Healthcare* 16(7):1158).
- **« Smart-Pomodoro » 2025** (Taylor & Francis, DOI 10.1080/10447318.2025.2542886) :
  minuteurs **gamifiés/wearable** améliorent gestion du temps, engagement et focus chez
  des enfants TDA/H.

> **Implication design** : ne PAS imposer 25/5 rigide. Proposer par défaut un mode
> **Flowtime** (pause quand le flow casse, avec durée min/max), le Pomodoro classique en
> option, et des durées entièrement personnalisables. Externaliser le temps visuellement
> (gros anneau + compte à rebours lisible) contre la cécité du temps.

### 1.3 Body doubling (travail à côté de quelqu'un)
- **Eagle, Baltaxe-Admony & Ringland 2024**, *ACM Transactions on Accessible Computing*,
  DOI 10.1145/3689648 — enquête n = 220 (88 % neurodivergents) : le body doubling aide à
  **démarrer, maintenir l'attention et terminer** les tâches.
- Étude VR 2025 (ResearchGate 395526867) : partenaires humains **et** doubles IA
  soutiennent l'attention et réduisent la distraction.

> **Implication design** : mode « body doubling » local (sessions synchronisées entre
> onglets/appareils via BroadcastChannel : « 2 personnes en session en ce moment »),
> sans serveur.

### 1.4 Fidgeting / mouvement (ne pas rester immobile)
- **UC Davis MIND Institute, Frontiers in Psychiatry 2024** (PMC11246969, Rezaei et al.,
  Schweitzer) : le fidgeting est **associé à une meilleure attention soutenue** chez les
  TDA/H. Communiqué UC Davis (oct. 2024) : « good evidence that fidgeting is associated
  with better attention ».
- **PMC13232519 (2025, UC Davis)** : les objets fidget réduisent l'anxiété chez l'adulte
  TDA/H.

> **Implication design** : autoriser explicitement le mouvement pendant la session
> (pas de « reste assis »), et proposer des **pauses actives** (2–5 min de mouvement).

### 1.5 Bruit ambiant (white/pink/brown noise)
- **Méta-analyse JAACAP 2024** (PMC11283987 ; S0890856724000741) : 13 essais randomisés,
  335 jeunes — le bruit blanc/rose améliore **légèrement mais significativement**
  l'attention chez les TDA/H ou symptômes élevés (g ≈ 0,25), avec un léger coût pour
  les neurotypiques (g ≈ −0,21).

> **Implication design** : générateur de bruit blanc/rose/marron intégré (WebAudio, sans
> fichier audio), désactivable, volume réglable.

### 1.6 Pauses actives / activité physique
- Méta-analyse **PLOS ONE 2023** (10.1371/journal.pone.0289732) : l'activité physique
  améliore les fonctions exécutives des enfants TDA/H.
- **Chueh et al. 2025, Psychology of Sport and Exercise** : une seule séance d'activité
  modérée à vigoureuse améliore les fonctions exécutives chez l'enfant TDA/H.
- Méta-analyses « active breaks » en classe (PMC8224334 ; *Eur. J. Pediatr.* 2026) :
  les pauses actives améliorent l'attention.

> **Implication design** : les pauses proposées sont **actives** (étirements, marche,
  10 squats...) avec un mini-guide, pas « médite en silence » obligatoire.

---

## 2. TSA (autisme)

### 2.1 Supports visuels, emplois du temps, prévisibilité
- **Emplois du temps visuels / visual schedules** : pratique **evidence-based** reconnue
  (revue Hume et al., ResearchGate 264433046 ; ASATONLINE). Revue systématique T&F 2024
  (DOI 10.1080/20473869.2024.2402124) : les emplois du temps visuels **augmentent le
  temps passé sur la tâche** (on-task behavior) en rendant la séquence **prédictible**.
- **TEACCH / enseignement structuré** (PMC12771134, PMC12505950) : structure + traitement
  visuel de l'information, améliore les compétences adaptatives ; hétérogénéité des
  profils à respecter.

> **Implication design** : la session affiche un **déroulement visuel clair**
> (préparer → session → pause → récompense) avec coches, le temps restant toujours
> visible, **aucune surprise** (pas de pop-up agressive, sons doux optionnels).

### 2.2 Intérêts restreints / spéciaux comme levier de motivation
- Revue systématique **Dachez & Ndobo 2018**, *Research in Autism Spectrum Disorders* 57,
  63–86 (DOI 10.1016/j.rasd.2018.09.008) : intégrer les intérêts circonscrits dans les
  interventions améliore l'engagement.
- Étude pilote fMRI (PMC11996578) : les intérêts spéciaux activent davantage les
  régions de la récompense/salience. *The Transmitter* (2024, n = 610) : les personnes
  autistes sont **plus intrinsèquement motivées** par leurs intérêts spéciaux.

> **Implication design** : champ « ma récompense liée à mon centre d'intérêt » après la
> session (ex. 10 min de lecture sur ton sujet), et option de lier les séries de points
> à ce centre d'intérêt.

### 2.3 Environnement sensoriel
- Les recommandations convergent (TEACCH, revues EBP) : réduire les stimuli non
  essentiels, proposer un mode sobre, respecte `prefers-reduced-motion` + bascule
  manuelle.

> **Implication design** : thème sombre calme déjà en place, **bascule « réduire les
> animations »** dans l'app, pas de notifications visuelles forcées, sons au choix
> (aucun / doux / tic-tac).

---

## 3. Synthèse — fonctionnalités de l'app Focus qui en découlent

| Preuve | Fonctionnalité concrète |
| --- | --- |
| Smits et al. 2024/2025 : pauses auto-régulées > Pomodoro rigide pour fatigue/motivation | Mode **Flowtime par défaut** (pause quand on veut, bornes min/max), Pomodoro 25/5 en option, durées custom |
| CHADD / NICE : externaliser le temps (time blindness) | Gros **anneau de progression + compte à rebours** toujours visible |
| Smart-Pomodoro 2025 : gamification | Points, séries (streaks), bilan de session |
| Eagle et al. 2024 : body doubling | Sessions synchronisées multi-onglets via **BroadcastChannel** (« N en session ») |
| UC Davis 2024/2025 : fidgeting utile | Option « je peux bouger » + fidget visuel discret pendant la pause |
| JAACAP 2024 : bruit blanc/rose aide le TDA/H | **Générateur de bruit** blanc/rose/marron (WebAudio) + volume |
| Méta-analyses pauses actives : mouvement améliore FE | Pauses **actives guidées** (2–5 min), pas immobilité forcée |
| Visual schedules EBP (TSA) | **Déroulement visuel de la session** (checklist préparatif → session → pause → récompense) |
| Dachez & Ndobo 2018 : intérêts spéciaux = levier | Champ « récompense liée à mon centre d'intérêt » |
| TEACCH / prévisibilité | Aucun pop-up surprise, sons doux optionnels, bascule « réduire les animations » |
| TCC / auto-observation (NICE, Lancet Psy 2025) | **Stats** (temps de focus, tâches, distractions notées) + « si-alors » anti-distraction au démarrage |

## 4. Limites honnêtes
- Peu d'essais randomisés testent le Pomodoro **spécifiquement chez des TDA/H** : la
  recommandation repose sur des avis d'experts (CHADD) + études sur étudiants tout-venant.
- Les effets du bruit ambiant sont **petits** (g ≈ 0,25) et spécifiques aux profils
  TDA/H : l'app le propose en option, jamais imposé.
- Hétérogénéité du TSA : tout réglable (durées, sons, animations, récompenses).
