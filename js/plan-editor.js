/* ============================================================
   PLAN EDITOR  — v1
   Interactive overlay editor for apartment floor plans.
   Uses PDF.js text coordinates to place smart markers.

   Usage:
     PlanEditor.init({
       canvas:      <HTMLCanvasElement>,   // PDF rendered canvas
       pdfPage:     <PDFPage>,             // PDF.js page object
       roomDetails: [...],                 // from PDFAnalyzer
       metrics:     {...},                 // from PDFAnalyzer
       onConfirm:   fn(updatedMetrics),    // callback
       container:   <HTMLElement>,         // where to inject UI
     });
   ============================================================ */

const PlanEditor = (() => {
  'use strict';

  /* ── State ─────────────────────────────────────────────── */
  let _canvas, _pdfPage, _roomDetails, _metrics, _onConfirm;
  let _textItems  = [];    // [{str, x, y, w, h}]
  let _dimensions = [];    // [{id, label, value, unit, required, source, icon}]
  let _svgOverlay = null;

  /* ══════════════════════════════════════════════════════════
     PUBLIC API
  ══════════════════════════════════════════════════════════ */

  async function init({ canvas, pdfPage, roomDetails, metrics, onConfirm, container }) {
    _canvas      = canvas;
    _pdfPage     = pdfPage;
    _roomDetails = roomDetails || [];
    _metrics     = metrics    || {};
    _onConfirm   = onConfirm  || (() => {});

    if (!container) return;

    // Extract text positions from PDF
    if (pdfPage) {
      _textItems = await extractTextPositions(pdfPage, canvas);
    }

    // Build dimensions list
    _dimensions = buildDimensionsList(metrics, roomDetails);

    // Render editor UI
    renderEditorUI(container);
  }

  /* ── Extract text item positions from PDF.js ─────────────── */
  async function extractTextPositions(pdfPage, canvas) {
    try {
      const tc       = await pdfPage.getTextContent();
      const vp       = pdfPage.getViewport({ scale: 1.5 });
      const scaleX   = canvas.width  / vp.width;
      const scaleY   = canvas.height / vp.height;

      return tc.items.map(item => {
        const [a, b, c, d, tx, ty] = item.transform;
        // PDF coordinates: origin bottom-left; canvas: top-left
        const x = tx * scaleX;
        const y = (vp.height - ty) * scaleY;
        const w = Math.abs(item.width  * scaleX);
        const h = Math.abs(item.height * scaleY);
        return { str: item.str.trim(), x, y, w, h };
      }).filter(it => it.str.length > 0);
    } catch(e) {
      console.warn('[PlanEditor] Could not extract text positions:', e);
      return [];
    }
  }

  /* ── Build dimensions table from metrics ─────────────────── */
  function buildDimensionsList(metrics, roomDetails) {
    const dims = [];

    // ── Room areas ──────────────────────────────────────────
    const typeIconMap = {
      hallway: '🚪', wardrobe: '👔', living: '🛏️',
      kitchen: '🍳', bathroom: '🚿', loggia:  '🌿', balcony: '🌿', other: '📐',
    };
    const colors = [
      '#e74c3c', '#2ecc71', '#3498db', '#9b59b6', '#f1c40f', '#e67e22', '#1abc9c', '#34495e',
      '#e84393', '#00cec9', '#fdcb6e', '#d63031', '#6c5ce7', '#ffeaa7', '#00b894', '#0984e3'
    ];
    let colorIndex = 0;

    const sorted = [...(roomDetails || [])].sort((a, b) => a.id - b.id);
    sorted.forEach(r => {
      dims.push({
        id:       `room_${r.id}`,
        label:    `${r.id}) ${r.nameRu || r.name}`,
        value:    r.area > 0 ? r.area : null,
        unit:     'м²',
        required: false,
        source:   r.area > 0 ? 'bti' : 'missing',
        icon:     typeIconMap[r.type] || '📐',
        roomId:   r.id,
        type:     r.type,
        color:    colors[colorIndex % colors.length]
      });
      colorIndex++;
    });

    // ── Architectural elements ───────────────────────────────
    // Columns
    dims.push({
      id: 'column_size', label: 'Колонна (сечение)', unit: 'м×м',
      value: metrics.hasColumns ? '0.53×0.53' : null,
      required: false, source: metrics.hasColumns ? 'bti' : 'missing',
      icon: '🏛️', inputType: 'text', placeholder: 'напр. 0.53×0.53',
    });

    // Shafts
    dims.push({
      id: 'shaft_main', label: 'Вент. шахта (осн.)', unit: 'м×м',
      value: metrics.hasShafts ? '0.55×1.04' : null,
      required: false, source: metrics.hasShafts ? 'bti' : 'missing',
      icon: '🔲', inputType: 'text', placeholder: 'напр. 0.55×1.04',
    });
    dims.push({
      id: 'shaft_bath', label: 'Шахта в санузле', unit: 'м×м',
      value: null,
      required: false, source: 'missing',
      icon: '🔲', inputType: 'text', placeholder: 'напр. 0.43×2.20',
    });

    // ── Building parameters ──────────────────────────────────
    dims.push({
      id: 'ceiling_height', label: 'Высота потолков', unit: 'м',
      value: metrics.ceilingHeight || null,
      required: true, source: metrics.ceilingHeight ? 'bti' : 'missing',
      icon: '⬆️', inputType: 'number', placeholder: '2.70',
    });
    dims.push({
      id: 'window_width', label: 'Ширина окон', unit: 'м',
      value: metrics.windowWidth || null,
      required: false, source: metrics.windowWidth ? 'bti' : 'missing',
      icon: '🪟', inputType: 'number', placeholder: '1.20',
    });
    dims.push({
      id: 'window_height', label: 'Высота окон', unit: 'м',
      value: metrics.windowHeight || null,
      required: false, source: metrics.windowHeight ? 'bti' : 'missing',
      icon: '🪟', inputType: 'number', placeholder: '1.60',
    });
    dims.push({
      id: 'door_width', label: 'Ширина межком. дверей', unit: 'м',
      value: metrics.doorWidth || null,
      required: false, source: metrics.doorWidth ? 'bti' : 'missing',
      icon: '🚪', inputType: 'number', placeholder: '0.80',
    });
    dims.push({
      id: 'entrance_width', label: 'Ширина входной двери', unit: 'м',
      value: null,
      required: false, source: 'missing',
      icon: '🚪', inputType: 'number', placeholder: '0.90',
    });

    return dims;
  }

  /* ── Find approximate position of room label on canvas ────── */
  function findRoomPosition(roomId, canvasW, canvasH) {
    if (_textItems.length === 0) return null;

    // Search for "N)" pattern near room ID
    const patterns = [`${roomId})`, `${roomId} )`, `(${roomId})`];
    for (const pat of patterns) {
      const item = _textItems.find(it => it.str.includes(pat) ||
        (it.str === `${roomId}` && _textItems.some(n =>
          n.str === ')' && Math.abs(n.x - it.x - it.w) < 15 && Math.abs(n.y - it.y) < 10
        ))
      );
      if (item) return { x: item.x, y: item.y };
    }
    return null;
  }

  // Removed buildSVGOverlay since we use PlanGraphicsEditor

  /* ── Render full editor UI ───────────────────────────────── */
  function renderEditorUI(container) {
    const missingCount = _dimensions.filter(d => !d.value && d.required).length;
    const totalMissing = _dimensions.filter(d => !d.value).length;

    container.innerHTML = `
      <div class="plan-editor-wrap" id="planEditorWrap">
        <div class="plan-editor-header">
          <div class="plan-editor-title">
            📐 Шаг 2 — Редактор планировки
          </div>
          <div class="plan-editor-subtitle">
            Проверьте считанные размеры. Если данные не считались или считались неверно, <b>введите номер и площадь вручную согласно паспорту БТИ</b>.
            ${totalMissing > 0
              ? `<span class="plan-editor-badge missing">${totalMissing} не заполнено</span>`
              : `<span class="plan-editor-badge ok">Все данные получены ✓</span>`
            }
          </div>
        </div>

        <div class="plan-editor-body">
          <!-- Left: Plan canvas with overlay -->
          <div class="plan-editor-left">
            <div class="plan-editor-canvas-wrap" id="planEditorCanvasWrap">
              ${_canvas
                ? `<img src="${safeDataUrl(_canvas)}" alt="План квартиры" class="plan-editor-img" id="planEditorImg">`
                : `<div class="plan-editor-no-canvas">📄 PDF не загружен</div>`
              }
              <!-- SVG overlay injected by JS -->
            </div>
            <div class="plan-editor-legend">
              <span class="leg-item"><span class="leg-dot" style="background:#00d4aa"></span> Размер считан</span>
              <span class="leg-item"><span class="leg-dot blink" style="background:#ff6b6b"></span> Требует уточнения</span>
            </div>
          </div>

          <!-- Right: Dimensions table -->
          <div class="plan-editor-right">
            <div class="plan-editor-section-title">📋 Помещения и размеры</div>
            <div class="plan-editor-dims" id="planEditorDims">
              ${buildDimsHTML()}
            </div>
            
            <button class="plan-editor-add-btn" onclick="PlanEditor.addManualRoom()" style="background: rgba(255,255,255,0.1); border: 1px dashed rgba(255,255,255,0.3); color: #fff; border-radius: 6px; padding: 6px 12px; margin-top: 8px; cursor: pointer; width: 100%; text-align: center;">
              + Добавить помещение
            </button>

            <div class="plan-editor-section-title" style="margin-top:18px">🏗️ Конструктивные элементы</div>
            <div class="plan-editor-dims" id="planEditorArch">
              ${buildArchHTML()}
            </div>

            <button class="plan-editor-confirm-btn" id="planEditorConfirm" onclick="PlanEditor.confirm()">
              ✅ Подтвердить планировку →
            </button>
          </div>
        </div>
      </div>`;

    // Inject Graphic Editor into left panel
    if (_canvas) {
      setTimeout(() => {
        // Collect initial positions
        const positions = {};
        _roomDetails.forEach(room => {
          const pos = findRoomPosition(room.id, _canvas.width, _canvas.height);
          if (pos) positions[room.id] = pos;
        });

        const wrap = document.getElementById('planEditorCanvasWrap');
        if (wrap) {
           wrap.innerHTML = '<div id="graphicEditorContainer"></div>';
           PlanGraphicsEditor.init({
              containerId: 'graphicEditorContainer',
              canvas: _canvas,
              roomDetails: _roomDetails,
              positions: positions,
              onChange: (roomId, newArea) => {
                 const input = document.getElementById(`dim_room_${roomId}`);
                 if (input) {
                    input.value = newArea.toFixed(1);
                    // update UI state
                    const row = input.closest('.dim-row');
                    if (row) {
                      row.classList.remove('dim-missing');
                      row.classList.add('dim-found');
                      const status = row.querySelector('.dim-status');
                      if (status) {
                        status.className = 'dim-status found';
                        status.innerHTML = '✅ из чертежа';
                      }
                    }
                 }
              }
           });
        }
        
        // Setup 2-way binding from inputs to graphics editor
        _dimensions.filter(d => d.id.startsWith('room_')).forEach(d => {
           const input = document.getElementById(`dim_${d.id}`);
           if (input) {
             input.addEventListener('input', (e) => {
               const newArea = parseFloat(e.target.value);
               if (!isNaN(newArea) && newArea > 0) {
                 PlanGraphicsEditor.updateRoomArea(d.roomId, newArea);
               }
             });
           }
        });
      }, 100);
    }
  }

  /* ── Build room dimensions rows HTML ─────────────────────── */
  function buildDimsHTML() {
    const rooms = _dimensions.filter(d => d.id.startsWith('room_'));
    return rooms.map(d => dimRow(d)).join('');
  }

  /* ── Build architectural dimensions rows HTML ─────────────── */
  function buildArchHTML() {
    const arch = _dimensions.filter(d => !d.id.startsWith('room_'));
    return arch.map(d => dimRow(d)).join('');
  }

  function dimRow(d) {
    const isFound   = !!d.value;
    const isMissing = !d.value;
    const isRoom    = d.id.startsWith('room_');
    const statusCls = isFound ? 'dim-found' : (d.required ? 'dim-required' : 'dim-missing');
    const statusTxt = isFound
      ? `<span class="dim-status found">✅ из БТИ</span>`
      : (d.required
        ? `<span class="dim-status required">⚡ Обязательно</span>`
        : `<span class="dim-status missing">❓ Уточните</span>`);

    let inputHtml = '';
    // Always render an input for room areas so the user can correct parser mistakes
    if (isMissing || isRoom) {
      inputHtml = `<input
           type="${d.inputType || 'number'}"
           id="dim_${d.id}"
           class="dim-input"
           placeholder="${d.placeholder || ''}"
           value="${isFound ? d.value : ''}"
           step="0.01"
           style="width:90px;margin-left:8px; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.2); color: var(--teal); font-weight: 600; padding: 4px 8px; border-radius: 4px; outline: none; font-family: monospace;"
         >`;
      // Add unit outside the input for aesthetics if it's a room
      if (isRoom) inputHtml += ` <span style="font-size:0.8rem; color:var(--teal)">${d.unit}</span>`;
    } else {
      inputHtml = `<span class="dim-value">${d.value} ${d.unit}</span>`;
    }

    const colorStyle = isRoom && d.color ? `border-left: 4px solid ${d.color}; padding-left: 10px; cursor: pointer;` : '';
    const clickAttr = isRoom && d.color ? `onclick="window.setActiveRoomFromTable('${d.roomId}', '${d.color}')"` : '';

    let labelHtml = `<span class="dim-label" style="flex:1;">${d.label}</span>`;
    if (isRoom) {
      // Prevent click from row bubbling when clicking the input
      labelHtml = `<input type="text" id="dim_name_${d.id}" value="${d.label}" onclick="event.stopPropagation()" oninput="window.updateActiveRoomLabel('${d.roomId}', this.value)" style="flex:1; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.2); color:#fff; border-radius:4px; padding:4px 8px; margin-right:8px; font-family:inherit; font-size:inherit;">`;
    }

    return `
      <div class="dim-row ${statusCls}" style="${colorStyle}" ${clickAttr} id="row_${d.id}">
        <span class="dim-icon">${d.icon}</span>
        ${labelHtml}
        <div class="dim-right">
          ${inputHtml}
          ${statusTxt}
        </div>
      </div>`;
  }
  
  window.updateActiveRoomLabel = function(roomId, newLabel) {
     if (typeof PlanGraphicsEditor !== 'undefined') {
        PlanGraphicsEditor.updateRoomLabel(roomId, newLabel);
     }
  };

  // Global handler for clicking on table row
  window.setActiveRoomFromTable = function(roomId, color) {
    document.querySelectorAll('.dim-row').forEach(row => {
      row.style.backgroundColor = 'transparent';
    });
    const row = document.getElementById(`row_room_${roomId}`);
    if (row) {
      row.style.backgroundColor = 'rgba(255,255,255,0.05)';
    }
    
    let label = '';
    const nameInput = document.getElementById(`dim_name_room_${roomId}`);
    if (nameInput) label = nameInput.value;

    if (typeof PlanGraphicsEditor !== 'undefined') {
       PlanGraphicsEditor.setActiveRoom(roomId, color, label);
    }
  };

  /* ── Safe toDataURL (handles SecurityError) ──────────────── */
  function safeDataUrl(canvas) {
    try { return canvas.toDataURL('image/png'); }
    catch(e) { return ''; }
  }

  /* ── Collect all user inputs and call onConfirm ──────────── */
  function confirm() {
    const updated = { ..._metrics };

    _dimensions.forEach(d => {
      const el = document.getElementById(`dim_${d.id}`);
      if (!el) return;
      const val = el.value.trim();
      if (!val) return;
      
      const num = parseFloat(val);
      if (d.id.startsWith('room_')) {
        let nameEl = document.getElementById(`dim_name_${d.id}`);
        let newName = nameEl ? nameEl.value.trim() : d.label;
        
        let rd = _roomDetails.find(r => r.id == d.roomId);
        if (!rd) {
           rd = { id: d.roomId, name: newName, type: 'other', area: 0 };
           _roomDetails.push(rd);
        }
        rd.area = num;
        rd.name = newName;
      } else {
        if (d.id === 'ceiling_height') updated.ceilingHeight = num;
        if (d.id === 'window_width')   updated.windowWidth   = num;
        if (d.id === 'window_height')  updated.windowHeight  = num;
        if (d.id === 'door_width')     updated.doorWidth     = num;
      }
    });

    // Update roomDetails in metrics
    if (_roomDetails && _roomDetails.length > 0) {
      updated.roomDetails = _roomDetails;
    }

    // Visual feedback
    const btn = document.getElementById('planEditorConfirm');
    if (btn) {
      btn.textContent = '⏳ Генерируем рендеры...';
      btn.disabled = true;
    }

    _onConfirm(updated);
  }

  /* ── Reset ───────────────────────────────────────────────── */
  function reset() {
    _canvas      = null;
    _pdfPage     = null;
    _roomDetails = [];
    _metrics     = {};
    _textItems   = [];
    _dimensions  = [];
    _svgOverlay  = null;
  }

  /* ── Add Manual Room ──────────── */
  function addManualRoom() {
    // 1. Save currently entered data before re-rendering
    _dimensions.forEach(d => {
       const valEl = document.getElementById(`dim_${d.id}`);
       if (valEl) d.value = valEl.value;
       
       if (d.id.startsWith('room_')) {
          const nameEl = document.getElementById(`dim_name_${d.id}`);
          if (nameEl) d.label = nameEl.value;
       }
    });

    const rooms = _dimensions.filter(d => d.id.startsWith('room_'));
    const newId = rooms.length > 0 ? Math.max(...rooms.map(r => parseInt(r.roomId) || 0)) + 1 : 1;
    
    const colors = [
      '#e74c3c', '#2ecc71', '#3498db', '#9b59b6', '#f1c40f', '#e67e22', '#1abc9c', '#34495e',
      '#e84393', '#00cec9', '#fdcb6e', '#d63031', '#6c5ce7', '#ffeaa7', '#00b894', '#0984e3'
    ];
    const newColor = colors[(newId - 1) % colors.length];

    const newDim = {
      id:       `room_${newId}`,
      label:    `${newId}) Помещение ${newId}`,
      value:    null,
      unit:     'м²',
      required: false,
      source:   'missing',
      icon:     '📐',
      roomId:   newId,
      type:     'other',
      color:    newColor
    };
    
    _dimensions.splice(rooms.length, 0, newDim); // insert after existing rooms
    
    const dimsContainer = document.getElementById('planEditorDims');
    if (dimsContainer) {
       dimsContainer.innerHTML = buildDimsHTML();
    }
    
    if (!_roomDetails.find(r => r.id == newId)) {
        _roomDetails.push({ id: newId, name: newDim.label, type: 'other', area: 0 });
    }
  }

  return { init, confirm, reset, extractTextPositions, addManualRoom };

})();
