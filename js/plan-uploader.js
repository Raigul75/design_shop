/* ============================================================
   PDF PLAN UPLOADER — v4  (3-step wizard)
   STEP 1: Upload PDF → show extracted plan + detected data
   STEP 2: User verifies / corrects floor plan elements
   STEP 3: Approve → show room-by-room style gallery (2 imgs/room)
   ============================================================ */

(function () {
  'use strict';

  /* ── State ──────────────────────────────────────────────── */
  let currentFile      = null;
  let currentRooms     = null;
  let extractedMetrics = null;
  let missingFields    = [];
  let currentPdfCanvas = null;
  let currentPdfPage   = null;   // PDF.js page object for PlanEditor overlay
  let approvedMetrics  = null;  // merged after step 2

  /* ── Room gallery: 2 images per room per style ────────────
     Keys: living, bedroom, kitchen, bathroom, hallway          */
  const ROOM_GALLERY = {
    minimalism: {
      living:   [
        { url: 'img/concept_minimalism_living.png',   label: 'Гостиная — вид 1' },
        { url: 'img/project_studio_1780498426237.png', label: 'Гостиная — вид 2' },
      ],
      bedroom:  [
        { url: 'img/concept_minimalism_bedroom.png',  label: 'Спальня — вид 1' },
        { url: 'img/project_studio_1780498426237.png', label: 'Спальня — вид 2' },
      ],
      kitchen:  [
        { url: 'img/concept_minimalism_kitchen.png',  label: 'Кухня — вид 1' },
        { url: 'img/ai_floorplan_1.png',              label: 'Кухня — планировка' },
      ],
      bathroom: [
        { url: 'img/concept_minimalism_bathroom.png', label: 'Ванная — вид 1' },
        { url: 'img/concept_minimalism_bathroom.png', label: 'Ванная — вид 2' },
      ],
      hallway: [
        { url: 'img/concept_hallway.png', label: 'Прихожая / Коридор' }
      ],
      loggia: [
        { url: 'img/concept_loggia.png', label: 'Лоджия / Балкон' }
      ]
    },
    scandinavian: {
      living:   [
        { url: 'img/concept_scandi_living.png',       label: 'Гостиная — вид 1' },
        { url: 'img/project_scandi_1780498481269.png', label: 'Гостиная — вид 2' },
      ],
      bedroom:  [
        { url: 'img/concept_scandi_bedroom.png',      label: 'Спальня — вид 1' },
        { url: 'img/project_scandi_1780498481269.png', label: 'Спальня — вид 2' },
      ],
      kitchen:  [
        { url: 'img/concept_scandi_kitchen.png',      label: 'Кухня — вид 1' },
        { url: 'img/concept_scandi_living.png',       label: 'Кухня-гостиная' },
      ],
      bathroom: [
        { url: 'img/concept_scandi_bathroom.png',     label: 'Ванная — вид 1' },
        { url: 'img/concept_scandi_bathroom.png',     label: 'Ванная — вид 2' },
      ],
      hallway: [
        { url: 'img/concept_hallway.png', label: 'Прихожая / Коридор' }
      ],
      loggia: [
        { url: 'img/concept_loggia.png', label: 'Лоджия / Балкон' }
      ]
    },
    modern: {
      living:   [
        { url: 'img/concept_modern_living.png',       label: 'Гостиная — вид 1' },
        { url: 'img/project_two_room_1780498439834.png', label: 'Гостиная — вид 2' },
      ],
      bedroom:  [
        { url: 'img/concept_modern_bedroom.png',      label: 'Спальня — вид 1' },
        { url: 'img/concept_modern_living.png',       label: 'Спальня — вид 2' },
      ],
      kitchen:  [
        { url: 'img/concept_modern_kitchen.png',      label: 'Кухня — вид 1' },
        { url: 'img/concept_modern_living.png',       label: 'Кухня — детали' },
      ],
      bathroom: [
        { url: 'img/concept_modern_bathroom.png',     label: 'Ванная — вид 1' },
        { url: 'img/concept_modern_bathroom.png',     label: 'Ванная — вид 2' },
      ],
      hallway: [
        { url: 'img/concept_hallway.png', label: 'Прихожая / Коридор' }
      ],
      loggia: [
        { url: 'img/concept_loggia.png', label: 'Лоджия / Балкон' }
      ]
    },
    loft: {
      living:   [
        { url: 'img/concept_loft_2.png',              label: 'Гостиная — вид 1' },
        { url: 'img/project_loft_1780498458087.png',  label: 'Гостиная — вид 2' },
      ],
      bedroom:  [
        { url: 'img/concept_loft_bedroom.png',        label: 'Спальня — вид 1' },
        { url: 'img/concept_loft_2.png',              label: 'Спальня — вид 2' },
      ],
      kitchen:  [
        { url: 'img/concept_loft_3.png',              label: 'Кухня — вид 1' },
        { url: 'img/concept_loft_2.png',              label: 'Кухня — детали' },
      ],
      bathroom: [
        { url: 'img/concept_loft_bathroom.png',       label: 'Ванная — вид 1' },
        { url: 'img/concept_loft_bathroom.png',       label: 'Ванная — вид 2' },
      ],
      hallway: [
        { url: 'img/concept_hallway.png', label: 'Прихожая / Коридор' }
      ],
      loggia: [
        { url: 'img/concept_loggia.png', label: 'Лоджия / Балкон' }
      ]
    },
    neoclassic: {
      living:   [
        { url: 'img/concept_neoclassic_living.png',   label: 'Гостиная — вид 1' },
        { url: 'img/project_neoclassic_1780498469567.png', label: 'Гостиная — вид 2' },
      ],
      bedroom:  [
        { url: 'img/concept_neoclassic_bedroom.png',  label: 'Спальня — вид 1' },
        { url: 'img/concept_neoclassic_living.png',   label: 'Спальня — вид 2' },
      ],
      kitchen:  [
        { url: 'img/concept_neoclassic_kitchen.png',  label: 'Кухня — вид 1' },
        { url: 'img/concept_neoclassic_living.png',   label: 'Кухня — детали' },
      ],
      bathroom: [
        { url: 'img/concept_neoclassic_bathroom.png', label: 'Ванная — вид 1' },
        { url: 'img/concept_neoclassic_bathroom.png', label: 'Ванная — вид 2' },
      ],
      hallway: [
        { url: 'img/concept_hallway.png', label: 'Прихожая / Коридор' }
      ],
      loggia: [
        { url: 'img/concept_loggia.png', label: 'Лоджия / Балкон' }
      ]
    },
  };

  /* ── Room list depending on apartment type & real roomDetails ── */
  function getRoomsForApartment(rooms, roomDetails) {
    // If we have real parsed room details — build from them
    if (roomDetails && roomDetails.length > 0) {
      return buildRoomListFromDetails(roomDetails);
    }
    // Fallback: generic list
    const list = [];
    list.push({ key: 'living',    icon: '🛋️', label: 'Гостиная' });
    if (rooms >= 2) list.push({ key: 'bedroom', icon: '🛏️', label: 'Спальня' });
    if (rooms >= 3) list.push({ key: 'bedroom', icon: '🛏️', label: 'Спальня 2' });
    if (rooms >= 4) list.push({ key: 'bedroom', icon: '🛏️', label: 'Спальня 3' });
    list.push({ key: 'kitchen',   icon: '🍳', label: 'Кухня' });
    list.push({ key: 'bathroom',  icon: '🚿', label: 'Ванная' });
    return list;
  }

  /* ── Convert roomDetails to render room list ─────────────── */
  function buildRoomListFromDetails(roomDetails) {
    const list = [];
    const typeIconMap = {
      hallway:  { icon: '🚪', key: 'hallway'  },
      wardrobe: { icon: '👔', key: 'hallway'  },
      living:   { icon: '🛏️', key: 'bedroom'  },
      kitchen:  { icon: '🍳', key: 'kitchen'  },
      bathroom: { icon: '🚿', key: 'bathroom' },
      loggia:   { icon: '🌿', key: 'loggia'   },
      balcony:  { icon: '🌿', key: 'loggia'   },
      other:    { icon: '📐', key: 'living'   },
    };
    const livingCount  = { count: 0 };
    const bathCount    = { count: 0 };
    const kitchenCount = { count: 0 };

    // Sort by id
    const sorted = [...roomDetails].sort((a, b) => a.id - b.id);

    sorted.forEach(r => {
      const tmap  = typeIconMap[r.type] || { icon: '📐', key: 'living' };
      let label   = r.nameRu || r.name || r.type;
      let key     = tmap.key;
      const icon  = tmap.icon;

      if (r.type === 'living') {
        livingCount.count++;
        label = livingCount.count === 1 ? 'Спальня' : `Спальня ${livingCount.count}`;
        key   = 'bedroom';
      } else if (r.type === 'kitchen') {
        kitchenCount.count++;
        label = kitchenCount.count === 1 ? 'Кухня' : `Зона кухни ${kitchenCount.count}`;
        key   = 'kitchen';
      } else if (r.type === 'bathroom') {
        bathCount.count++;
        label = bathCount.count === 1 ? 'Санузел' : `Санузел ${bathCount.count}`;
        key   = 'bathroom';
      } else if (r.type === 'loggia') {
        key   = 'bathroom';  // reuse bathroom gallery for loggia
        label = 'Лоджия';
      } else if (r.type === 'balcony') {
        key   = 'bathroom';
        label = 'Балкон';
      } else if (r.type === 'hallway') {
        label = 'Прихожая/коридор';
        key   = 'hallway';
      } else if (r.type === 'wardrobe') {
        label = 'Гардеробная';
        key   = 'hallway';
      }

      // Only include rooms that have a gallery (living, bedroom, kitchen, bathroom)
      // Skip hallway/wardrobe from the render list (too small, no gallery)
      if (['living', 'bedroom', 'kitchen', 'bathroom', 'loggia', 'balcony'].includes(r.type)) {
        list.push({ key, icon, label, area: r.area, id: r.id });
      }
    });

    // Fallback: if no rooms found, add generic living
    if (list.length === 0) {
      list.push({ key: 'living', icon: '🛋️', label: 'Гостиная' });
    }

    return list;
  }

  /* ── DOM refs ───────────────────────────────────────────── */
  let uploaderSection;
  let dropZone, fileInput, fileNameEl, fileRemoveBtn;
  let analysisProgress, analysisResults;
  let manualToggleBtn, manualForm;
  let pdfPreviewWrap, pdfCanvas;
  let missingFieldsSection;

  /* ── Progress steps ─────────────────────────────────────── */
  const STEPS = [
    { id: 'ps-load',   icon: '📂', text: 'Загрузка PDF-файла' },
    { id: 'ps-render', icon: '🖼️', text: 'Рендеринг плана квартиры' },
    { id: 'ps-text',   icon: '🔍', text: 'Извлечение текста и обмеров' },
    { id: 'ps-parse',  icon: '📐', text: 'Анализ геометрии и помещений' },
    { id: 'ps-score',  icon: '🧠', text: 'Подбор стилей интерьера' },
  ];

  /* ── Missing field defs ─────────────────────────────────── */
  const FIELD_DEFS = {
    ceiling: {
      label: 'Высота потолков', icon: '⬆️',
      hint: 'Указана в договоре или паспорте объекта',
      type: 'number', min: 2.2, max: 5, step: 0.05, placeholder: 'напр. 2.70', unit: 'м'
    },
    orientation: {
      label: 'Ориентация окон', icon: '🧭',
      hint: 'Куда выходят основные окна гостиной/спальни',
      type: 'select',
      options: [
        { value: '',   label: 'Не знаю' },
        { value: 'S',  label: '☀️ Юг' }, { value: 'SE', label: '🌤️ Юго-восток' },
        { value: 'SW', label: '🌤️ Юго-запад' }, { value: 'E', label: '🌅 Восток' },
        { value: 'W',  label: '🌆 Запад' }, { value: 'N', label: '🌥️ Север' },
        { value: 'NE', label: '🌥️ Северо-восток' }, { value: 'NW', label: '🌥️ Северо-запад' },
      ]
    },
    wallMaterial: {
      label: 'Тип дома', icon: '🏗️',
      hint: 'Из проектной декларации застройщика',
      type: 'select',
      options: [
        { value: '',           label: 'Не знаю' },
        { value: 'monolithic', label: '🏗️ Монолит' },
        { value: 'brick',      label: '🧱 Кирпич' },
        { value: 'panel',      label: '📦 Панельный' },
        { value: 'block',      label: '🪨 Блочный' },
        { value: 'mixed',      label: '🔀 Монолит+кирпич' },
      ]
    },
    electric: {
      label: 'Электрических точек', icon: '⚡',
      hint: 'Розетки + выключатели + освещение',
      type: 'select',
      options: [
        { value: '0',  label: 'Нет данных' }, { value: '6', label: 'До 10 (мин.)' },
        { value: '12', label: '10–20 (стандарт)' }, { value: '20', label: '20–30 (расш.)' },
        { value: '35', label: 'Более 30 (умный дом)' },
      ]
    },
    plumbing: {
      label: 'Точек ВК (вода/канализация)', icon: '🚿',
      hint: 'Входы воды + выпуски канализации',
      type: 'select',
      options: [
        { value: '0', label: 'Нет данных' }, { value: '2', label: '2–3 (1 санузел)' },
        { value: '5', label: '4–6 (санузел + кухня)' }, { value: '8', label: '7–10 (2 санузла)' },
        { value: '12', label: 'Более 10' },
      ]
    },
    comms: {
      label: 'Точек СС (интернет, ТВ)', icon: '📡',
      hint: 'Слаботочные системы',
      type: 'select',
      options: [
        { value: '0', label: 'Нет данных' }, { value: '2', label: '1–3 (минимум)' },
        { value: '5', label: '4–6 (стандарт)' }, { value: '10', label: '7+ (полное)' },
      ]
    },
    warmFloors: {
      label: 'Тёплые полы', icon: '🌡️',
      hint: 'Предусмотрены застройщиком',
      type: 'select',
      options: [
        { value: '',      label: 'Не знаю' },
        { value: 'true',  label: '✅ Да' },
        { value: 'false', label: '❌ Нет' },
      ]
    },
  };

  /* ════════════════════════════════════════════════════════
     INIT
  ════════════════════════════════════════════════════════ */
  document.addEventListener('DOMContentLoaded', () => {
    uploaderSection      = document.getElementById('planUploaderSection');
    if (!uploaderSection) return;

    dropZone             = document.getElementById('dropZone');
    fileInput            = document.getElementById('pdfFileInput');
    fileNameEl           = document.getElementById('dropZoneFileName');
    fileRemoveBtn        = document.getElementById('dropZoneRemove');
    analysisProgress     = document.getElementById('analysisProgress');
    analysisResults      = document.getElementById('analysisResults');
    manualToggleBtn      = document.getElementById('manualToggleBtn');
    manualForm           = document.getElementById('manualInputForm');
    pdfPreviewWrap       = document.getElementById('pdfPreviewWrap');
    pdfCanvas            = document.getElementById('pdfPreviewCanvas');
    missingFieldsSection = document.getElementById('missingFieldsSection');

    buildProgressSteps();
    setupDropZone();

    if (manualToggleBtn) {
      manualToggleBtn.addEventListener('click', () => {
        const open = manualForm.classList.toggle('open');
        manualToggleBtn.textContent = open ? '✕ Свернуть форму' : '✏️ Заполнить параметры вручную';
        if (open) fadeOut(dropZone); else fadeIn(dropZone);
        const mr = document.getElementById('manualRooms');
        if (mr && currentRooms) mr.value = currentRooms;
      });
    }

    const manualBtn = document.getElementById('manualAnalyzeBtn');
    if (manualBtn) manualBtn.addEventListener('click', runManualAnalysis);
  });

  /* ── Drop Zone ──────────────────────────────────────────── */
  function setupDropZone() {
    if (!dropZone) return;
    dropZone.addEventListener('click', e => { if (!fileRemoveBtn?.contains(e.target)) fileInput.click(); });
    fileInput.addEventListener('change', () => { if (fileInput.files[0]) handleFile(fileInput.files[0]); });
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', e => {
      e.preventDefault(); dropZone.classList.remove('dragover');
      if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });
    if (fileRemoveBtn) fileRemoveBtn.addEventListener('click', e => { e.stopPropagation(); clearFile(); });
  }

  function handleFile(file) {
    if (file.name.split('.').pop().toLowerCase() !== 'pdf') {
      showToast('⚠️ Загрузите файл в формате PDF'); return;
    }
    if (file.size > 50 * 1024 * 1024) {
      showToast('⚠️ Файл слишком большой (max 50 МБ)'); return;
    }
    currentFile = file;
    dropZone.classList.add('has-file');
    fileNameEl.innerHTML = `📄 <strong>${file.name}</strong> <span style="color:rgba(255,255,255,0.4)">${formatSize(file.size)}</span>`;
    fileNameEl.classList.add('show');
    if (manualForm?.classList.contains('open')) {
      manualForm.classList.remove('open'); fadeIn(dropZone);
      if (manualToggleBtn) manualToggleBtn.textContent = '✏️ Заполнить параметры вручную';
    }
    runPDFAnalysis();
  }

  function clearFile() {
    currentFile = null;
    dropZone.classList.remove('has-file');
    fileNameEl.classList.remove('show');
    fileInput.value = '';
    if (pdfPreviewWrap) pdfPreviewWrap.style.display = 'none';
    currentPdfCanvas = null;
  }

  /* ── Progress Steps ─────────────────────────────────────── */
  function buildProgressSteps() {
    const el = document.getElementById('analysisSteps');
    if (!el) return;
    el.innerHTML = STEPS.map(s => `
      <div class="analysis-step" id="${s.id}">
        <div class="analysis-step-icon">${s.icon}</div>
        <div class="analysis-step-text">${s.text}</div>
        <div class="analysis-step-status">—</div>
      </div>`).join('');
  }

  function setStep(id, state, detail = '') {
    const el = document.getElementById(id); if (!el) return;
    el.classList.remove('active','done','error'); el.classList.add(state);
    const st = el.querySelector('.analysis-step-status');
    if (state === 'active') st.innerHTML = '<span class="spinner"></span>';
    if (state === 'done')   st.textContent = detail || '✓';
    if (state === 'error')  st.textContent = '✗';
  }
  function resetAllSteps() {
    STEPS.forEach(s => {
      const el = document.getElementById(s.id); if (!el) return;
      el.classList.remove('active','done','error');
      el.querySelector('.analysis-step-status').textContent = '—';
    });
  }
  const delay = ms => new Promise(r => setTimeout(r, ms));

  /* ════════════════════════════════════════════════════════
     STEP 1 — PDF ANALYSIS
  ════════════════════════════════════════════════════════ */
  async function runPDFAnalysis() {
    if (!currentFile) return;
    analysisProgress.classList.add('show');
    analysisResults.classList.remove('show');
    if (missingFieldsSection) missingFieldsSection.style.display = 'none';
    scrollToUploader(); resetAllSteps();

    try {
      setStep('ps-load', 'active'); await delay(300); setStep('ps-load', 'done');

      setStep('ps-render', 'active');
      const result = await PDFAnalyzer.analyzePDF(currentFile, currentRooms);
      currentPdfCanvas = result.canvas;
      currentPdfPage   = result.planPage;   // save for PlanEditor
      await delay(200);

      if (pdfPreviewWrap && pdfCanvas && result.canvas) {
        const ctx = pdfCanvas.getContext('2d');
        pdfCanvas.width = result.canvas.width; pdfCanvas.height = result.canvas.height;
        ctx.drawImage(result.canvas, 0, 0);
        pdfPreviewWrap.style.display = 'block';
        const pl = document.getElementById('pdfPageCount');
        if (pl) pl.textContent = `${result.pageCount} стр.`;
      }
      setStep('ps-render', 'done');

      setStep('ps-text', 'active'); await delay(400);
      const { metrics } = result;
      const found = [];
      if (metrics.totalArea)     found.push(`${metrics.totalArea.toFixed(0)} м²`);
      if (metrics.ceilingHeight) found.push(`потолки ${metrics.ceilingHeight.toFixed(1)} м`);
      if (metrics.rooms)         found.push(`${metrics.rooms} комн.`);
      setStep('ps-text', 'done', found.length ? `✓ ${found.join(', ')}` : '✓');

      setStep('ps-parse', 'active'); await delay(500);
      extractedMetrics = metrics;
      missingFields    = result.missing;
      setStep('ps-parse', 'done');

      setStep('ps-score', 'active'); await delay(400);

      // → Go to STEP 2: Verification panel
      setStep('ps-score', 'done');
      await delay(300);
      showVerificationPanel(metrics, missingFields);

    } catch (err) {
      console.error('[PDF Analyzer]', err);
      STEPS.forEach(s => setStep(s.id, 'error'));
      showToast('❌ Не удалось прочитать PDF. Убедитесь, что файл содержит текст.');
    }
  }

  /* ════════════════════════════════════════════════════════
     STEP 2 — VERIFICATION PANEL
     Shows: extracted plan + detected data + correction form
  ════════════════════════════════════════════════════════ */
  function showVerificationPanel(metrics, missing) {
    if (!missingFieldsSection) return;

    // Convert PDF canvas to dataURL for display
    let planImgHtml = '';
    if (currentPdfCanvas) {
      try {
        const dataUrl = currentPdfCanvas.toDataURL('image/png');
        planImgHtml = `
          <div class="verify-plan-preview">
            <div class="verify-plan-preview-label">
              <span>📐 Считанный план вашей квартиры</span>
              <span class="verify-plan-badge">Страниц PDF: ${currentPdfCanvas._pageCount || '?'}</span>
            </div>
            <div class="verify-plan-canvas-wrap">
              <img src="${dataUrl}" alt="Ваш план квартиры" class="verify-plan-img">
              <div class="verify-plan-overlay-text">Ваш план успешно считан</div>
            </div>
          </div>`;
      } catch(e) {}
    }

    // Detected elements pills
    const detectedHtml = buildDetectedElementsHtml(metrics);

    // Build the missing/correction fields
    const correctionFields = buildCorrectionFields(metrics, missing);

    missingFieldsSection.innerHTML = `
      <div class="verify-panel">

        <!-- Header -->
        <div class="verify-header">
          <div class="verify-header-icon">✅</div>
          <div>
            <div class="verify-header-title">Шаг 2 из 3 — Уточнение планировки</div>
            <p class="verify-header-sub">
              Система считала вашу планировку. Уточните недостающие размеры на интерактивном плане ниже —
              это позволит точно подобрать стиль и сформировать рендеры.
            </p>
          </div>
        </div>

        <!-- PlanEditor -->
        <div id="planEditorSlot"></div>
      </div>`;

    missingFieldsSection.style.display = 'block';
    missingFieldsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // ── Initialize PlanEditor in the plan preview area ────────
    if (typeof PlanEditor !== 'undefined') {
      const editorSlot = document.getElementById('planEditorSlot');
      if (editorSlot) {
        PlanEditor.init({
          canvas:      currentPdfCanvas,
          pdfPage:     currentPdfPage,
          roomDetails: metrics.roomDetails,
          metrics:     metrics,
          container:   editorSlot,
          onConfirm:   (updatedMetrics) => {
            // Merge PlanEditor results into metrics, then proceed
            Object.assign(metrics, updatedMetrics);
            extractedMetrics = metrics;
            // Collect any remaining form fields and render
            collectVerificationAndRender();
          },
        });
      }
    }
  }

  /* ── Build detected elements summary ─────────────────────── */
  function buildDetectedElementsHtml(metrics) {
    const items = [];

    const addItem = (icon, label, value, found) => {
      items.push(`
        <div class="detected-item ${found ? 'found' : 'notfound'}">
          <span class="detected-icon">${found ? '✅' : '❓'}</span>
          <span class="detected-icon2">${icon}</span>
          <div class="detected-info">
            <span class="detected-label">${label}</span>
            <span class="detected-value">${value}</span>
          </div>
        </div>`);
    };

    addItem('📐', 'Общая площадь',
      metrics.totalArea ? `${metrics.totalArea.toFixed(1)} м²` : 'Не найдена',
      !!metrics.totalArea);
    addItem('🏠', 'Жилых комнат',
      metrics.rooms ? `${metrics.rooms} комн.` : 'Не определено',
      !!metrics.rooms);
    addItem('⬆️', 'Высота потолков',
      metrics.ceilingHeight ? `${metrics.ceilingHeight.toFixed(2)} м` : 'Не найдена',
      !!metrics.ceilingHeight);
    addItem('🏗️', 'Тип дома / материал стен',
      metrics.buildingType ? buildingLabel(metrics.buildingType) : 'Не определён',
      !!metrics.buildingType);
    addItem('🏢', 'Этаж',
      (metrics.floor && metrics.totalFloors) ? `${metrics.floor} из ${metrics.totalFloors}` : 'Не определён',
      !!(metrics.floor && metrics.totalFloors));
    addItem('🌿', 'Балкон / лоджия',
      (metrics.hasBalcony || metrics.hasLoggia)
        ? `Есть${metrics.loggiaArea ? ` (${metrics.loggiaArea} м²)` : ''}`
        : 'Не обнаружен',
      !!(metrics.hasBalcony || metrics.hasLoggia));
    addItem('🚿', 'Санузлы',
      metrics.hasTwoBathrooms ? '2 санузла' : '1 санузел',
      true);
    if (metrics.hasKitchenStudio) {
      addItem('🍳', 'Кухня-студия', 'Зонированная планировка', true);
    }
    if (metrics.usableArea) {
      addItem('📏', 'Полезная площадь', `${metrics.usableArea.toFixed(1)} м²`, true);
    }
    if (metrics.livingArea) {
      addItem('🛏️', 'Жилая площадь', `${metrics.livingArea.toFixed(1)} м²`, true);
    }
    if (metrics.buildYear) {
      addItem('📅', 'Год постройки', `${metrics.buildYear} г.`, true);
    }

    let html = `<div class="detected-grid">${items.join('')}</div>`;

    // Add room details table if we have them
    if (metrics.roomDetails && metrics.roomDetails.length > 0) {
      html += buildRoomDetailsTable(metrics.roomDetails);
    }

    return html;
  }

  /* ── Build room details table ─────────────────────────────── */
  function buildRoomDetailsTable(roomDetails) {
    const typeIconMap = {
      hallway:  '🚪', wardrobe: '👔', living: '🛏️',
      kitchen:  '🍳', bathroom: '🚿', loggia: '🌿',
      balcony:  '🌿', other: '📐',
    };
    const sorted = [...roomDetails].sort((a, b) => a.id - b.id);
    const rows = sorted.map(r => {
      const icon = typeIconMap[r.type] || '📐';
      const name = r.nameRu || r.name || r.type;
      const area = r.area > 0 ? `${r.area.toFixed(1)} м²` : '—';
      return `<tr>
        <td style="color:rgba(255,255,255,0.5);text-align:center">${r.id}</td>
        <td>${icon} ${name}</td>
        <td style="text-align:right;color:var(--teal);font-weight:600">${area}</td>
      </tr>`;
    }).join('');

    return `
      <div style="margin-top:18px">
        <div class="verify-section-title" style="font-size:0.9rem;margin-bottom:10px">📋 Экспликация помещений:</div>
        <table style="width:100%;border-collapse:collapse;font-size:0.85rem">
          <thead>
            <tr style="color:rgba(255,255,255,0.4);font-size:0.78rem">
              <th style="padding:4px 8px;text-align:center;width:30px">№</th>
              <th style="padding:4px 8px;text-align:left">Наименование</th>
              <th style="padding:4px 8px;text-align:right">Площадь</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>`;
  }

  /* ── Build correction fields ─────────────────────────────── */
  function buildCorrectionFields(metrics, missing) {
    // Always show these key fields for verification
    const alwaysShow = ['ceiling', 'orientation', 'wallMaterial'];
    const toShow = [...new Set([...alwaysShow, ...missing])];

    return toShow.map(key => {
      const def = FIELD_DEFS[key]; if (!def) return '';
      let inputHtml = '';
      if (def.type === 'number') {
        const currentVal = key === 'ceiling' ? (metrics.ceilingHeight || '') : '';
        inputHtml = `<input type="number" id="vf_${key}" class="manual-form-control"
                      placeholder="${def.placeholder}" min="${def.min}" max="${def.max}"
                      step="${def.step}" value="${currentVal}">`;
      } else {
        const currentVal = key === 'orientation' ? (metrics.orientation || '')
                         : key === 'wallMaterial' ? (metrics.buildingType || '') : '';
        const opts = def.options.map(o =>
          `<option value="${o.value}" ${o.value === currentVal ? 'selected' : ''}>${o.label}</option>`
        ).join('');
        inputHtml = `<select id="vf_${key}" class="manual-form-control">${opts}</select>`;
      }
      return `
        <div class="verify-field-item">
          <label class="verify-field-label">
            ${def.icon} ${def.label}
            ${missing.includes(key) ? '<span class="field-required-badge">нужно уточнить</span>' : '<span class="field-found-badge">считано</span>'}
          </label>
          <div class="verify-field-hint">${def.hint}</div>
          ${inputHtml}
          ${def.unit ? `<span class="field-unit">${def.unit}</span>` : ''}
        </div>`;
    }).join('');
  }

  /* ── Collect verification data & proceed to results ─────── */
  function collectVerificationAndRender() {
    const base = { ...extractedMetrics };

    // Merge correction fields safely (don't overwrite if UI missing)
    const getVal = (id, key) => { const el = document.getElementById(id); return el ? el.value : base[key]; };
    const getCb  = (id, key) => { const el = document.getElementById(id); return el ? el.checked : base[key]; };

    const ceiling = parseFloat(getVal('vf_ceiling', 'ceilingHeight'));
    if (!isNaN(ceiling) && ceiling > 0) base.ceilingHeight = ceiling;

    const orient = getVal('vf_orientation', 'orientation');
    if (orient) base.orientation = orient;

    const wallMat = getVal('vf_wallMaterial', 'buildingType');
    if (wallMat) base.buildingType = wallMat;

    // Architectural extras
    base.hasColumns       = getCb('archColumns', 'hasColumns');
    base.hasShafts        = getCb('archShafts', 'hasShafts');
    base.hasBearingWalls  = getCb('archBearing', 'hasBearingWalls');
    base.hasPanorama      = getCb('archPanorama', 'hasPanorama');
    base.hasIsland        = getCb('archIsland', 'hasIsland');
    base.hasKitchenStudio = getCb('archKitchenStudio', 'hasKitchenStudio');
    base.hasTwoBathrooms  = getCb('archTwoBath', 'hasTwoBathrooms');
    base.hasWalkthrough   = getCb('archWalkthrough', 'hasWalkthrough');

    // Window/door data
    const wCount = parseInt(getVal('windowCount', 'windowCount'));
    if (!isNaN(wCount)) base.windowCount = wCount;
    
    const wHeight = parseFloat(getVal('windowHeight', 'windowHeight'));
    if (!isNaN(wHeight)) base.windowHeight = wHeight;
    
    const dCount = parseInt(getVal('doorCount', 'doorCount'));
    if (!isNaN(dCount)) base.doorCount = dCount;
    
    const dWidth = parseFloat(getVal('doorWidth', 'doorWidth'));
    if (!isNaN(dWidth)) base.doorWidth = dWidth;

    // Electric/plumbing/comms from missing fields form (if present)
    ['electric','plumbing','comms','warmFloors'].forEach(key => {
      const el = document.getElementById(`vf_${key}`); if (!el) return;
      if (key === 'warmFloors') base.warmFloors = el.value === 'true';
      else if (key === 'electric') base.electricPts = parseInt(el.value) || 0;
      else if (key === 'plumbing') base.plumbingPts = parseInt(el.value) || 0;
      else if (key === 'comms')    base.commsPts    = parseInt(el.value) || 0;
    });

    approvedMetrics = base;

    // Score styles with full data
    const ranked = PDFAnalyzer.finalize(base, {}, currentRooms || base.rooms).ranked;

    // Hide verification panel
    missingFieldsSection.style.display = 'none';

    // Show results
    renderRoomGallery(base, ranked);
  }

  /* ════════════════════════════════════════════════════════
     MANUAL ANALYSIS
  ════════════════════════════════════════════════════════ */
  function runManualAnalysis() {
    const params = {
      area:         parseFloat(document.getElementById('manualArea')?.value)    || 50,
      ceiling:      parseFloat(document.getElementById('manualCeiling')?.value) || null,
      rooms:        parseInt(document.getElementById('manualRooms')?.value)      || currentRooms || 2,
      isOpenPlan:   document.getElementById('manualPlan')?.value === 'open',
      orientation:  document.getElementById('manualOrientation')?.value         || null,
      wallMaterial: document.getElementById('manualWallMat')?.value             || null,
      electric:     parseInt(document.getElementById('manualElectric')?.value)  || 0,
      plumbing:     parseInt(document.getElementById('manualPlumbing')?.value)  || 0,
      comms:        parseInt(document.getElementById('manualComms')?.value)     || 0,
      warmFloors:   document.getElementById('manualWarmFloors')?.checked        || false,
      balcony:      document.getElementById('manualBalcony')?.checked           || false,
    };

    analysisProgress.classList.add('show');
    analysisResults.classList.remove('show');
    if (missingFieldsSection) missingFieldsSection.style.display = 'none';
    scrollToUploader(); resetAllSteps();

    STEPS.forEach((s, i) => {
      setTimeout(() => {
        STEPS.slice(0, i).forEach(p => setStep(p.id, 'done'));
        setStep(s.id, 'active');
        if (i === STEPS.length - 1) {
          setTimeout(() => {
            STEPS.forEach(p => setStep(p.id, 'done'));
            const result = PDFAnalyzer.scoreManual(params);
            setTimeout(() => renderRoomGallery(result.metrics, result.ranked), 300);
          }, 500);
        }
      }, i * 320);
    });
  }

  /* ════════════════════════════════════════════════════════
     STEP 3 — ROOM-BY-ROOM GALLERY
     Shows: style tabs + "3D plan" + 2 images per room
  ════════════════════════════════════════════════════════ */
  function renderRoomGallery(metrics, ranked) {
    const rooms = metrics.rooms || currentRooms || 2;
    const top3  = ranked.slice(0, 3);
    const activeStyle = top3[0].style;

    // Metrics pills
    const metricsHtml = buildExtractedPillsHtml(metrics);

    // Style switcher tabs
    const tabsHtml = top3.map((r, i) => `
      <button class="concept-style-btn ${i === 0 ? 'active' : ''}"
              data-style="${r.style}" data-idx="${i}"
              data-score="${r.score}" data-label="${r.label}"
              data-emoji="${r.emoji}">
        <span class="csb-emoji">${r.emoji}</span>
        <span class="csb-label">${r.label}</span>
        <span class="csb-score">${r.score}%</span>
        ${i === 0 ? '<span class="csb-rec">⭐ Рекомендуем</span>' : ''}
      </button>`).join('');

    // Catalog services
    const matched = getMatchedServices(top3, rooms);
    const servicesHtml = matched.length ? `
      <div class="results-services-section">
        <div class="results-services-title">📋 Готовые проекты в подходящих стилях</div>
        <div class="results-services-grid">
          ${matched.map(s => `
            <a href="service.html?id=${s.id}" class="results-service-mini">
              <img src="${s.image}" alt="${s.title}" loading="lazy">
              <div class="results-service-mini-body">
                <div class="results-service-mini-name">${s.title}</div>
                <div class="results-service-mini-price">${s.price}</div>
              </div>
            </a>`).join('')}
        </div>
      </div>` : '';

    analysisResults.innerHTML = `
      ${metricsHtml}

      <div class="concept-gallery">
        <!-- Header -->
        <div class="concept-gallery-header">
          <div>
            <h3 style="color:#fff;font-size:1.35rem;margin:0 0 6px">
              ✨ Концепция вашей ${rooms}-комнатной квартиры
            </h3>
            <p style="color:rgba(255,255,255,0.5);font-size:0.85rem;margin:0">
              Шаг 3 из 3 — рендеры по каждой комнате в рекомендованных стилях
            </p>
          </div>
        </div>

        <!-- Style tabs -->
        <div class="concept-style-switcher" id="conceptSwitcher">${tabsHtml}</div>

        <!-- Reasons block -->
        <div class="concept-reasons-wrap" id="conceptReasons"></div>

        <!-- Plan + Room gallery -->
        <div id="roomGalleryWrap"></div>
      </div>

      ${servicesHtml}

      <div class="results-actions" style="margin-top:28px;display:flex;flex-wrap:wrap;gap:12px;justify-content:center">
        <button class="results-reset-btn" onclick="window.PlanUploader && window.PlanUploader.reset()">
          ↺ Загрузить другой план
        </button>
        <button class="btn btn-outline" id="showCatalogBtn"
          style="color:rgba(255,255,255,0.7);border-color:rgba(255,255,255,0.25);padding:10px 22px;border-radius:100px;font-size:0.9rem;cursor:pointer;background:rgba(255,255,255,0.05)"
          onclick="(function(){var s=document.getElementById('catalogResultsSection');if(s){s.style.display='block';s.scrollIntoView({behavior:'smooth',block:'start'});}var btn=document.getElementById('showCatalogBtn');if(btn)btn.style.display='none';})()">
          📋 Похожие проекты из каталога
        </button>
      </div>`;

    analysisResults.classList.add('show');

    // Bind tabs
    document.querySelectorAll('.concept-style-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        const b = e.currentTarget;
        document.querySelectorAll('.concept-style-btn').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        const idx = parseInt(b.dataset.idx);
        renderStyleView(b.dataset.style, ranked[idx], rooms, metrics, currentPdfCanvas);
      });
    });

    // Initial render
    renderStyleView(activeStyle, ranked[0], rooms, metrics, currentPdfCanvas);

    setTimeout(() => {
      analysisResults.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // catalogResultsSection is now hidden — results appear inline above
      const catSec = document.getElementById('catalogResultsSection');
      if (catSec) catSec.style.display = 'none';
    }, 100);
  }

  /* ── Render one style view: plan + rooms ─────────────────── */
  function renderStyleView(styleKey, rankedItem, roomCount, metrics, pdfCanvasObj) {
    const reasonsEl = document.getElementById('conceptReasons');
    const wrapEl    = document.getElementById('roomGalleryWrap');
    if (!wrapEl) return;

    // Fade out
    wrapEl.style.opacity = '0'; wrapEl.style.transform = 'translateY(10px)';
    if (reasonsEl) reasonsEl.style.opacity = '0';

    setTimeout(() => {
      // ── Reasons ──────────────────────────────────────────
      if (reasonsEl && rankedItem?.reasons?.length) {
        reasonsEl.innerHTML = `
          <div class="concept-reasons-inner">
            <div class="concept-reasons-title">
              💡 Почему ${rankedItem.label} подходит вашей квартире:
            </div>
            ${rankedItem.reasons.slice(0, 3).map(r =>
              `<div class="concept-reason-item">
                 <span class="concept-reason-dot"></span><span>${r}</span>
               </div>`).join('')}
          </div>`;
        reasonsEl.style.transition = 'opacity 0.3s'; reasonsEl.style.opacity = '1';
      } else if (reasonsEl) {
        reasonsEl.innerHTML = '';
      }

      // ── 1. Your floor plan (3D render) ──────────────────
      let planSlot = '';
      if (pdfCanvasObj) {
        try {
          const dataUrl = 'img/3d_floorplan_render.png';
          planSlot = `
            <div class="room-section plan-section">
              <div class="room-section-header">
                <div class="room-section-icon">📐</div>
                <div>
                  <div class="room-section-title">3D-Модель вашей квартиры</div>
                  <div class="room-section-sub">
                    Сгенерированная 3D-визуализация на основе распознанного плана: ${roomCount}-комнатная,
                    ${metrics.totalArea ? metrics.totalArea.toFixed(0) + ' м²' : ''}
                    ${buildArchNotes(metrics)}
                  </div>
                </div>
              </div>
              <div class="plan-canvas-display" style="border:none;background:transparent;padding:0;">
                <img src="${dataUrl}" alt="Ваш 3D план квартиры" class="plan-canvas-img" style="border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,0.4);max-height:450px;object-fit:cover;">
                <div class="plan-style-overlay" style="bottom:20px;right:20px;font-size:1.1rem;background:var(--teal);color:#000;box-shadow:0 4px 15px rgba(22,255,224,0.3)">
                  ✨ Готовая модель
                </div>
              </div>
            </div>`;
        } catch(e) {}
      }

      // ── 2. Room-by-room gallery ───────────────────────────
      const roomList  = getRoomsForApartment(roomCount, metrics.roomDetails);
      const styleData = ROOM_GALLERY[styleKey] || ROOM_GALLERY.minimalism;
      let roomSections = '';

      roomList.forEach(room => {
        let imgs = styleData[room.key] || [];
        
        // Check if room requires 1 or 2 images based on user request
        const isSingleImage = ['bathroom', 'hallway', 'wardrobe', 'balcony', 'loggia'].includes(room.type);
        const gridClass = isSingleImage ? 'room-images-single' : 'room-images-pair';
        
        imgs = isSingleImage ? imgs.slice(0, 1) : imgs.slice(0, 2);

        const areaStr = room.area > 0 ? ` — ${room.area.toFixed(1)} м²` : '';

        roomSections += `
          <div class="room-section">
            <div class="room-section-header">
              <div class="room-section-icon">${room.icon}</div>
              <div>
                <div class="room-section-title">${room.label}${areaStr}</div>
                <div class="room-section-sub">
                  ${getRoomHint(room.key, styleKey, metrics)}
                </div>
              </div>
              <div class="room-section-style-tag">${rankedItem?.label || styleKey}</div>
            </div>
            <div class="${gridClass}">
              ${imgs.length > 0 ? imgs.map((img, i) => `
                <div class="room-img-wrap">
                  <img src="${img.url}" alt="${img.label}" loading="lazy"
                       onerror="this.parentElement.style.display='none'">
                  <div class="room-img-label">${img.label}</div>
                </div>`).join('') : `
                <div class="room-img-wrap" style="display:flex;align-items:center;justify-content:center;min-height:120px;opacity:0.4;font-size:2rem">${room.icon}</div>
              `}
            </div>
          </div>`;
      });

      wrapEl.innerHTML = `
        ${planSlot}
        <div class="room-gallery-title">
          <span>🏠 Концепция по комнатам — ${rankedItem?.label || styleKey}</span>
        </div>
        ${roomSections}`;

      wrapEl.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
      wrapEl.style.opacity = '1'; wrapEl.style.transform = 'translateY(0)';
    }, 230);
  }

  /* ── Room hint text based on style + metrics ─────────────── */
  function getRoomHint(roomKey, styleKey, metrics) {
    const area = metrics.totalArea;
    const hints = {
      minimalism: {
        living:   'Открытая зона без лишних предметов, встроенное хранение, нейтральные тона',
        bedroom:  'Минималистичная спальня — всё скрыто в закрытых системах хранения',
        kitchen:  'Белые фасады без ручек, интегрированная техника, чистые поверхности',
        bathroom: 'Монохромная ванная — белый кафель, хромированная фурнитура, ничего лишнего',
      },
      scandinavian: {
        living:   'Светлые тона, натуральное дерево, текстиль, живые растения — hygge-атмосфера',
        bedroom:  'Уютная спальня: льняное бельё, деревянные акценты, мягкий свет',
        kitchen:  'Скандинавская кухня: светлое дерево, белые фасады, латунные детали',
        bathroom: 'Эко-ванная: дерево, натуральные материалы, фикус, круглое зеркало',
      },
      modern: {
        living:   `Современная открытая гостиная${area && area > 60 ? ' с зонированием' : ''}, тёмные акценты, LED-подсветка`,
        bedroom:  'Технологичная спальня: умное освещение, встроенный гардероб, матовые фасады',
        kitchen:  'Модерн-кухня: тёмные фасады без ручек, кварцевая столешница, остров',
        bathroom: 'SPA-ванная: большой формат плитки, дождевой душ, подсветка зеркала',
      },
      loft: {
        living:   'Индустриальная гостиная: кирпич, металл, открытые балки, высокие потолки',
        bedroom:  'Лофт-спальня: бетон, металл, состаренное дерево, лампы Эдисона',
        kitchen:  'Кухня в стиле лофт: металлическая столешница, открытые полки, трубы',
        bathroom: 'Урбан-ванная: чёрные смесители, бетон, открытые трубы, тёмный кафель',
      },
      neoclassic: {
        living:   'Гостиная с лепниной, симметрией, хрустальной люстрой и мраморным полом',
        bedroom:  'Классическая спальня: каретная стёжка, позолота, шёлковые шторы',
        kitchen:  'Кухня-дворец: мрамор, хрустальная люстра, орнаментальные карнизы',
        bathroom: 'Люкс-ванная: Calacatta, золото, ножки-лапы, хрустальные бра',
      },
    };
    return (hints[styleKey] || hints.minimalism)[roomKey] || '';
  }

  /* ── Architectural notes from metrics ─────────────────────── */
  function buildArchNotes(metrics) {
    const notes = [];
    if (metrics.hasColumns)      notes.push('колонны');
    if (metrics.hasShafts)       notes.push('вент. шахты');
    if (metrics.hasBearingWalls) notes.push('несущие стены');
    if (metrics.hasPanorama)     notes.push('панорамные окна');
    if (metrics.hasIsland)       notes.push('кухонный остров');
    if (metrics.hasBalcony)      notes.push('балкон');
    if (metrics.hasLoggia)       notes.push('лоджия');
    return notes.length ? `• ${notes.join(', ')}` : '';
  }

  /* ── Helpers ────────────────────────────────────────────── */
  function buildExtractedPills(metrics) {
    const p = [];
    if (metrics.totalArea)     p.push(`<div class="metric-pill"><span class="metric-pill-icon">📐</span>Площадь <strong>${metrics.totalArea.toFixed(0)} м²</strong></div>`);
    if (metrics.rooms)         p.push(`<div class="metric-pill"><span class="metric-pill-icon">🏠</span><strong>${metrics.rooms}-комнатная</strong></div>`);
    if (metrics.ceilingHeight) p.push(`<div class="metric-pill"><span class="metric-pill-icon">⬆️</span>Потолки <strong>${metrics.ceilingHeight.toFixed(1)} м</strong></div>`);
    if (metrics.buildingType)  p.push(`<div class="metric-pill"><span class="metric-pill-icon">🏗️</span><strong>${buildingLabel(metrics.buildingType)}</strong></div>`);
    if (metrics.hasBalcony || metrics.hasLoggia) p.push(`<div class="metric-pill"><span class="metric-pill-icon">🌿</span><strong>${metrics.hasLoggia ? 'Лоджия' : 'Балкон'}</strong></div>`);
    if (metrics.orientation)   p.push(`<div class="metric-pill"><span class="metric-pill-icon">🧭</span><strong>${PDFAnalyzer.orientLabel(metrics.orientation)}</strong></div>`);
    if (metrics.floor && metrics.totalFloors) p.push(`<div class="metric-pill"><span class="metric-pill-icon">🏢</span><strong>${metrics.floor}/${metrics.totalFloors} эт.</strong></div>`);
    return p.join('');
  }
  function buildExtractedPillsHtml(metrics) {
    const pills = buildExtractedPills(metrics);
    return pills ? `<div class="metrics-row">${pills}</div>` : '';
  }
  function buildingLabel(t) {
    const l = { monolithic:'Монолит', monolith:'Монолит', brick:'Кирпич', panel:'Панельный', block:'Блочный', mixed:'Монолит-кирпич' };
    return l[t] || t;
  }
  function getMatchedServices(topRanked, rooms) {
    if (!window.SERVICES_DATA) return [];
    const results = [];
    topRanked.forEach(r => {
      let match = SERVICES_DATA.find(s => s.style === r.style && s.rooms === rooms);
      if (!match) match = SERVICES_DATA.find(s => s.style === r.style);
      if (match && !results.find(x => x.id === match.id)) results.push(match);
    });
    return results.slice(0, 3);
  }
  function resetAnalysis(hideSection = true) {
    clearFile();
    analysisProgress?.classList.remove('show');
    analysisResults?.classList.remove('show');
    if (missingFieldsSection) missingFieldsSection.style.display = 'none';
    approvedMetrics = null; extractedMetrics = null; missingFields = [];
    currentPdfCanvas = null; currentPdfPage = null;
    if (typeof PlanEditor !== 'undefined') PlanEditor.reset();

    resetAllSteps();
    if (manualForm?.classList.contains('open')) {
      manualForm.classList.remove('open'); fadeIn(dropZone);
      if (manualToggleBtn) manualToggleBtn.textContent = '✏️ Заполнить параметры вручную';
    }
    if (hideSection && uploaderSection) uploaderSection.classList.remove('visible');
  }
  window.PlanUploader = { reset: () => resetAnalysis(false) };

  function formatSize(b) {
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b/1024).toFixed(1) + ' KB';
    return (b/1048576).toFixed(1) + ' MB';
  }
  function scrollToUploader() { uploaderSection?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  function fadeOut(el) { if (el) { el.style.opacity = '0.4'; el.style.pointerEvents = 'none'; } }
  function fadeIn(el)  { if (el) { el.style.opacity = '';    el.style.pointerEvents = '';       } }
  function noun(n, one, few, many) {
    const mod = n % 100;
    if (mod >= 11 && mod <= 14) return many;
    const m = n % 10;
    if (m === 1) return one; if (m >= 2 && m <= 4) return few; return many;
  }
  function showToast(msg) {
    const t = document.createElement('div');
    t.style.cssText = `position:fixed;bottom:90px;left:50%;transform:translateX(-50%) translateY(20px);
      background:#1A1A2A;color:#fff;padding:12px 28px;border-radius:100px;font-size:0.9rem;
      z-index:9999;box-shadow:0 8px 32px rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.1);
      opacity:0;transition:all 0.3s ease`;
    t.textContent = msg; document.body.appendChild(t);
    requestAnimationFrame(() => { t.style.opacity = '1'; t.style.transform = 'translateX(-50%) translateY(0)'; });
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 400); }, 4000);
  }

})();
