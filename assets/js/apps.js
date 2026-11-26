/* Registre des applications du launcher.
   Pour ajouter une app : créer apps/<slug>/index.html puis l'ajouter ici.
   galaxyIcon : SVG autonome (data URI) affiché par la galaxie de la page
   d'accueil — versions haute résolution avec dégradé et contour.
   featured: true donne à la carte la forme vedette de l'accueil
   (bandeau pleine largeur, horizontal). */
window.LENANCKER_APPS = [
  {
    slug: 'ocr',
    featured: true,
    name: 'OCR Mistral',
    desc: "Extrais le texte de tes images et PDF (cours, scans, fiches) via l'API Mistral OCR : Markdown copiable, export LibreOffice Writer .odt éditable ou HTML riche à coller dans ton traitement de texte. Scans annotés au stylo : le manuscrit est repéré, puis séparé, ignoré ou transcrit selon tes préférences, mémorisées.",
    icon: 'scan',
    galaxyIcon: 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22256%22%20height%3D%22256%22%20viewBox%3D%220%200%20256%20256%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22b%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%220%22%20y2%3D%221%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23ff6428%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23ca440f%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22256%22%20height%3D%22256%22%20rx%3D%2252%22%20fill%3D%22url(%23b)%22%2F%3E%3Crect%20x%3D%221.5%22%20y%3D%221.5%22%20width%3D%22253%22%20height%3D%22253%22%20rx%3D%2250.5%22%20fill%3D%22none%22%20stroke%3D%22rgba(15%2C14%2C11%2C.28)%22%20stroke-width%3D%223%22%2F%3E%3Cg%20transform%3D%22translate(40%2040)%20scale(7.3333)%22%20fill%3D%22none%22%20stroke%3D%22%230f0e0b%22%20stroke-width%3D%221.8%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M3%207V5a2%202%200%200%201%202-2h2%22%2F%3E%3Cpath%20d%3D%22M17%203h2a2%202%200%200%201%202%202v2%22%2F%3E%3Cpath%20d%3D%22M21%2017v2a2%202%200%200%201-2%202h-2%22%2F%3E%3Cpath%20d%3D%22M7%2021H5a2%202%200%200%201-2-2v-2%22%2F%3E%3Cline%20x1%3D%227%22%20y1%3D%2212%22%20x2%3D%2217%22%20y2%3D%2212%22%2F%3E%3Cline%20x1%3D%227%22%20y1%3D%228%22%20x2%3D%2213%22%20y2%3D%228%22%2F%3E%3Cline%20x1%3D%227%22%20y1%3D%2216%22%20x2%3D%2215%22%20y2%3D%2216%22%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E',
    tint: 'rgba(255, 83, 16, 0.12)',
    accent: '#ff5310',
    status: 'disponible',
    href: 'apps/ocr/index.html',
  },
  {
    slug: 'journee',
    name: 'Journée',
    desc: "Ta journée calée sur ta biologie. Un quiz sans IA à la première ouverture (classe au lycée, spés selon le niveau, horaires réels) puis chaque créneau découle de la chronobiologie : inertie du sommeil au réveil, cartes du matin, devoirs exigeants d'abord et matières entrelacées en blocs de 45 min, pause active au creux post-déjeuner, rappel du soir juste avant le coucher, durée de nuit affichée face à la recommandation 8-10 h. Fondé sur le brief recherche docs/recherche-journee-chronobiologie.md.",
    icon: 'jour',
    galaxyIcon: 'data:image/svg+xml,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"256\" height=\"256\" viewBox=\"0 0 256 256\"><defs><linearGradient id=\"b\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#c7a8ff\"/><stop offset=\"1\" stop-color=\"#8d6cd4\"/></linearGradient></defs><rect width=\"256\" height=\"256\" rx=\"52\" fill=\"url(#b)\"/><rect x=\"1.5\" y=\"1.5\" width=\"253\" height=\"253\" rx=\"50.5\" fill=\"none\" stroke=\"rgba(15,14,11,.28)\" stroke-width=\"3\"/><g transform=\"translate(40 40) scale(7.3333)\" fill=\"none\" stroke=\"#0f0e0b\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M4 17h16\"/><path d=\"M12 13a4 4 0 0 0 4-4 4 4 0 0 0-8 .5h4\"/><path d=\"M5 3.5 6.2 5.6M19 3.5 17.8 5.6M12 2.5V4.5\"/></g></svg>',
    tint: 'rgba(183, 156, 255, 0.12)',
    accent: '#b79cff',
    status: 'disponible',
    href: 'apps/journee/index.html',
  },

  {
    slug: 'signes',
    name: 'Tableau de signes',
    desc: "Le tableau de signes d'une fonction calculé pour toi : écris f(x) factorisée ((2x-1)(x+3)/(x-2)) ou développée (x²-3x+2), une ligne par facteur, la fonction en dernière ligne. Là où la fonction s'annule, un 0 est posé sur la barre verticale qui le coupe en son milieu ; dénominateur nul, double barre de valeur interdite. Racines exactes en fractions (1/2) ou arrondies (≈ 1,41), calculs exacts (rationnels BigInt), export PNG (≈ 300 dpi) et SVG.",
    icon: 'signes',
    galaxyIcon: 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22256%22%20height%3D%22256%22%20viewBox%3D%220%200%20256%20256%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22b%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%220%22%20y2%3D%221%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%2393e8d8%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%234ba898%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22256%22%20height%3D%22256%22%20rx%3D%2252%22%20fill%3D%22url%28%23b%29%22%2F%3E%3Crect%20x%3D%221.5%22%20y%3D%221.5%22%20width%3D%22253%22%20height%3D%22253%22%20rx%3D%2250.5%22%20fill%3D%22none%22%20stroke%3D%22rgba%2815%2C14%2C11%2C.28%29%22%20stroke-width%3D%223%22%2F%3E%3Cg%20transform%3D%22translate%2840%2040%29%20scale%287.3333%29%22%20fill%3D%22none%22%20stroke%3D%22%230f0e0b%22%20stroke-width%3D%221.8%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Crect%20x%3D%223%22%20y%3D%224%22%20width%3D%2218%22%20height%3D%2216%22%20rx%3D%221.5%22%2F%3E%3Cpath%20d%3D%22M9%204v16%22%2F%3E%3Cpath%20d%3D%22M3%209.5h18%22%2F%3E%3Cellipse%20cx%3D%229%22%20cy%3D%226.75%22%20rx%3D%221.3%22%20ry%3D%221.7%22%2F%3E%3Cpath%20d%3D%22M14%2012.6h3%22%2F%3E%3Cpath%20d%3D%22M15.5%2011.1v3%22%2F%3E%3Cpath%20d%3D%22M4.6%2015.6h3.8%22%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E',
    tint: 'rgba(98, 214, 194, 0.12)',
    accent: '#62d6c2',
    status: 'disponible',
    href: 'apps/signes/index.html',
  },
  {
    slug: 'focus',
    name: 'Focus',
    desc: "Sessions de concentration calibrées TDA/H & TSA d'après la littérature scientifique : mode Flux (pause quand le flow casse, jamais d'horloge imposée), temps toujours visible, bruit blanc/rose/marron, pauses actives, body doubling local, plan « si-alors » et récompense liée à ton centre d'intérêt.",
    icon: 'timer',
    galaxyIcon: 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22256%22%20height%3D%22256%22%20viewBox%3D%220%200%20256%20256%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22b%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%220%22%20y2%3D%221%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23eabb5d%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23b88f3d%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22256%22%20height%3D%22256%22%20rx%3D%2252%22%20fill%3D%22url(%23b)%22%2F%3E%3Crect%20x%3D%221.5%22%20y%3D%221.5%22%20width%3D%22253%22%20height%3D%22253%22%20rx%3D%2250.5%22%20fill%3D%22none%22%20stroke%3D%22rgba(15%2C14%2C11%2C.28)%22%20stroke-width%3D%223%22%2F%3E%3Cg%20transform%3D%22translate(40%2040)%20scale(7.3333)%22%20fill%3D%22none%22%20stroke%3D%22%230f0e0b%22%20stroke-width%3D%221.8%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Ccircle%20cx%3D%2212%22%20cy%3D%2213%22%20r%3D%228%22%2F%3E%3Cpath%20d%3D%22M12%209v4l2.5%202.5%22%2F%3E%3Cpath%20d%3D%22M9%202h6%22%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E',
    tint: 'rgba(232, 179, 75, 0.12)',
    accent: '#e8b34b',
    status: 'disponible',
    href: 'apps/focus/index.html',
  },
  {
    slug: 'revision',
    name: 'Révision',
    desc: "Cartes mémos à répétition espacée : chaque carte est une question-réponse, le test actif fait le travail de mémorisation. Chaque paquet choisit sa méthode : SM-2 (Encore / Difficile / Moyen / Facile, replanifié juste avant l'oubli) ou Boîte de Leitner (réussie la carte monte de boîte en boîte — jour, 2 jours, semaine, 2 semaines, puis acquise ; ratée elle retourne en boîte 1, confettis en boîte 5, progression du paquet en % acquis, révision ciblée par boîte, recherche par texte ou « boîte : N »). Méthode changeable à tout moment sans perdre la progression. Fondé sur le brief répétition espacée & test actif.",
    icon: 'brain',
    galaxyIcon: 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22256%22%20height%3D%22256%22%20viewBox%3D%220%200%20256%20256%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22b%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%220%22%20y2%3D%221%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%2388ca8c%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23639c65%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22256%22%20height%3D%22256%22%20rx%3D%2252%22%20fill%3D%22url(%23b)%22%2F%3E%3Crect%20x%3D%221.5%22%20y%3D%221.5%22%20width%3D%22253%22%20height%3D%22253%22%20rx%3D%2250.5%22%20fill%3D%22none%22%20stroke%3D%22rgba(15%2C14%2C11%2C.28)%22%20stroke-width%3D%223%22%2F%3E%3Cg%20transform%3D%22translate(40%2040)%20scale(7.3333)%22%20fill%3D%22none%22%20stroke%3D%22%230f0e0b%22%20stroke-width%3D%221.8%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M9.5%202A2.5%202.5%200%200%200%207%204.5v.55A3.5%203.5%200%200%200%204.5%208.5c0%20.74.23%201.43.62%202A3.5%203.5%200%200%200%204%2013.5%203.5%203.5%200%200%200%207.5%2017H8a2.5%202.5%200%200%200%204%202v-17z%22%2F%3E%3Cpath%20d%3D%22M14.5%202A2.5%202.5%200%200%201%2017%204.5v.55a3.5%203.5%200%200%201%202.5%203.45c0%20.74-.23%201.43-.62%202a3.5%203.5%200%200%201%201.12%203%203.5%203.5%200%200%201-3.5%203.5H16a2.5%202.5%200%200%201-4%202v-17z%22%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E',
    tint: 'rgba(123, 196, 127, 0.12)',
    accent: '#7bc47f',
    status: 'disponible',
    href: 'apps/revision/index.html',
  },
  {
    slug: 'probabilites',
    featured: true,
    name: 'Arbre de probabilité',
    desc: "Dessine pas à pas un arbre de probabilité pondéré (jusqu'à 4 niveaux) : nomme l'expérience, chaque événement et son contraire (barre ou accent au-dessus de la lettre), choisis pour chaque branche « feuille » ou « développer », puis saisis à la main probabilités et résultats des chemins — l'outil ne calcule jamais rien, il ne fait que dessiner. Feuille blanche style manuel de maths, présence (probabilités au milieu des branches, feuilles alignées à droite), case « Total des issues » en option, exports PNG (≈ 300 dpi) et SVG, et réutilisation comme modèle (structure gardée, valeurs vidées).",
    icon: 'arbre',
    galaxyIcon: 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22256%22%20height%3D%22256%22%20viewBox%3D%220%200%20256%20256%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22b%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%220%22%20y2%3D%221%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23a8c7ff%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%237f9ac9%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22256%22%20height%3D%22256%22%20rx%3D%2252%22%20fill%3D%22url(%23b)%22%2F%3E%3Crect%20x%3D%221.5%22%20y%3D%221.5%22%20width%3D%22253%22%20height%3D%22253%22%20rx%3D%2250.5%22%20fill%3D%22none%22%20stroke%3D%22rgba(15%2C14%2C11%2C.28)%22%20stroke-width%3D%223%22%2F%3E%3Cg%20transform%3D%22translate(40%2040)%20scale(7.3333)%22%20fill%3D%22none%22%20stroke%3D%22%230f0e0b%22%20stroke-width%3D%221.8%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Ccircle%20cx%3D%225%22%20cy%3D%2212%22%20r%3D%222.2%22%2F%3E%3Ccircle%20cx%3D%2217.5%22%20cy%3D%226.5%22%20r%3D%222.2%22%2F%3E%3Ccircle%20cx%3D%2217.5%22%20cy%3D%2217.5%22%20r%3D%222.2%22%2F%3E%3Cpath%20d%3D%22M7.1%2011.1%2015.4%207.3%22%2F%3E%3Cpath%20d%3D%22M7.1%2012.9%2015.4%2016.7%22%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E',
    tint: 'rgba(158, 193, 255, 0.12)',
    accent: '#9ec1ff',
    status: 'disponible',
    href: 'apps/probabilites/index.html',
  }];
