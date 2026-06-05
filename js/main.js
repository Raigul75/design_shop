/* ============================================================
   MAIN JS — Shared across all pages
   ============================================================ */

// ── Theme Toggle ──────────────────────────────────────
const html = document.documentElement;
const themeToggle = document.getElementById('themeToggle');
const savedTheme = localStorage.getItem('dp-theme') || 'light';
html.setAttribute('data-theme', savedTheme);
if (themeToggle) {
  themeToggle.textContent = savedTheme === 'dark' ? '☀️' : '🌙';
  themeToggle.addEventListener('click', () => {
    const current = html.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('dp-theme', next);
    themeToggle.textContent = next === 'dark' ? '☀️' : '🌙';
  });
}

// ── Navbar Scroll ─────────────────────────────────────
const navbar = document.getElementById('navbar');
let lastScrollY = 0;
window.addEventListener('scroll', () => {
  const y = window.scrollY;
  if (navbar) {
    if (y > 60) navbar.classList.add('scrolled');
    else navbar.classList.remove('scrolled');
  }
  // Scroll top button
  const btn = document.getElementById('scrollTopBtn');
  if (btn) {
    if (y > 600) btn.classList.add('visible');
    else btn.classList.remove('visible');
  }
  lastScrollY = y;
}, { passive: true });

// ── Mobile Menu ───────────────────────────────────────
const burger = document.getElementById('burger');
const mobileMenu = document.getElementById('mobileMenu');
if (burger && mobileMenu) {
  burger.addEventListener('click', () => {
    burger.classList.toggle('active');
    mobileMenu.classList.toggle('open');
  });
  // Close on link click
  mobileMenu.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      burger.classList.remove('active');
      mobileMenu.classList.remove('open');
    });
  });
}

// ── Scroll Reveal ─────────────────────────────────────
function initReveal() {
  const els = document.querySelectorAll('.reveal, .reveal-left, .reveal-right');
  if (!els.length) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.12 });
  els.forEach(el => io.observe(el));
}
document.addEventListener('DOMContentLoaded', initReveal);

// ── Hero BG Ken Burns ─────────────────────────────────
window.addEventListener('load', () => {
  const bg = document.getElementById('heroBg');
  if (bg) setTimeout(() => bg.classList.add('loaded'), 100);
});

// ── Lightbox ──────────────────────────────────────────
function openLightbox(src) {
  const lb = document.getElementById('lightbox');
  const img = document.getElementById('lightboxImg');
  if (!lb || !img) return;
  img.src = src;
  lb.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeLightbox() {
  const lb = document.getElementById('lightbox');
  if (lb) lb.classList.remove('open');
  document.body.style.overflow = '';
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeLightbox();
});

// ── Contact Form ──────────────────────────────────────
const contactForm = document.getElementById('contactForm');
if (contactForm) {
  contactForm.addEventListener('submit', e => {
    e.preventDefault();
    const name = document.getElementById('nameInput').value.trim();
    const phone = document.getElementById('phoneInput').value.trim();
    if (!name || !phone) {
      alert('Пожалуйста, заполните имя и телефон.');
      return;
    }
    const btn = document.getElementById('formSubmitBtn');
    btn.disabled = true;
    btn.textContent = 'Отправка...';
    setTimeout(() => {
      contactForm.style.display = 'none';
      document.getElementById('formSuccess').classList.add('show');
    }, 1200);
  });
}

// ── Callback Form ─────────────────────────────────────
const callbackForm = document.getElementById('callbackForm');
if (callbackForm) {
  callbackForm.addEventListener('submit', e => {
    e.preventDefault();
    const phone = document.getElementById('cbPhone').value.trim();
    if (!phone) { alert('Укажите телефон.'); return; }
    setTimeout(() => {
      callbackForm.querySelectorAll('.form-group, button[type=submit]').forEach(el => el.style.display = 'none');
      document.getElementById('cbSuccess').classList.add('show');
    }, 800);
  });
}

// ── Close modal on overlay click ──────────────────────
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
});

// ── Phone mask ────────────────────────────────────────
function applyPhoneMask(input) {
  if (!input) return;
  input.addEventListener('input', () => {
    let v = input.value.replace(/\D/g, '');
    if (v.startsWith('8')) v = '7' + v.slice(1);
    if (!v.startsWith('7') && v.length > 0) v = '7' + v;
    let result = '+7';
    if (v.length > 1) result += ' (' + v.slice(1, 4);
    if (v.length >= 4) result += ') ' + v.slice(4, 7);
    if (v.length >= 7) result += '-' + v.slice(7, 9);
    if (v.length >= 9) result += '-' + v.slice(9, 11);
    input.value = result;
  });
}
['phoneInput','cbPhone','dfPhone'].forEach(id => applyPhoneMask(document.getElementById(id)));
