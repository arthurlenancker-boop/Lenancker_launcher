/* Registre des applications du launcher.
   Pour ajouter une app : créer apps/<slug>/index.html puis l'ajouter ici. */
window.LENANCKER_APPS = [
  {
    slug: 'ocr',
    name: 'OCR Mistral',
    desc: "Extrais le texte de tes images et PDF (cours, scans, fiches) en Markdown, via l'API Mistral OCR.",
    icon: 'scan',
    tint: 'rgba(99, 102, 241, 0.18)',
    accent: '#818cf8',
    status: 'disponible',
    href: 'apps/ocr/',
  },
  {
    slug: 'pomodoro',
    name: 'Pomodoro',
    desc: "Sessions de concentration chronométrées avec pause automatique et suivi de tes sessions de travail.",
    icon: 'timer',
    tint: 'rgba(251, 146, 60, 0.16)',
    accent: '#fb923c',
    status: 'bientôt',
  },
  {
    slug: 'revision',
    name: 'Révision',
    desc: "Fiches de révision espacées et quiz actifs, calibrés sur les principes de la répétition espacée et du test actif.",
    icon: 'brain',
    tint: 'rgba(52, 211, 153, 0.15)',
    accent: '#34d399',
    status: 'bientôt',
  },
];
