/* ============================================================
   SERVICE DETAIL JS — Dynamic page population
   ============================================================ */

const ROOMS_LABELS = { 1:'1 комната', 2:'2 комнаты', 3:'3 комнаты', 4:'4 комнаты' };
const STYLE_LABELS = {
  minimalism:'Минимализм', scandinavian:'Скандинавский',
  modern:'Современный', loft:'Лофт', neoclassic:'Неоклассика'
};

document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  if (!id || !window.SERVICES_DATA) { notFound(); return; }

  const service = SERVICES_DATA.find(s => s.id === id);
  if (!service) { notFound(); return; }

  // ── Meta ──────────────────────────────────────────
  document.title = `${service.title} — DesignPro`;
  document.getElementById('pageDesc').content = service.desc.slice(0, 160);
  document.getElementById('breadcrumbCurrent').textContent = service.title;

  // ── Rooms badge ───────────────────────────────────
  document.getElementById('serviceRoomsBadge').innerHTML =
    `🏠 ${ROOMS_LABELS[service.rooms] || service.rooms + ' к.'}`;

  // ── Title & Price ─────────────────────────────────
  document.getElementById('serviceTitle').textContent = service.title;
  document.getElementById('servicePrice').textContent = service.price;

  // ── Meta items ────────────────────────────────────
  document.getElementById('metaStyle').textContent = STYLE_LABELS[service.style] || service.style;
  document.getElementById('metaTerm').textContent  = service.term;
  document.getElementById('metaArea').textContent  = service.area;

  // ── Description ───────────────────────────────────
  document.getElementById('serviceDesc').textContent = service.desc;

  // ── Features ─────────────────────────────────────
  const featuresEl = document.getElementById('serviceFeatures');
  featuresEl.innerHTML = service.features.map(f =>
    `<div class="service-feature">${f}</div>`
  ).join('');

  // ── Gallery ───────────────────────────────────────
  const mainImg = document.getElementById('galleryMain');
  mainImg.src = service.images[0];
  mainImg.alt = service.title;

  const thumbsEl = document.getElementById('galleryThumbs');
  service.images.forEach((src, idx) => {
    const img = document.createElement('img');
    img.src = src;
    img.alt = service.title + ' ' + (idx + 1);
    img.className = 'gallery-thumb' + (idx === 0 ? ' active' : '');
    img.loading = 'lazy';
    img.addEventListener('click', () => {
      mainImg.src = src;
      thumbsEl.querySelectorAll('.gallery-thumb').forEach(t => t.classList.remove('active'));
      img.classList.add('active');
    });
    thumbsEl.appendChild(img);
  });

  // Lightbox from main image click
  window.openDetailLightbox = () => openLightbox(mainImg.src);

  // ── Materials ─────────────────────────────────────
  const matList = document.getElementById('materialsList');
  if (matList && service.materials) {
    matList.innerHTML = service.materials.map(m => `
      <div class="about-feat" style="background:var(--white)">
        <div class="about-feat-icon" style="font-size:1.5rem;width:52px;height:52px">${m.icon}</div>
        <div>
          <div class="about-feat-title">${m.name}</div>
          <div class="about-feat-desc">${m.desc}</div>
        </div>
      </div>`).join('');
  }

  // ── Reviews ───────────────────────────────────────
  const reviewsEl = document.getElementById('detailReviews');
  if (reviewsEl && service.reviews) {
    reviewsEl.innerHTML = service.reviews.map(r => `
      <div class="review-card reveal">
        <div class="review-quote">"</div>
        <p class="review-text">${r.text}</p>
        <div class="review-stars"><span>★</span><span>★</span><span>★</span><span>★</span><span>★</span></div>
        <div class="review-author">
          <img src="${r.img}" alt="${r.name}" class="review-avatar">
          <div>
            <div class="review-name">${r.name}</div>
            <div class="review-role">${r.role}</div>
          </div>
        </div>
      </div>`).join('');
    // init reveal for new cards
    setTimeout(() => {
      reviewsEl.querySelectorAll('.reveal').forEach(el => {
        const io = new IntersectionObserver(entries => {
          entries.forEach(e => { if(e.isIntersecting){ e.target.classList.add('visible'); io.unobserve(e.target); }});
        }, {threshold:0.1});
        io.observe(el);
      });
    }, 100);
  }

  // ── Detail form ───────────────────────────────────
  const detailForm = document.getElementById('detailForm');
  if (detailForm) {
    detailForm.addEventListener('submit', e => {
      e.preventDefault();
      const phone = document.getElementById('dfPhone').value.trim();
      if (!phone) { alert('Укажите телефон.'); return; }
      setTimeout(() => {
        detailForm.querySelectorAll('.form-group, button[type=submit]').forEach(el => el.style.display = 'none');
        document.getElementById('dfSuccess').classList.add('show');
      }, 800);
    });
  }
});

function notFound() {
  document.querySelector('.service-detail').innerHTML = `
    <div class="container" style="text-align:center;padding:80px 0">
      <div style="font-size:4rem;margin-bottom:24px">🏠</div>
      <h1 class="section-title">Услуга не найдена</h1>
      <p style="color:var(--gray-500);margin:16px 0 32px">Возможно, вы перешли по устаревшей ссылке.</p>
      <a href="catalog.html" class="btn btn-primary">Перейти в каталог</a>
    </div>`;
}
