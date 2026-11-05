/* Registre des applications du launcher.
   Pour ajouter une app : créer apps/<slug>/index.html puis l'ajouter ici. */
window.LENANCKER_APPS = [
  {
    slug: 'ocr',
    name: 'OCR Mistral',
    desc: "Extrais le texte de tes images et PDF (cours, scans, fiches) en Markdown, via l'API Mistral OCR.",
    icon: 'scan',
    tint: 'rgba(255, 83, 16, 0.12)',
    accent: '#ff5310',
    status: 'disponible',
    href: 'apps/ocr/index.html',
  },
  {
    slug: 'pomodoro',
    name: 'Pomodoro',
    desc: "Sessions de concentration chronométrées avec pause automatique et suivi de tes sessions de travail.",
    icon: 'timer',
    tint: 'rgba(232, 179, 75, 0.12)',
    accent: '#e8b34b',
    status: 'bientôt',
  },
  {
    slug: 'revision',
    name: 'Révision',
    desc: "Fiches de révision espacées et quiz actifs, calibrés sur les principes de la répétition espacée et du test actif.",
    icon: 'brain',
    tint: 'rgba(123, 196, 127, 0.12)',
    accent: '#7bc47f',
    status: 'bientôt',
  },
];
