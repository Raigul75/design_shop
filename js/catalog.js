/* ============================================================
   CATALOG JS — Filter, Search, Render
   ============================================================ */

// Style labels
const STYLE_LABELS = {
  minimalism:   'Минимализм',
  scandinavian: 'Скандинавский',
  modern:       'Современный',
  loft:         'Лофт',
  neoclassic:   'Неоклассика'
};
const ROOMS_LABELS = { 1:'1 комната', 2:'2 комнаты', 3:'3 комнаты', 4:'4 комнаты' };

function renderCards(data) {
  const container = document.getElementById('catalogResults');
  if (!container) return;
  container.innerHTML = '';
  if (!data.length) {
    container.innerHTML = `
      <div class="no-results">
        <div class="no-results-icon">🔍</div>
        <h3>Ничего не найдено</h3>
        <p>Попробуйте изменить параметры поиска или сбросить фильтры.</p>
      </div>`;
    return;
  }
  data.forEach((s, i) => {
    const card = document.createElement('div');
    card.className = 'service-card reveal';
    card.style.transitionDelay = `${(i % 4) * 0.07}s`;
    card.innerHTML = `
      <div class="service-card-img-wrap">
        <img src="${s.image}" alt="${s.title}" class="service-card-img" loading="lazy">
        <div class="service-card-style-badge">${STYLE_LABELS[s.style] || s.style}</div>
      </div>
      <div class="service-card-body">
        <div class="service-card-rooms">🏠 ${ROOMS_LABELS[s.rooms] || s.rooms + ' к.'}</div>
        <div class="service-card-title">${s.title}</div>
        <div class="service-card-desc">${s.shortDesc}</div>
        <div class="service-card-footer">
          <span class="service-card-price">${s.price}</span>
          <a href="service.html?id=${s.id}" class="btn btn-primary btn-sm">Подробнее →</a>
        </div>
      </div>`;
    container.appendChild(card);
  });
  // Re-init reveal for newly rendered cards
  setTimeout(() => {
    const els = container.querySelectorAll('.reveal');
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); }
      });
    }, { threshold: 0.08 });
    els.forEach(el => io.observe(el));
  }, 50);
}

function filterAndRender() {
  const rooms    = document.getElementById('filterRooms').value;
  const style    = document.getElementById('filterStyle').value;
  const price    = document.getElementById('filterPrice').value;
  const query    = document.getElementById('searchInput').value.toLowerCase().trim();

  let filtered = SERVICES_DATA.filter(s => {
    if (rooms && s.rooms !== parseInt(rooms)) return false;
    if (style && s.style !== style) return false;
    if (price) {
      if (price === 'low'  && s.priceVal >= 500000)  return false;
      if (price === 'mid'  && (s.priceVal < 500000 || s.priceVal > 1000000)) return false;
      if (price === 'high' && s.priceVal <= 1000000) return false;
    }
    if (query && !s.title.toLowerCase().includes(query) && !s.shortDesc.toLowerCase().includes(query)) return false;
    return true;
  });
  renderCards(filtered);
}

function resetFilters() {
  document.getElementById('filterRooms').value = '';
  document.getElementById('filterStyle').value = '';
  document.getElementById('filterPrice').value = '';
  document.getElementById('searchInput').value = '';
  renderCards(SERVICES_DATA);
}

// Init
document.addEventListener('DOMContentLoaded', () => {
  if (!document.getElementById('catalogResults')) return;
  renderCards(SERVICES_DATA);
  ['filterRooms','filterStyle','filterPrice'].forEach(id => {
    document.getElementById(id).addEventListener('change', filterAndRender);
  });
  let searchTimeout;
  document.getElementById('searchInput').addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(filterAndRender, 250);
  });
});
