/* Page d'accueil : rend la grille d'apps depuis le registre. */
(function () {
  'use strict';

  document.getElementById('brand-logo').innerHTML = window.iconSvg('grid');

  /* Bandeau défilant : on répète le contenu jusqu'à couvrir la largeur
     du conteneur, puis on duplique en deux moitiés identiques pour que
     la boucle translateX(-50%) soit parfaitement continue. */
  const marquee = document.querySelector('.marquee');
  const track = document.getElementById('marquee-track');
  function buildMarquee() {
    if (!marquee || !track) return;
    const names = (window.LENANCKER_APPS || []).map((a) => a.name);
    const unit = names.map((n) => `${n}<b>*</b>`).join('') || 'Lenancker Launcher<b>*</b>';
    let half = '';
    for (let i = 0; i < 6; i++) half += `<span>${unit}</span>`;
    track.innerHTML = half;
    let guard = 0;
    while (track.scrollWidth > 0 && track.scrollWidth < marquee.clientWidth && guard < 20) {
      half += `<span>${unit}</span>`;
      track.innerHTML = half;
      guard++;
    }
    track.innerHTML = half + half;
  }
  buildMarquee();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(buildMarquee);

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
