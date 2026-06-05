/* ============================================================
   DXF ANALYZER — AutoCAD DXF Parser + Style Scoring Engine
   Supports: R12/R13/R14/2000/2004/2007/2010/2013/2018 DXF ASCII
   ============================================================ */

const DXFAnalyzer = (() => {

  /* ──────────────────────────────────────────────────────────
     SECTION 1 — DXF PARSER
  ─────────────────────────────────────────────────────────── */

  /**
   * Tokenize DXF: returns array of {code, value} pairs
   */
  function tokenize(text) {
    const tokens = [];
    const lines = text.split(/\r?\n/);
    let i = 0;
    while (i < lines.length - 1) {
      const code = parseInt(lines[i].trim(), 10);
      const value = lines[i + 1].trim();
      if (!isNaN(code)) tokens.push({ code, value });
      i += 2;
    }
    return tokens;
  }

  /**
   * Find sections in token stream
   */
  function findSection(tokens, name) {
    const start = tokens.findIndex((t, i) =>
      t.code === 0 && t.value === 'SECTION' &&
      tokens[i + 1] && tokens[i + 1].code === 2 && tokens[i + 1].value === name
    );
    if (start === -1) return [];
    const end = tokens.findIndex((t, i) => i > start && t.code === 0 && t.value === 'ENDSEC');
    return end === -1 ? tokens.slice(start) : tokens.slice(start, end + 1);
  }

  /**
   * Parse HEADER section → extract INSUNITS, $EXTMAX/$EXTMIN
   */
  function parseHeader(tokens) {
    const header = findSection(tokens, 'HEADER');
    const info = { units: 4, extMin: null, extMax: null, ceilingHeight: null };

    for (let i = 0; i < header.length; i++) {
      const t = header[i];
      if (t.code === 9) {
        if (t.value === '$INSUNITS' && header[i + 1]) info.units = parseInt(header[i + 1].value) || 4;
        if (t.value === '$EXTMIN' && i + 3 < header.length) {
          info.extMin = {
            x: parseFloat(header[i + 1]?.value) || 0,
            y: parseFloat(header[i + 3]?.value) || 0
          };
        }
        if (t.value === '$EXTMAX' && i + 3 < header.length) {
          info.extMax = {
            x: parseFloat(header[i + 1]?.value) || 0,
            y: parseFloat(header[i + 3]?.value) || 0
          };
        }
      }
    }
    return info;
  }

  /**
   * Parse LAYERS — detect semantic layers (walls, windows, doors, plumbing, electric)
   */
  function parseLayers(tokens) {
    const tables = findSection(tokens, 'TABLES');
    const layers = new Set();
    tables.forEach(t => {
      if (t.code === 2 || t.code === 8) {
        const v = t.value.toLowerCase();
        if (v.length > 0) layers.add(v);
      }
    });
    return Array.from(layers);
  }

  /**
   * Classify a layer name into semantic category
   */
  function classifyLayer(name) {
    const n = (name || '').toLowerCase();
    if (/стен|wall|кирпич|бетон|несущ/.test(n))    return 'wall';
    if (/окн|window|свет/.test(n))                   return 'window';
    if (/двер|door/.test(n))                         return 'door';
    if (/вк|канал|сток|сантехн|toilet|plumb/.test(n)) return 'plumbing';
    if (/электр|щит|розетк|выключ|electric/.test(n)) return 'electric';
    if (/греб|гребенк|comb/.test(n))                 return 'heating';
    if (/мебел|furni|диван|кровать|стол/.test(n))    return 'furniture';
    if (/разм|dim/.test(n))                           return 'dimension';
    if (/ось|axis|center/.test(n))                    return 'axis';
    return 'other';
  }

  /**
   * Parse ENTITIES section → extract geometry
   */
  function parseEntities(tokens) {
    const entities = findSection(tokens, 'ENTITIES');
    const lines = [];
    const polylines = [];
    const texts = [];
    const dimensions = [];
    const inserts = [];

    let i = 0;
    while (i < entities.length) {
      const t = entities[i];

      if (t.code === 0 && t.value === 'LINE') {
        const ent = { type: 'LINE', layer: '', x1: 0, y1: 0, x2: 0, y2: 0 };
        i++;
        while (i < entities.length && entities[i].code !== 0) {
          const et = entities[i];
          if (et.code === 8)  ent.layer = et.value;
          if (et.code === 10) ent.x1 = parseFloat(et.value) || 0;
          if (et.code === 20) ent.y1 = parseFloat(et.value) || 0;
          if (et.code === 11) ent.x2 = parseFloat(et.value) || 0;
          if (et.code === 21) ent.y2 = parseFloat(et.value) || 0;
          i++;
        }
        ent.length = Math.hypot(ent.x2 - ent.x1, ent.y2 - ent.y1);
        lines.push(ent);
        continue;
      }

      if (t.code === 0 && (t.value === 'LWPOLYLINE' || t.value === 'POLYLINE')) {
        const ent = { type: t.value, layer: '', vertices: [], closed: false };
        i++;
        let cx = 0, cy = 0;
        while (i < entities.length && entities[i].code !== 0) {
          const et = entities[i];
          if (et.code === 8)  ent.layer = et.value;
          if (et.code === 70) ent.closed = (parseInt(et.value) & 1) === 1;
          if (et.code === 10) cx = parseFloat(et.value) || 0;
          if (et.code === 20) { cy = parseFloat(et.value) || 0; ent.vertices.push({ x: cx, y: cy }); }
          i++;
        }
        polylines.push(ent);
        continue;
      }

      if (t.code === 0 && (t.value === 'TEXT' || t.value === 'MTEXT')) {
        const ent = { type: t.value, layer: '', text: '', x: 0, y: 0 };
        i++;
        while (i < entities.length && entities[i].code !== 0) {
          const et = entities[i];
          if (et.code === 8)  ent.layer = et.value;
          if (et.code === 1)  ent.text = et.value;
          if (et.code === 10) ent.x = parseFloat(et.value) || 0;
          if (et.code === 20) ent.y = parseFloat(et.value) || 0;
          i++;
        }
        texts.push(ent);
        continue;
      }

      if (t.code === 0 && t.value === 'DIMENSION') {
        const ent = { type: 'DIMENSION', layer: '', measurement: 0 };
        i++;
        while (i < entities.length && entities[i].code !== 0) {
          const et = entities[i];
          if (et.code === 8)  ent.layer = et.value;
          if (et.code === 42) ent.measurement = parseFloat(et.value) || 0;
          i++;
        }
        if (ent.measurement > 0) dimensions.push(ent);
        continue;
      }

      if (t.code === 0 && t.value === 'INSERT') {
        const ent = { type: 'INSERT', layer: '', blockName: '', x: 0, y: 0 };
        i++;
        while (i < entities.length && entities[i].code !== 0) {
          const et = entities[i];
          if (et.code === 8)  ent.layer = et.value;
          if (et.code === 2)  ent.blockName = et.value;
          if (et.code === 10) ent.x = parseFloat(et.value) || 0;
          if (et.code === 20) ent.y = parseFloat(et.value) || 0;
          i++;
        }
        inserts.push(ent);
        continue;
      }

      i++;
    }

    return { lines, polylines, texts, dimensions, inserts };
  }

  /**
   * Compute unit scale factor to meters
   */
  function unitScale(insunits) {
    // DXF INSUNITS: 1=inches 2=feet 4=mm 5=cm 6=m 14=Microinches
    const scales = { 1: 0.0254, 2: 0.3048, 4: 0.001, 5: 0.01, 6: 1 };
    return scales[insunits] || 0.001; // default mm
  }

  /* ──────────────────────────────────────────────────────────
     SECTION 2 — METRICS EXTRACTION
  ─────────────────────────────────────────────────────────── */

  function extractMetrics(headerInfo, entities, layerNames) {
    const scale = unitScale(headerInfo.units);

    // ── Bounding box from header or compute from entities ──
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;

    if (headerInfo.extMin && headerInfo.extMax &&
        headerInfo.extMax.x > headerInfo.extMin.x) {
      xMin = headerInfo.extMin.x; xMax = headerInfo.extMax.x;
      yMin = headerInfo.extMin.y; yMax = headerInfo.extMax.y;
    } else {
      entities.lines.forEach(l => {
        xMin = Math.min(xMin, l.x1, l.x2); xMax = Math.max(xMax, l.x1, l.x2);
        yMin = Math.min(yMin, l.y1, l.y2); yMax = Math.max(yMax, l.y1, l.y2);
      });
      entities.polylines.forEach(p => {
        p.vertices.forEach(v => {
          xMin = Math.min(xMin, v.x); xMax = Math.max(xMax, v.x);
          yMin = Math.min(yMin, v.y); yMax = Math.max(yMax, v.y);
        });
      });
    }

    if (!isFinite(xMin)) { xMin = 0; xMax = 10000; yMin = 0; yMax = 8000; }

    const widthRaw  = (xMax - xMin) * scale;
    const heightRaw = (yMax - yMin) * scale;

    // Guard: if dimensions seem non-metric (e.g. < 3m) assume mm
    const w = widthRaw < 3 ? widthRaw * 1000 : widthRaw;
    const h = heightRaw < 3 ? heightRaw * 1000 : heightRaw;

    const totalArea = Math.round(w * h * 100) / 100; // m²
    const aspectRatio = h > 0 ? w / h : 1;

    // ── Wall entities ──
    const wallLines = entities.lines.filter(l => classifyLayer(l.layer) === 'wall' || l.layer === '0');
    const wallPolylines = entities.polylines.filter(p => classifyLayer(p.layer) === 'wall' || p.layer === '0');

    // Estimate total wall length
    let totalWallLength = 0;
    wallLines.forEach(l => totalWallLength += l.length * scale);
    wallPolylines.forEach(p => {
      for (let i = 0; i < p.vertices.length - 1; i++) {
        const v1 = p.vertices[i], v2 = p.vertices[i + 1];
        totalWallLength += Math.hypot(v2.x - v1.x, v2.y - v1.y) * scale;
      }
    });
    if (totalWallLength < 5) totalWallLength *= 1000; // unit correction

    // ── Closed polygons (rooms) ──
    const closedPolygons = entities.polylines.filter(p => p.closed && p.vertices.length >= 4);
    const roomAreas = closedPolygons.map(p => Math.abs(shoelaceArea(p.vertices)) * scale * scale);
    const largestRoom = roomAreas.length ? Math.max(...roomAreas) : totalArea * 0.4;
    const estimatedRooms = closedPolygons.length > 1 ? closedPolygons.length : null;

    // ── Openings ──
    const windowLines = entities.lines.filter(l => classifyLayer(l.layer) === 'window');
    const doorLines   = entities.lines.filter(l => classifyLayer(l.layer) === 'door');
    const windowCount = windowLines.length + entities.polylines.filter(p => classifyLayer(p.layer) === 'window').length;
    const doorCount   = doorLines.length   + entities.polylines.filter(p => classifyLayer(p.layer) === 'door').length;

    // ── Layer presence flags ──
    const hasPlumbing  = layerNames.some(l => classifyLayer(l) === 'plumbing')  || entities.lines.some(l => classifyLayer(l.layer) === 'plumbing');
    const hasElectric  = layerNames.some(l => classifyLayer(l) === 'electric')  || entities.lines.some(l => classifyLayer(l.layer) === 'electric');
    const hasHeating   = layerNames.some(l => classifyLayer(l) === 'heating')   || entities.lines.some(l => classifyLayer(l.layer) === 'heating');
    const hasFurniture = entities.inserts.some(i => classifyLayer(i.layer) === 'furniture') ||
                         entities.inserts.some(i => /кров|диван|стол|мебел|furni/.test(i.blockName.toLowerCase()));

    // ── Wall material from text annotations ──
    const allText = entities.texts.map(t => t.text.toLowerCase()).join(' ');
    const hasBrick    = /кирпич|brick/.test(allText);
    const hasConcrete = /бетон|панель|concrete|panel/.test(allText);
    const hasWood     = /дерев|дерев|wood|timber/.test(allText);

    // ── Ceiling height from dimensions or texts ──
    let ceilingHeight = null;
    const heightDims = entities.dimensions.filter(d => {
      const m = d.measurement * scale;
      return m > 2 && m < 6;
    });
    if (heightDims.length) {
      ceilingHeight = heightDims.reduce((a, d) => a + d.measurement * scale, 0) / heightDims.length;
    }
    const heightMatch = allText.match(/выс[а-я]* потолк[а-я]*[:\s]+(\d[\d.,]+)/i) ||
                        allText.match(/h\s*=\s*(\d[\d.,]+)/i);
    if (!ceilingHeight && heightMatch) {
      let hv = parseFloat(heightMatch[1].replace(',', '.'));
      if (hv < 10) ceilingHeight = hv; // assume meters
    }

    // ── Open plan: few large rooms vs many small ──
    const isOpenPlan = closedPolygons.length <= 2 && totalArea > 40;

    // ── Plumbing point count ──
    const plumbingPoints = entities.lines.filter(l => classifyLayer(l.layer) === 'plumbing').length +
                           entities.inserts.filter(i => classifyLayer(i.layer) === 'plumbing').length;

    // ── Electric point count ──
    const electricPoints = entities.lines.filter(l => classifyLayer(l.layer) === 'electric').length +
                           entities.inserts.filter(i => classifyLayer(i.layer) === 'electric').length;

    return {
      totalArea: Math.max(totalArea, 0),
      widthM: Math.round(w * 10) / 10,
      heightM: Math.round(h * 10) / 10,
      aspectRatio: Math.round(aspectRatio * 100) / 100,
      totalWallLength: Math.round(totalWallLength),
      roomCount: estimatedRooms,
      largestRoom: Math.round(largestRoom * 10) / 10,
      windowCount,
      doorCount,
      ceilingHeight,
      hasBrick, hasConcrete, hasWood,
      hasPlumbing, hasElectric, hasHeating, hasFurniture,
      plumbingPoints, electricPoints,
      isOpenPlan,
      roomAreas,
      rawGeometry: { xMin, xMax, yMin, yMax, entities }
    };
  }

  function shoelaceArea(vertices) {
    let area = 0;
    const n = vertices.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += vertices[i].x * vertices[j].y;
      area -= vertices[j].x * vertices[i].y;
    }
    return area / 2;
  }

  /* ──────────────────────────────────────────────────────────
     SECTION 3 — STYLE SCORING ENGINE
  ─────────────────────────────────────────────────────────── */

  const STYLES = ['minimalism', 'scandinavian', 'modern', 'loft', 'neoclassic'];

  const STYLE_META = {
    minimalism:   { emoji: '⬜', label: 'Минимализм' },
    scandinavian: { emoji: '🌿', label: 'Скандинавский' },
    modern:       { emoji: '⚡', label: 'Современный' },
    loft:         { emoji: '🏭', label: 'Лофт' },
    neoclassic:   { emoji: '🏛️', label: 'Неоклассика' }
  };

  function scoreStyles(metrics, declaredRooms) {
    const scores = {};
    const reasons = {};
    STYLES.forEach(s => { scores[s] = 50; reasons[s] = []; }); // base score

    const area = metrics.totalArea;
    const ar   = metrics.aspectRatio;
    const ch   = metrics.ceilingHeight;
    const rooms = declaredRooms || metrics.roomCount || 2;

    // ── AREA rules ──────────────────────────────────────
    if (area > 0 && area < 38) {
      scores.minimalism   += 20; reasons.minimalism.push(`Небольшая площадь (${area.toFixed(0)} м²) — минимализм раскроет пространство`);
      scores.scandinavian += 15; reasons.scandinavian.push('Скандинавский стиль эффективен на компактных площадях');
      scores.loft         -= 15; reasons.loft.push(`Площадь меньше 40 м² нетипична для лофта`);
      scores.neoclassic   -= 20; reasons.neoclassic.push('Неоклассике нужна большая площадь для пропорций');
    } else if (area >= 38 && area < 60) {
      scores.scandinavian += 12; reasons.scandinavian.push(`Площадь ${area.toFixed(0)} м² — оптимум для скандинавского`);
      scores.modern       += 10; reasons.modern.push('Современный стиль хорошо работает на средней площади');
      scores.loft         += 8;
    } else if (area >= 60 && area < 90) {
      scores.loft         += 15; reasons.loft.push(`Площадь ${area.toFixed(0)} м² — подходит для открытого лофта`);
      scores.modern       += 12; reasons.modern.push('Просторно для современного интерьера');
      scores.neoclassic   += 8;
    } else if (area >= 90) {
      scores.neoclassic   += 22; reasons.neoclassic.push(`Большая площадь (${area.toFixed(0)} м²) — неоклассика раскроется полностью`);
      scores.loft         += 18; reasons.loft.push('Просторный лофт с открытой планировкой');
      scores.modern       += 10;
      scores.minimalism   -= 10;
    }

    // ── ASPECT RATIO rules ──────────────────────────────
    if (ar > 1.7) {
      scores.minimalism   += 12; reasons.minimalism.push('Вытянутая планировка — горизонтальные линии минимализма визуально расширят');
      scores.loft         += 8;  reasons.loft.push('Вытянутое пространство — характерно для лофта');
      scores.neoclassic   -= 8;  reasons.neoclassic.push('Неоклассика предпочитает квадратные пропорции');
    } else if (ar < 1.2) {
      scores.neoclassic   += 10; reasons.neoclassic.push('Квадратная планировка — идеальна для симметрии неоклассики');
      scores.scandinavian += 8;  reasons.scandinavian.push('Компактная квадратная форма — уютно по-скандинавски');
    }

    // ── CEILING HEIGHT rules ─────────────────────────────
    if (ch !== null) {
      if (ch > 3.2) {
        scores.loft         += 25; reasons.loft.push(`Высокие потолки ${ch.toFixed(1)} м — лофт получится аутентичным`);
        scores.neoclassic   += 15; reasons.neoclassic.push(`Высота ${ch.toFixed(1)} м позволит использовать лепнину и классические карнизы`);
        scores.modern       += 8;
      } else if (ch >= 2.8) {
        scores.scandinavian += 10; reasons.scandinavian.push(`Стандартная высота ${ch.toFixed(1)} м — подходит для скандинавского`);
        scores.modern       += 12; reasons.modern.push('Хорошая высота для современных интерьеров');
      } else {
        scores.minimalism   += 15; reasons.minimalism.push(`Невысокие потолки ${ch.toFixed(1)} м — минимализм создаст ощущение пространства`);
        scores.loft         -= 15; reasons.loft.push('Низкие потолки не подходят для лофта');
        scores.neoclassic   -= 12;
      }
    }

    // ── OPEN PLAN rules ──────────────────────────────────
    if (metrics.isOpenPlan) {
      scores.loft         += 20; reasons.loft.push('Открытая планировка — главный признак лофта');
      scores.modern       += 15; reasons.modern.push('Открытое пространство — тренд современного дизайна');
      scores.neoclassic   -= 10; reasons.neoclassic.push('Неоклассика предпочитает чёткое разделение комнат');
    }

    // ── WINDOWS rules ────────────────────────────────────
    if (metrics.windowCount > 0) {
      if (metrics.windowCount >= 6) {
        scores.scandinavian += 18; reasons.scandinavian.push(`${metrics.windowCount} оконных проёмов — скандинавский любит много света`);
        scores.modern       += 10;
      } else if (metrics.windowCount <= 2) {
        scores.loft         += 10; reasons.loft.push('Мало окон — характерно для промышленных помещений');
        scores.minimalism   += 8;  reasons.minimalism.push('Мало окон — зонирование светом в минималистичном духе');
      }
    }

    // ── MATERIAL (BRICK / CONCRETE) rules ───────────────
    if (metrics.hasBrick) {
      scores.loft         += 22; reasons.loft.push('Кирпичные стены — главный атрибут лофта');
      scores.modern       += 5;
      scores.neoclassic   -= 15;
      scores.scandinavian -= 8;
    }
    if (metrics.hasConcrete) {
      scores.loft         += 15; reasons.loft.push('Бетонные конструкции — органично впишутся в лофт');
      scores.modern       += 10; reasons.modern.push('Бетон — популярный материал современного интерьера');
    }
    if (metrics.hasWood) {
      scores.scandinavian += 18; reasons.scandinavian.push('Деревянные элементы — основа скандинавского стиля');
      scores.loft         += 8;
    }

    // ── ROOMS count rules ────────────────────────────────
    if (rooms === 1) {
      scores.minimalism   += 15; reasons.minimalism.push('Однушка — минимализм maximально функционален');
      scores.scandinavian += 12; reasons.scandinavian.push('Уютная студия в скандинавском духе');
      scores.neoclassic   -= 15;
    } else if (rooms === 2) {
      scores.scandinavian += 8;
      scores.modern       += 10;
    } else if (rooms >= 3) {
      scores.neoclassic   += 15; reasons.neoclassic.push(`${rooms}-комнатная квартира — неоклассике есть где развернуться`);
      scores.modern       += 10;
    }

    // ── ENGINEERING rules ────────────────────────────────
    if (metrics.electricPoints > 8) {
      scores.modern       += 8;  reasons.modern.push('Развитая электросеть — основа для умного дома');
      scores.loft         += 5;  reasons.loft.push('Много точек электрики — открытая проводка в стиле лофт');
    }
    if (metrics.plumbingPoints > 4) {
      scores.modern       += 5;
      scores.scandinavian += 5;  reasons.scandinavian.push('Развитая сантехника — возможность обустроить SPA-ванную');
    }

    // ── ROOM LARGEST size ────────────────────────────────
    if (metrics.largestRoom > 28) {
      scores.loft         += 12; reasons.loft.push(`Большая гостиная (≈${metrics.largestRoom.toFixed(0)} м²) — центральное лофт-пространство`);
      scores.neoclassic   += 10; reasons.neoclassic.push(`Просторный главный зал — для парадного неоклассического интерьера`);
    }

    // ── Normalize to 0–100 ───────────────────────────────
    STYLES.forEach(s => {
      scores[s] = Math.max(0, Math.min(100, Math.round(scores[s])));
    });

    // ── Sort by score ────────────────────────────────────
    const ranked = STYLES
      .map(s => ({ style: s, score: scores[s], reasons: reasons[s], ...STYLE_META[s] }))
      .sort((a, b) => b.score - a.score);

    // Ensure top score is at least 70 for clarity (normalize to relative scale)
    const maxScore = ranked[0].score;
    if (maxScore < 70) {
      const boost = 70 - maxScore;
      ranked.forEach((r, i) => {
        r.score = Math.min(100, r.score + boost * (1 - i * 0.15));
        r.score = Math.round(r.score);
      });
    }

    return ranked;
  }

  /* ──────────────────────────────────────────────────────────
     SECTION 4 — SVG BLUEPRINT RENDERER
  ─────────────────────────────────────────────────────────── */

  function renderBlueprint(metrics) {
    const geo = metrics.rawGeometry;
    const { xMin, xMax, yMin, yMax, entities } = geo;

    const SVG_W = 600, SVG_H = 200;
    const margin = 12;
    const drawW = SVG_W - margin * 2;
    const drawH = SVG_H - margin * 2;

    const rangeX = xMax - xMin || 1;
    const rangeY = yMax - yMin || 1;
    const scaleX = drawW / rangeX;
    const scaleY = drawH / rangeY;
    const scale  = Math.min(scaleX, scaleY);
    const offX   = margin + (drawW - rangeX * scale) / 2;
    const offY   = margin + (drawH - rangeY * scale) / 2;

    const tx = x => offX + (x - xMin) * scale;
    const ty = y => SVG_H - offY - (y - yMin) * scale;

    let lineSVG = '';
    let polySVG = '';

    entities.lines.forEach(l => {
      const cat = classifyLayer(l.layer);
      let stroke = '#334', sw = 0.8;
      if (cat === 'wall')     { stroke = '#00A86B'; sw = 1.5; }
      if (cat === 'window')   { stroke = '#40E0D0'; sw = 1; }
      if (cat === 'door')     { stroke = '#F5A623'; sw = 1; }
      if (cat === 'electric') { stroke = '#FFD700'; sw = 0.5; }
      if (cat === 'plumbing') { stroke = '#6495ED'; sw = 0.5; }
      lineSVG += `<line x1="${tx(l.x1).toFixed(1)}" y1="${ty(l.y1).toFixed(1)}" x2="${tx(l.x2).toFixed(1)}" y2="${ty(l.y2).toFixed(1)}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>`;
    });

    entities.polylines.forEach(p => {
      if (p.vertices.length < 2) return;
      const cat = classifyLayer(p.layer);
      let stroke = '#334', sw = 0.8, fill = 'none';
      if (cat === 'wall')     { stroke = '#00A86B'; sw = 2; }
      if (cat === 'window')   { stroke = '#40E0D0'; sw = 1; }
      if (cat === 'door')     { stroke = '#F5A623'; sw = 1; }
      if (p.closed && cat === 'wall') fill = 'rgba(0,168,107,0.04)';
      const pts = p.vertices.map(v => `${tx(v.x).toFixed(1)},${ty(v.y).toFixed(1)}`).join(' ');
      const close = p.closed ? ' Z' : '';
      polySVG += `<polygon points="${pts}" stroke="${stroke}" stroke-width="${sw}" fill="${fill}"${close ? '' : ' fill="none"'}/> `;
    });

    // Legend
    const legend = `
      <circle cx="10" cy="${SVG_H - 10}" r="3" fill="#00A86B"/>
      <text x="16" y="${SVG_H - 6}" font-size="7" fill="rgba(255,255,255,0.4)">Стены</text>
      <circle cx="60" cy="${SVG_H - 10}" r="3" fill="#40E0D0"/>
      <text x="66" y="${SVG_H - 6}" font-size="7" fill="rgba(255,255,255,0.4)">Окна</text>
      <circle cx="100" cy="${SVG_H - 10}" r="3" fill="#F5A623"/>
      <text x="106" y="${SVG_H - 6}" font-size="7" fill="rgba(255,255,255,0.4)">Двери</text>
    `;

    return `<svg viewBox="0 0 ${SVG_W} ${SVG_H}" xmlns="http://www.w3.org/2000/svg" class="blueprint-svg">
      <rect width="${SVG_W}" height="${SVG_H}" fill="transparent"/>
      <g>${polySVG}</g>
      <g>${lineSVG}</g>
      ${legend}
    </svg>`;
  }

  /* ──────────────────────────────────────────────────────────
     SECTION 5 — MANUAL INPUT SCORING (no file)
  ─────────────────────────────────────────────────────────── */

  function scoreFromManual(params) {
    const metrics = {
      totalArea: params.area,
      widthM: 0,
      heightM: 0,
      aspectRatio: params.aspectRatio || 1.4,
      largestRoom: params.area * 0.4,
      windowCount: params.windows,
      doorCount: 2,
      ceilingHeight: params.ceilingHeight,
      hasBrick: params.hasBrick,
      hasConcrete: params.hasConcrete,
      hasWood: params.hasWood,
      hasPlumbing: true,
      hasElectric: true,
      hasHeating: params.hasHeating,
      hasFurniture: false,
      plumbingPoints: params.bathrooms * 4,
      electricPoints: 8,
      isOpenPlan: params.isOpenPlan,
      roomAreas: [],
      rawGeometry: null
    };
    return scoreStyles(metrics, params.rooms);
  }

  /* ──────────────────────────────────────────────────────────
     PUBLIC API
  ─────────────────────────────────────────────────────────── */

  async function analyzeFile(file, declaredRooms) {
    const text = await file.text();
    const tokens = tokenize(text);
    const headerInfo = parseHeader(tokens);
    const layerNames = parseLayers(tokens);
    const entities = parseEntities(tokens);
    const metrics = extractMetrics(headerInfo, entities, layerNames);
    const ranked = scoreStyles(metrics, declaredRooms);
    const svgBlueprint = renderBlueprint(metrics);
    return { metrics, ranked, svgBlueprint };
  }

  function analyzeManual(params) {
    const ranked = scoreFromManual(params);
    return { metrics: { totalArea: params.area, ceilingHeight: params.ceilingHeight, windowCount: params.windows, roomCount: params.rooms }, ranked, svgBlueprint: null };
  }

  return { analyzeFile, analyzeManual, STYLE_META, STYLES };
})();
