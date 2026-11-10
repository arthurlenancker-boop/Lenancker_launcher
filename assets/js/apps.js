/* Registre des applications du launcher.
   Pour ajouter une app : créer apps/<slug>/index.html puis l'ajouter ici. */
window.LENANCKER_APPS = [
  {
    slug: 'ocr',
    name: 'OCR Mistral',
    desc: "Extrais le texte de tes images et PDF (cours, scans, fiches) via l'API Mistral OCR : Markdown copiable, export Word .docx éditable ou HTML riche à coller dans ton traitement de texte. Scans annotés au stylo : le manuscrit est repéré, puis séparé, ignoré ou transcrit selon tes préférences, mémorisées.",
    icon: 'scan',
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
    tint: 'rgba(232, 179, 75, 0.12)',
    accent: '#e8b34b',
    status: 'disponible',
    href: 'apps/focus/index.html',
  },
  {
    slug: 'revision',
    name: 'Révision',
    desc: "Cartes mémos à répétition espacée : chaque carte est une question-réponse, SM-2 la replanifie juste avant l'oubli (Encore / Difficile / Moyen / Facile), le test actif fait le travail de mémorisation. Paquets recto/verso, séries de jours, export/import — fondé sur le brief répétition espacée & test actif.",
    icon: 'brain',
    tint: 'rgba(123, 196, 127, 0.12)',
    accent: '#7bc47f',
    status: 'disponible',
    href: 'apps/revision/index.html',
  },
];
