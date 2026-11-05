/* Page d'accueil : rend la grille d'apps depuis le registre. */
(function () {
  'use strict';

  document.getElementById('brand-logo').innerHTML = window.iconSvg('grid');

  /* Bandeau défilant : liste des apps, répétée pour la boucle */
  const track = document.getElementById('marquee-track');
  const names = (window.LENANCKER_APPS || []).map((a) => a.name);
  const chunk = names.map((n) => `${n}<b>*</b>`).join('');
  track.innerHTML = `<span>${chunk}</span><span>${chunk}</span>`;

  const grid = document.getElementById('apps-grid');
  const apps = window.LENANCKER_APPS || [];

  apps.forEach((app, i) => {
    const isSoon = app.status !== 'disponible';
    const featured = i === 0 && !isSoon;
    const card = document.createElement(isSoon ? 'div' : 'a');
    if (!isSoon) {
      card.href = app.href;
      card.setAttribute('aria-label', `Ouvrir ${app.name}`);
    }
    card.className = `app-card reveal${isSoon ? ' soon' : ''}${featured ? ' featured' : ''}`;
    card.style.setProperty('--d', `${0.34 + i * 0.09}s`);
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
