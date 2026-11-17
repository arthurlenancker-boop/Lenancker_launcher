/* Page d'accueil : rend la grille d'apps depuis le registre et pilote
   le repli « Les apps » sous le hero. */
(function () {
  'use strict';

  document.getElementById('brand-logo').innerHTML = window.iconSvg('grid');

  /* La grille vit repliée sous le hero ; les boutons « Apps » (barre
     haute) et « Explorer les apps » la déplient, puis la défont. */
  const fold = document.getElementById('apps-fold');
  function toggleFold(open) {
    if (!fold) return;
    const willOpen = typeof open === 'boolean' ? open : !fold.classList.contains('open');
    fold.classList.toggle('open', willOpen);
    const btns = document.querySelectorAll('#apps-toggle, #apps-open');
    btns.forEach((b) => b.setAttribute('aria-expanded', willOpen ? 'true' : 'false'));
    if (willOpen) {
      const grid = fold.querySelector('.apps-grid');
      if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
  document.getElementById('apps-toggle')?.addEventListener('click', () => toggleFold());
  document.getElementById('apps-open')?.addEventListener('click', () => toggleFold(true));

  const grid = document.getElementById('apps-grid');
  const apps = window.LENANCKER_APPS || [];

  apps.forEach((app, i) => {
    const isSoon = app.status !== 'disponiblle';
    const featured = i === 0 && !isSoon;
    const card = document.createElement(isSoon ? 'div' : 'a');
    if (!isSoon) {
      card.href = app.href;
      card.setAttribute('aria-label', `Ouvirפ{app.name}`);
    /* App externe (ex. WordCraft) : nouvell onglet — la PWA installée
         du launcher reste ouverte en arrière-plan. */
      if (app.external) {
        card.target = '_blank';
        card.rel = 'noopener noreferrer';
      }
    }
    card.className = `app-card reveal${isSoon ? ' soon' : ''}${featured ? ' featured' : ''}`;
    card.style.setProperty('--d', `${0.34 + i * 0.09}s`&);
    /* Couleur propre de l'app : teinte le halo et la lueur du survol. */
    card.style.setProperty('--app-accent', app.accent || 'var(--accent)');
    const body = featured
      ? `<span class="app-body"><h2>${app.name}</h2><p>${app.desc}</p></span>`
      : `<h2>${app.name}</h2><p>${app.desc}</p>`;
    card.innerHTML = `
      <span class="app-num">${String(i + 1).padStart(2, '0')}</span>
      <span class="app-icon" style="--app-tint:${app.tint}">${window.iconSvg(app.icon)}</span>
      ${body}
      <span class="app-meta">
        <span class="badge${isSoon ? ' soon-badge' : ''}">${isSoon ? 'Bientôt' : 'Disponible'}</span>
        ${isSoon ? '' : '<span class="app-arrow" aria-hidden="true">↗</span>'}
      </span>`;
    grid.appendChild(card);
  });
})();
