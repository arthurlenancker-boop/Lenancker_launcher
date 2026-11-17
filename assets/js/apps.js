/* Registre des applications du launcher.
   Pour ajouter une app : créer apps/<slug>/index.html puis l'ajouter ici.
   galaxyIcon : SVG autonome (data URI) affiché par la galaxie de la page
   d'accueil — versions haute résolution avec dégradé et contour. */
window.LENANCKER_APPS = [
  {
    slug: 'ocr',
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
    name: 'Arbre de probabilité',
    desc: "Dessine pas à pas un arbre de probabilité pondéré (jusqu'à 4 niveaux) : nomme l'expérience, chaque événement et son contraire (barre ou accent au-dessus de la lettre), choisis pour chaque branche « feuille » ou « développer », puis saisis à la main probabilités et résultats des chemins — l'outil ne calcule jamais rien, il ne fait que dessiner. Feuille blanche style manuel de maths, présence (probabilités au milieu des branches, feuilles alignées à droite), case « Total des issues » en option, exports PNG (≈ 300 dpi) et SVG, et réutilisation comme modèle (structure gardée, valeurs vidées).",
    icon: 'arbre',
    galaxyIcon: 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22256%22%20height%3D%22256%22%20viewBox%3D%220%200%20256%20256%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22b%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%220%22%20y2%3D%221%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23a8c7ff%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%237f9ac9%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22256%22%20height%3D%22256%22%20rx%3D%2252%22%20fill%3D%22url(%23b)%22%2F%3E%3Crect%20x%3D%221.5%22%20y%3D%221.5%22%20width%3D%22253%22%20height%3D%22253%22%20rx%3D%2250.5%22%20fill%3D%22none%22%20stroke%3D%22rgba(15%2C14%2C11%2C.28)%22%20stroke-width%3D%223%22%2F%3E%3Cg%20transform%3D%22translate(40%2040)%20scale(7.3333)%22%20fill%3D%22none%22%20stroke%3D%22%230f0e0b%22%20stroke-width%3D%221.8%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Ccircle%20cx%3D%225%22%20cy%3D%2212%22%20r%3D%222.2%22%2F%3E%3Ccircle%20cx%3D%2217.5%22%20cy%3D%226.5%22%20r%3D%222.2%22%2F%3E%3Ccircle%20cx%3D%2217.5%22%20cy%3D%2217.5%22%20r%3D%222.2%22%2F%3E%3Cpath%20d%3D%22M7.1%2011.1%2015.4%207.3%22%2F%3E%3Cpath%20d%3D%22M7.1%2012.9%2015.4%2016.7%22%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E',
    tint: 'rgba(158, 193, 255, 0.12)',
    accent: '#9ec1ff',
    status: 'disponible',
    href: 'apps/probabilites/index.html',
  },
  {
    /* WordCraft, build web officiel auto-hébergé par le launcher
       (apps/wordcraft/, intégré par le workflow de déploiement — version
       épinglée, somme SHA256 vérifiée). Servi sur la même origine que le
       site, il est pilotable par l'app OCR (protocole host) qui y construit
       les documents recréés par l'IA ; une fois chargé, le service worker
       le garde en cache pour un usage hors-ligne. */
    slug: 'wordcraft',
    name: 'WordCraft',
    desc: "Traitement de texte complet, gratuit et open source, servi par le launcher lui-même (build web officiel, même origine) : ruban, styles, tableaux, suivi des modifications, sommaires et citations, export .docx/.odt/PDF. Quand l'app OCR écrit un document — reconstruction IA, OCR fidèle ou extraction directe — WordCraft le construit : l'éditeur embarqué de l'app l'ouvre, le monte dans son moteur et rend chaque sauvegarde à la page ; cette carte l'ouvre aussi à la main. Le document ne quitte jamais la machine : tout tourne en local.",
    icon: 'doc',
    galaxyIcon: 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22256%22%20height%3D%22256%22%20viewBox%3D%220%200%20256%20256%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22b%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%220%22%20y2%3D%221%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23b998ff%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%238d70c9%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22256%22%20height%3D%22256%22%20rx%3D%2252%22%20fill%3D%22url(%23b)%22%2F%3E%3Crect%20x%3D%221.5%22%20y%3D%221.5%22%20width%3D%22253%22%20height%3D%22253%22%20rx%3D%2250.5%22%20fill%3D%22none%22%20stroke%3D%22rgba(15%2C14%2C11%2C.28)%22%20stroke-width%3D%223%22%2F%3E%3Cg%20transform%3D%22translate(40%2040)%20scale(7.3333)%22%20fill%3D%22none%22%20stroke%3D%22%230f0e0b%22%20stroke-width%3D%221.8%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M15%203H6a2%202%200%200%200-2%202v14a2%202%200%200%200%202%202h12a2%202%200%200%200%202-2V8z%22%2F%3E%3Cpath%20d%3D%22M15%203v5h5%22%2F%3E%3Cpath%20d%3D%22M8%2013h8%22%2F%3E%3Cpath%20d%3D%22M8%2017h5%22%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E',
    tint: 'rgba(177, 140, 255, 0.12)',
    accent: '#b18cff',
    status: 'disponible',
    href: 'apps/wordcraft/',
  },
];
