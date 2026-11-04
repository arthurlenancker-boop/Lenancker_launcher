/* Page d'accueil : rend la grille d'apps depuis le registre. */
(function () {
  'use strict';

  document.getElementById('brand-logo').innerHTML = window.iconSvg('grid');

  const grid = document.getElementById('apps-grid');
  const apps = window.LENANCKER_APPS || [];

  apps.forEach((app, i) => {
    const isSoon = app.status !== 'disponible';
    const card = document.createElement(isSoon ? 'div' : 'a');
    if (!isSoon) {
      card.href = app.href;
      card.setAttribute('aria-label', `Ouvrir ${app.name}`);
    }
    card.className = `app-card reveal${isSoon ? ' soon' : ''}`;
    card.style.setProperty('--d', `${0.22 + i * 0.09}s`);
    card.innerHTML = `
      <span class="app-icon" style="--app-tint:${app.tint}; color:${app.accent}">${window.iconSvg(app.icon)}</span>
      <h2>${app.name}</h2>
      <p>${app.desc}</p>
      <span class="app-meta">
        <span class="badge${isSoon ? ' soon-badge' : ''}">${isSoon ? 'Bientôt' : 'Disponible'}</span>
        ${isSoon ? '' : '<span class="app-arrow" aria-hidden="true">→</span>'}
      </span>`;
    grid.appendChild(card);
  });
})();
