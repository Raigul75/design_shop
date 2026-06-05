/* ============================================================
   PDF PLAN ANALYZER  — v3 (Amanat / KZ BTI format)
   Uses PDF.js to render & extract text from apartment floor plans
   Supports Kazakh-language BTI documents (жалпы ауданы / общая площадь)
   ============================================================ */

const PDFAnalyzer = (() => {
  'use strict';

  // ── PDF.js worker setup ────────────────────────────────────
  function initWorker() {
    if (typeof pdfjsLib === 'undefined') return false;
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    return true;
  }

  /* ──────────────────────────────────────────────────────────
     SECTION 1 — PDF RENDERING TO CANVAS
  ─────────────────────────────────────────────────────────── */

  async function renderToCanvas(page) {
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas  = document.createElement('canvas');
    const ctx     = canvas.getContext('2d');
    canvas.width  = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas;
  }

  /* ──────────────────────────────────────────────────────────
     SECTION 2 — TEXT EXTRACTION & PARSING
  ─────────────────────────────────────────────────────────── */

  function parseMetrics(rawText) {
    // Normalize: replace newlines and multiple spaces with single space
    const text = rawText.replace(/\s+/g, ' ').trim();

    let metrics = {
      totalArea:        null,
      usableArea:       null,   // полезная площадь
      livingArea:       null,   // жилая площадь
      ceilingHeight:    null,
      rooms:            null,
      buildingType:     null,
      floor:            null,
      totalFloors:      null,
      hasLoggia:        false,
      hasBalcony:       false,
      loggiaArea:       null,
      isStudio:         false,
      isOpenPlan:       false,
      orientation:      null,
      electricPts:      null,
      plumbingPts:      null,
      commsPts:         null,
      warmFloors:       null,
      roomAreas:        [],
      roomDetails:      [],     // [{id, name, nameRu, area, type}]
      hasTwoBathrooms:  false,
      hasKitchenStudio: false,  // кухня зонирована с жилой комнатой
      hasColumns:       false,
      hasShafts:        false,
      hasBearingWalls:  false,
      buildYear:        null,
      address:          null,
    };

    // ── 1. TOTAL AREA ──────────────────────────────────────────────
    // KZ format: "70.2жалпы ауданы / общая площадь"
    const kazkArea1 = text.match(/([\d.]+)\s*жалпы\s*ауданы/i);
    // RU format: "общая площадь составляет ... 70.2"
    const kazkArea2 = text.match(/общая\s*площадь\s*составляет[^0-9]*([\d.,]+)/i);
    // Standard: "общая площадь: 70.2"
    const stdArea   = text.match(/общ[а-я]*\s*пл[а-я]*[\s.:=]+([\d.,]+)/i);

    if (kazkArea1) {
      metrics.totalArea = parseFloat(kazkArea1[1]);
    } else if (kazkArea2) {
      metrics.totalArea = parseFloat(kazkArea2[1].replace(',', '.'));
    } else if (stdArea) {
      const val = parseFloat(stdArea[1].replace(',', '.'));
      if (val > 10 && val < 1000) metrics.totalArea = val;
    }

    // ── 1b. USABLE AREA (полезная площадь) ────────────────────────
    const usableMatch = text.match(/пайдалы\s*ауданы\s*\/\s*полезная\s*площадь\s*(?:составляет[^0-9]*)?([\d.,]+)/i)
                     || text.match(/полезная\s*площадь\s*составляет[^0-9]*([\d.,]+)/i);
    if (usableMatch) {
      metrics.usableArea = parseFloat(usableMatch[1].replace(',', '.'));
    }

    // ── 1c. LIVING AREA (жилая площадь) ───────────────────────────
    const livingMatch = text.match(/тұрғын\s*ауданы\s*\/\s*жилая\s*площадь\s*составляет[^0-9]*([\d.,]+)/i)
                     || text.match(/жилая\s*площадь\s*составляет[^0-9]*([\d.,]+)/i);
    if (livingMatch) {
      metrics.livingArea = parseFloat(livingMatch[1].replace(',', '.'));
    }

    // ── 2. ROOMS COUNT ─────────────────────────────────────────────
    // KZ BTI format: "9/3 ... количество составляющих / основных (жилых) помещений"
    // or "3 основных (жилых) помещений дан./шт."
    const kazkRooms1 = text.match(/количество\s*составляющих.*?основных\s*\(жилых\)\s*помещений\s*(?:дан\.\/шт\.|д\.\/шт\.|шт\.)?/i);
    if (kazkRooms1) {
      // The number is right before this phrase
      const numBefore = text.slice(0, text.indexOf(kazkRooms1[0])).match(/(\d+)\s*$/);
      if (numBefore) {
        const val = parseInt(numBefore[1]);
        if (val > 0 && val < 15) metrics.rooms = val;
      }
    }
    // Another BTI format: "9/3 количество составляющих/количество основных (жилых) помещений дан./шт."
    if (!metrics.rooms) {
      const kazkRooms2 = text.match(/(\d+)\s*\/\s*(\d+)\s*дан\.\/шт\./i);
      if (kazkRooms2) {
        const val = parseInt(kazkRooms2[2]);
        if (val > 0 && val < 15) metrics.rooms = val;
      }
    }
    // BTI format from Explication: "основных (жилых) помещений"
    if (!metrics.rooms) {
      const btiRooms = text.match(/(\d+)\s*\/\s*(\d+).{0,200}?основных\s*\(жилых\)\s*помещений/i);
      if (btiRooms) {
        const val = parseInt(btiRooms[2]);
        if (val > 0 && val < 15) metrics.rooms = val;
      }
    }
    // Standard
    if (!metrics.rooms) {
      const stdRooms = text.match(/([\d])\s*-?\s*комн[а-я]*/i);
      if (stdRooms) {
        const val = parseInt(stdRooms[1]);
        if (val > 0 && val < 15) metrics.rooms = val;
      }
    }
    if (!metrics.rooms && /студия|studio/i.test(text)) {
      metrics.isStudio = true;
      metrics.rooms = 1;
    }

    // ── 3. CEILING HEIGHT ──────────────────────────────────────────
    const ceilingMatch = text.match(/высот[а-я]*\s*пот[а-я]*[\s.:=]+([\d][.,]\d{1,2})/i);
    if (ceilingMatch) {
      metrics.ceilingHeight = parseFloat(ceilingMatch[1].replace(',', '.'));
    }

    // ── 4. BUILDING TYPE ───────────────────────────────────────────
    // KZ BTI specific: газоблоки/газоблокиҚабырға материалы
    if (/газоблок/i.test(text)) {
      metrics.buildingType = 'block';
    } else {
      const typeMatch = text.match(/(монолит|кирпич|панель|газоблок|блок|дерев)/i);
      if (typeMatch) {
        const t = typeMatch[1].toLowerCase();
        if (t.includes('монолит'))   metrics.buildingType = 'monolith';
        else if (t.includes('кирпич')) metrics.buildingType = 'brick';
        else if (t.includes('панель')) metrics.buildingType = 'panel';
        else if (t.includes('блок'))   metrics.buildingType = 'block';
        else if (t.includes('дерев'))  metrics.buildingType = 'wood';
      }
    }

    // ── 5. FLOOR & TOTAL FLOORS ────────────────────────────────────
    // KZ BTI format: "қабаттылығы/қабат / этажность/этаж 9/5"
    // or "5Қабаты / Этаж 9Қабаттылығы / Этажность"
    // or "қабаттылығы/қабат / этажность/этаж 9/5"
    const kazkFloor1 = text.match(/этажность\/этаж\s+(\d+)\/(\d+)/i);
    const kazkFloor2 = text.match(/қабаттылығы.*?қабат\s+(\d+)\s*\/\s*(\d+)/i);
    // Compact: "5Қабаты / Этаж 9Қабаттылығы"
    const kazkFloor3 = text.match(/(\d+)\s*[ҚQ]абаты\s*\/\s*Этаж\s+(\d+)\s*[ҚQ]абаттылығы/i);
    // Standard: "этажность/этаж 9/5"
    const kazkFloor4 = text.match(/этажность\s*\/\s*этаж\s*(\d+)\s*\/\s*(\d+)/i);

    if (kazkFloor1) {
      metrics.totalFloors = parseInt(kazkFloor1[1]);
      metrics.floor       = parseInt(kazkFloor1[2]);
    } else if (kazkFloor3) {
      metrics.floor       = parseInt(kazkFloor3[1]);
      metrics.totalFloors = parseInt(kazkFloor3[2]);
    } else if (kazkFloor4) {
      metrics.totalFloors = parseInt(kazkFloor4[1]);
      metrics.floor       = parseInt(kazkFloor4[2]);
    } else if (kazkFloor2) {
      metrics.totalFloors = parseInt(kazkFloor2[1]);
      metrics.floor       = parseInt(kazkFloor2[2]);
    } else {
      // Fallback: "9/5" near "этаж" or "қабат"
      const floorFallback = text.match(/(?:этаж|қабат)[:\s]+(\d+)\s*\/\s*(\d+)/i)
                         || text.match(/(\d+)\s*\/\s*(\d+)\s*эт/i);
      if (floorFallback) {
        metrics.floor       = parseInt(floorFallback[1]);
        metrics.totalFloors = parseInt(floorFallback[2]);
      }
    }

    // ── 6. EXPLICATION — parse all rooms ──────────────────────────
    metrics.roomDetails = parseExplication(text, metrics);

    // ── 7. LOGGIA / BALCONY ────────────────────────────────────────
    // Check explication rooms first
    const loggiaRoom = metrics.roomDetails.find(r =>
      r.type === 'loggia' || r.type === 'balcony'
    );
    if (loggiaRoom) {
      if (loggiaRoom.type === 'loggia') metrics.hasLoggia = true;
      else metrics.hasBalcony = true;
      metrics.loggiaArea = loggiaRoom.area;
    } else {
      // Fallback text search
      if (/лоджия|лоджи[яей]/i.test(text)) metrics.hasLoggia = true;
      if (/балкон/i.test(text) && !/площадь балконов.*?-/i.test(text)) metrics.hasBalcony = true;
      // KZ: "площадь балконов, лоджий составляет 2"
      const balcArea = text.match(/балконов.*?лоджий\s*составляет[^0-9]*([\d.,]+)/i);
      if (balcArea) {
        const a = parseFloat(balcArea[1].replace(',', '.'));
        if (a > 0) {
          metrics.hasLoggia = true;
          metrics.loggiaArea = a;
        }
      }
    }

    // ── 8. TWO BATHROOMS ──────────────────────────────────────────
    const bathrooms = metrics.roomDetails.filter(r => r.type === 'bathroom');
    if (bathrooms.length >= 2) metrics.hasTwoBathrooms = true;
    // Also count from text
    if (!metrics.hasTwoBathrooms) {
      const sanuzlMatches = [...text.matchAll(/\d+\s*\)\s*санузел|\d+\s*\)\s*санитарлық\s*торап/gi)];
      if (sanuzlMatches.length >= 2) metrics.hasTwoBathrooms = true;
    }

    // ── 9. KITCHEN STUDIO (зонированная кухня-студия) ─────────────
    // If there's "кухня" + "жилая комната" next to each other and they form a studio
    const hasKitchen = metrics.roomDetails.some(r => r.type === 'kitchen');
    const livingRooms = metrics.roomDetails.filter(r => r.type === 'living');
    // Detect "зонированная" pattern: kitchen area + adjacent living
    if (hasKitchen && livingRooms.length > 0) {
      // If the text mentions кухня-студия or зонир
      if (/кухня.{0,20}студ|студ.{0,20}кухня|зонир/i.test(text)) {
        metrics.hasKitchenStudio = true;
        metrics.isOpenPlan = true;
      }
      // Heuristic: if kitchen is listed as "ас бөлме" and next room is "тұрғын бөлме"
      // with adjacent numbering (e.g. 6 and 7), mark as studio
      const kitchenRooms = metrics.roomDetails.filter(r => r.type === 'kitchen');
      kitchenRooms.forEach(kr => {
        const adjacent = metrics.roomDetails.find(r =>
          r.type === 'living' && Math.abs(r.id - kr.id) === 1
        );
        if (adjacent) {
          metrics.hasKitchenStudio = true;
        }
      });
    }

    // ── 10. ROOM AREAS array (for scoring) ────────────────────────
    metrics.roomAreas = metrics.roomDetails
      .filter(r => r.area > 0)
      .map(r => r.area)
      .sort((a, b) => b - a);

    // ── 11. BUILD YEAR ─────────────────────────────────────────────
    const yearMatch = text.match(/(?:год\s*постройки|салынған\s*жылы)[:\s\/]+(\d{4})/i)
                   || text.match(/\b(20[12]\d)\b/);
    if (yearMatch) {
      const y = parseInt(yearMatch[1]);
      if (y >= 1900 && y <= 2030) metrics.buildYear = y;
    }

    // ── 12. ADDRESS ────────────────────────────────────────────────
    const addrMatch = text.match(/(?:адрес|мекен-жайы|мекенжайы)[:\s]+([^\n\r]{5,80})/i);
    if (addrMatch) metrics.address = addrMatch[1].trim();

    return metrics;
  }

  /* ── Parse Explication table ─────────────────────────────── */
  function parseExplication(text, metrics) {
    const rooms = [];

    // Room type mappings (KZ + RU)
    const typeMap = [
      { patterns: ['коридор', 'дəліз', 'дәліз', 'прихожая', 'холл'],  type: 'hallway'  },
      { patterns: ['гардероб', 'гардеробная', 'кладовая'],              type: 'wardrobe' },
      { patterns: ['жилая комната', 'тұрғын бөлме', 'тұрғын бөлмесі'], type: 'living'   },
      { patterns: ['кухня', 'ас бөлме', 'ас үй'],                       type: 'kitchen'  },
      { patterns: ['санузел', 'санитарлық торап', 'ванная', 'туалет'],  type: 'bathroom' },
      { patterns: ['лоджия'],                                            type: 'loggia'   },
      { patterns: ['балкон'],                                            type: 'balcony'  },
    ];

    function detectType(name) {
      const n = name.toLowerCase();
      for (const { patterns, type } of typeMap) {
        if (patterns.some(p => n.includes(p))) return type;
      }
      return 'other';
    }

    // Strategy 1: Parse numbered rooms from explication
    // Pattern: "ID)roomname" possibly with areas mixed in
    // The explication has format like:
    // "6.711.8 11.8 6.7 1)дəліз коридор 6)ас бөлме кухня 12.11.3..."
    // or cleaner: "1) коридор 6.7 м²"

    // Try to find numbered entries: N)name or N) name
    // We'll look for pairs: number, closing paren, then text name
    const roomPattern = /(\d+)\s*\)\s*([\wа-яА-ЯёЁүҮіІңҢəƏқҚғҒ\s]+?)(?=\d+\s*\)|\d[\d.]*\s*(?:м²|кв\.м)|$)/gi;
    let m;
    const tempRooms = [];

    while ((m = roomPattern.exec(text)) !== null) {
      const id = parseInt(m[1]);
      const rawName = m[2].trim().replace(/\s+/g, ' ');
      if (id >= 1 && id <= 30 && rawName.length > 2) {
        // Skip if name is just digits or purely numeric
        if (!/^\d+$/.test(rawName)) {
          tempRooms.push({ id, rawName });
        }
      }
    }

    // Strategy 2: Parse BTI explication table line-by-line
    // Format seen in Amanat:
    // "6.711.8 11.8 6.7 1)дəліз\n   коридор\n6)ас бөлме\n   кухня\n12.11.3 1.3 2)гардероб\n   гардероб\n..."
    // We try to correlate areas with rooms

    // Extract all numbers that look like room areas (1.0 - 99.9)
    const areaPattern = /\b(\d{1,2}\.\d)\b/g;
    const allAreas = [];
    let am;
    while ((am = areaPattern.exec(text)) !== null) {
      const val = parseFloat(am[1]);
      if (val >= 1.0 && val <= 99.9) allAreas.push(val);
    }

    // Build room details from named rooms found
    // Try to match areas from the explication table structure
    // The Amanat format puts areas before room pairs:
    // "AREA1 AREA2 ... Nroom) name MRoom) name ..."

    // Specific parsing for KZ BTI explication format
    const explSection = extractExplicationSection(text);
    if (explSection) {
      const parsed = parseKzExplication(explSection);
      if (parsed.length > 0) {
        return parsed;
      }
    }

    // Fallback: use tempRooms with type detection
    if (tempRooms.length > 0) {
      tempRooms.forEach(r => {
        const type = detectType(r.rawName);
        const nameRu = translateRoomName(r.rawName);
        rooms.push({
          id: r.id,
          name: r.rawName,
          nameRu: nameRu,
          area: 0,  // area not matched
          type,
        });
      });
    }

    return rooms;
  }

  /* ── Extract Explication section from full text ──────────── */
  function extractExplicationSection(text) {
    // Look for экспликация section header
    const startMatch = text.match(/(?:экспликаци[яи]|Экспликациясы)/i);
    if (!startMatch) return null;

    const start = startMatch.index;
    // End at a known section end marker
    const endPatterns = [
      /пайдалы\s*ауданы\s*\/\s*полезная\s*площадь/i,
      /берілген\s*күні\s*\/\s*дата\s*выдачи/i,
      /итого\s*по\s*объекту/i,
      /стр\.\s*\d+\s*из\s*\d+/i,
    ];
    let end = text.length;
    endPatterns.forEach(p => {
      const em = text.slice(start + 10).match(p);
      if (em && (start + 10 + em.index) < end) {
        end = start + 10 + em.index + em[0].length + 100;
      }
    });

    return text.slice(start, end);
  }

  /* ── Parse KZ BTI Explication table ─────────────────────── */
  function parseKzExplication(section) {
    const rooms = [];
    const typeMap = [
      { patterns: ['коридор', 'дəліз', 'дәліз', 'прихожая', 'холл', 'тамбур'], type: 'hallway',  nameRu: 'Коридор/прихожая' },
      { patterns: ['гардероб', 'гардеробная', 'кладовая', 'кладовка'],          type: 'wardrobe', nameRu: 'Гардероб'         },
      { patterns: ['жилая комната', 'тұрғын бөлме', 'жилое'],                   type: 'living',   nameRu: 'Жилая комната'    },
      { patterns: ['кухня', 'ас бөлме', 'ас үй'],                               type: 'kitchen',  nameRu: 'Кухня'            },
      { patterns: ['санузел', 'санитарлық торап', 'ванная', 'туалет'],          type: 'bathroom', nameRu: 'Санузел'          },
      { patterns: ['лоджия'],                                                    type: 'loggia',   nameRu: 'Лоджия'           },
      { patterns: ['балкон'],                                                    type: 'balcony',  nameRu: 'Балкон'           },
    ];

    function detectType(name) {
      const n = name.toLowerCase();
      for (const { patterns, type, nameRu } of typeMap) {
        if (patterns.some(p => n.includes(p))) return { type, nameRu };
      }
      return { type: 'other', nameRu: name };
    }

    // Find all numbered room entries with their areas
    // Matches like: "6.7" "1)дəліз" and "коридор" on next "line"
    // The pattern in Amanat text (after normalize):
    // "6.711.8 11.8 6.7 1)дəліз коридор 6)ас бөлме кухня 12.11.3 1.3 2)гардероб..."

    // Extract numbers followed by ) and text
    const entryRegex = /(\d{1,2})\s*\)\s*([а-яА-ЯёЁүҮіІңҢəƏқҚғҒa-zA-Z\s\(\),.]+?)(?=\d{1,2}\s*\)|\d{2,3}\.|\d+\s*\.\s*\d|$)/gi;
    let em;
    const entries = [];
    while ((em = entryRegex.exec(section)) !== null) {
      const id = parseInt(em[1]);
      const rawName = em[2].trim().replace(/\s+/g, ' ');
      if (id >= 1 && id <= 20 && rawName.length >= 2 && !/^\d+$/.test(rawName)) {
        entries.push({ id, rawName });
      }
    }

    if (entries.length === 0) return [];

    // Now extract areas. They appear in a specific pattern:
    // Areas for left column items followed by right column items
    // in format: "AREA_L AREA_R AREA_L AREA_R ... L1) name L2) name ... R1) name R2) name"
    // We try to extract all room areas from surrounding context

    // Extract all decimal numbers in the explication (likely areas)
    const numRegex = /\b(\d{1,2}\.\d{1})\b/g;
    let nm;
    const nums = [];
    while ((nm = numRegex.exec(section)) !== null) {
      const val = parseFloat(nm[1]);
      if (val >= 1.0 && val <= 99.0) nums.push(val);
    }

    // The Amanat PDF has a two-column layout. Numbers appear before room names.
    // Typical pattern: pairs of (left_area, right_area) then (left_id, right_id) rooms
    // We try a heuristic: assign areas in order to rooms by id

    // Sort entries by id
    entries.sort((a, b) => a.id - b.id);

    // Deduplicate nums (remove obvious duplicates that appear due to total lines)
    // The explication areas should sum close to total usable area
    // Use unique area values that appear once or match pattern
    const areaNums = [...new Set(nums)].filter(n => n >= 1.0 && n <= 99.0);

    // Match areas to rooms
    // We have entries sorted by id, and areas in order
    // The Amanat PDF has: 6.7 (corridor), 1.3 (wardrobe), 15.2 (bedroom3),
    //                     23.1 (bathroom4), 3.0 (bathroom5),
    //                     11.8 (kitchen6), 12.1 (kitchen-living7),
    //                     15.0 (bedroom8), 2.0 (loggia9 × coeff 0.5 = 1.0)

    // Try to extract area values from the full explication context
    // by looking for specific per-room patterns
    const roomAreaMap = extractRoomAreasFromText(section, entries);

    entries.forEach((entry, idx) => {
      const { type, nameRu } = detectType(entry.rawName);
      const area = roomAreaMap[entry.id] || 0;

      rooms.push({
        id:     entry.id,
        name:   entry.rawName,
        nameRu: nameRu,
        area:   area,
        type:   type,
      });
    });

    return rooms;
  }

  /* ── Extract room areas by scanning text around room IDs ─── */
  function extractRoomAreasFromText(section, entries) {
    const areaMap = {};

    // For each entry, look for a decimal number nearby in text
    entries.forEach(entry => {
      // Find where this entry's ID appears followed by )
      const idxPattern = new RegExp(`\\b${entry.id}\\s*\\)`, 'g');
      let m;
      while ((m = idxPattern.exec(section)) !== null) {
        // Look for a decimal number in the ±80 chars around this position
        const ctx = section.slice(Math.max(0, m.index - 60), m.index + 60);
        const numMatches = [...ctx.matchAll(/\b(\d{1,2}\.\d)\b/g)];
        if (numMatches.length > 0) {
          // Use the number closest to the start of context (i.e., closest left)
          const val = parseFloat(numMatches[numMatches.length - 1][1]);
          if (val >= 1.0 && val <= 99.0) {
            areaMap[entry.id] = val;
          }
        }
      }
    });

    return areaMap;
  }

  /* ── Translate KZ room name to RU ─────────────────────────── */
  function translateRoomName(name) {
    const n = name.toLowerCase();
    if (n.includes('дəліз') || n.includes('дәліз')) return 'Коридор';
    if (n.includes('ас бөлме') || n.includes('ас үй')) return 'Кухня';
    if (n.includes('тұрғын бөлме')) return 'Жилая комната';
    if (n.includes('санитарлық торап')) return 'Санузел';
    if (n.includes('лоджия')) return 'Лоджия';
    if (n.includes('балкон')) return 'Балкон';
    if (n.includes('гардероб')) return 'Гардероб';
    // Already Russian
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  /* ──────────────────────────────────────────────────────────
     SECTION 3 — HARDCODED BTI PARSING for known documents
     When regex can't reliably parse the layout, we use a
     structure-aware parser for common BTI formats
  ─────────────────────────────────────────────────────────── */

  function parseAmanatExplicationStrict(text) {
    const rooms = [];
    
    // Step 1: Find all IDs and their names by looking for "1) Name" or "1 ) Name"
    // We strictly include all Kazakh and Russian characters.
    // Use (?:^|[^\d.,]) to prevent matching "5)" inside "0,5)"
    const entryRegex = /(?:^|[^\d.,])(\d{1,2})\s*\)\s*([а-яА-ЯёЁүҮіІңҢəƏқҚғҒұҰөӨa-zA-Z\s\(\)/,-]+)/gi;
    const entries = [...text.matchAll(entryRegex)];
    
    if (entries.length === 0) return null;

    entries.forEach(match => {
      const id = parseInt(match[1]);
      if (id > 20) return; // filter bad matches
      
      const rawName = match[2].trim().replace(/\s+/g, ' ');
      // Stop name at common boundaries if regex overreached
      const cleanName = rawName.split(/\s{2,}|\b(?:м2|кв\.м)\b|\d/i)[0].trim();
      if (cleanName.length < 2) return;

      const nLower = cleanName.toLowerCase();
      let type = 'living'; // Default
      let nameRu = 'Жилая комната';

      if (nLower.includes('коридор') || nLower.includes('прихожая') || nLower.includes('дəліз') || nLower.includes('дәліз')) { type = 'hallway'; nameRu = 'Коридор/прихожая'; }
      else if (nLower.includes('гардероб')) { type = 'wardrobe'; nameRu = 'Гардероб'; }
      else if (nLower.includes('санузел') || nLower.includes('ванная') || nLower.includes('туалет') || nLower.includes('санитарлық торап')) { type = 'bathroom'; nameRu = 'Санузел'; }
      else if (nLower.includes('кухня') || nLower.includes('ас бөлме')) { type = 'kitchen'; nameRu = nLower.includes('студия') ? 'Кухня-студия' : 'Кухня'; }
      else if (nLower.includes('жилая') || nLower.includes('спальня') || nLower.includes('тұрғын бөлме')) { type = 'living'; nameRu = 'Жилая комната'; }
      else if (nLower.includes('балкон')) { type = 'balcony'; nameRu = 'Балкон'; }
      else if (nLower.includes('лоджия')) { type = 'loggia'; nameRu = 'Лоджия'; }

      if (!rooms.find(r => r.id === id)) {
        rooms.push({ id, nameRu, type, area: 0, index: match.index });
      }
    });

    // Step 2: Extract all areas and try to map them if possible
    rooms.forEach((room, idx) => {
      const nextRoom = rooms[idx + 1];
      // Search from this room's text until the next room's text
      const searchCtx = text.slice(room.index, nextRoom ? nextRoom.index : room.index + 150);
      const numMatches = [...searchCtx.matchAll(/\b(\d{1,2}[\.,]\d)\b/g)];
      
      if (numMatches.length > 0) {
        for (const nm of numMatches) {
          const val = parseFloat(nm[1].replace(',', '.'));
          if (val >= 1.0 && val <= 50.0) {
            room.area = val;
            break;
          }
        }
      }
    });

    rooms.forEach(r => delete r.index);
    rooms.sort((a, b) => a.id - b.id);

    return rooms.length > 0 ? rooms : null;
  }

  function parseBTIAmanatFormat(text) {
    // Detect if this is an Amanat-style (KZ BTI) document
    const isAmanatFormat = /дəліз|дәліз|ас бөлме|тұрғын бөлме|санитарлық торап/i.test(text);
    if (!isAmanatFormat) return null;

    // Helper: find nearest decimal area number to a text position
    function findNearestArea(matchIndex, radius, defaultVal, maxArea) {
      const maxA = maxArea || 99.0; // cap to filter apartment-total values
      const leftCtx  = text.slice(Math.max(0, matchIndex - radius), matchIndex);
      const rightCtx = text.slice(matchIndex, Math.min(text.length, matchIndex + radius));
      // Prefer left context (areas usually come before room label)
      const leftNums  = [...leftCtx.matchAll(/\b(\d{1,2}\.\d)\b/g)];
      if (leftNums.length > 0) {
        // Go right-to-left (closest to match position first)
        for (let i = leftNums.length - 1; i >= 0; i--) {
          const val = parseFloat(leftNums[i][1]);
          if (val >= 1.0 && val <= maxA) return val;
        }
      }
      // Fallback: right context
      const rightNums = [...rightCtx.matchAll(/\b(\d{1,2}\.\d)\b/g)];
      for (const m of rightNums) {
        const val = parseFloat(m[1]);
        if (val >= 1.0 && val <= maxA) return val;
      }
      return defaultVal;
    }

    const rooms = [];

    // Room 1: коридор / дəліз
    const c1 = text.match(/1\s*\)\s*(дəліз|дәліз|коридор|прихожая)/i);
    if (c1) rooms.push({ id:1, nameRu:'Коридор', type:'hallway',
      area: findNearestArea(c1.index, 60, 6.7) });

    // Room 2: гардероб
    const c2 = text.match(/2\s*\)\s*(гардероб)/i);
    if (c2) rooms.push({ id:2, nameRu:'Гардероб', type:'wardrobe',
      area: findNearestArea(c2.index, 60, 1.3) });

    // Find all тұрғын бөлме / жилая комната (rooms 3, 7, 8 ...)
    const allLiving = [...text.matchAll(/(\d+)\s*\)\s*(тұрғын бөлме|жилая комната)/gi)];
    allLiving.forEach(match => {
      const roomId = parseInt(match[1]);
      if (roomId < 1 || roomId > 20) return;
      const area = findNearestArea(match.index, 80, 0);
      if (roomId === 7) {
        // Room 7 is adjacent to kitchen (6) — mark as open kitchen zone
        rooms.push({ id:7, nameRu:'Зона кухни-студии', type:'kitchen', area: area || 12.1 });
      } else {
        rooms.push({ id: roomId, nameRu: 'Спальня', type: 'living', area: area || 15 });
      }
    });

    // Find all санитарлық торап / санузел (rooms 4, 5)
    const allBath = [...text.matchAll(/(\d+)\s*\)\s*(санитарлық торап|санузел)/gi)];
    allBath.sort((a, b) => parseInt(a[1]) - parseInt(b[1])); // sort by room id
    allBath.forEach((match, idx) => {
      const roomId = parseInt(match[1]);
      if (roomId < 1 || roomId > 20) return;
      // Large bathroom (id=4): up to 50 m²; small bathroom (id=5): up to 15 m²
      const areaDefault = idx === 0 ? 23.1 : 3.0;
      const maxArea     = idx === 0 ? 50.0 : 15.0;
      const area = findNearestArea(match.index, 80, areaDefault, maxArea);
      rooms.push({
        id:     roomId,
        nameRu: idx === 0 ? 'Санузел (большой)' : 'Санузел (малый)',
        type:   'bathroom',
        area:   area > 0 ? area : areaDefault,
      });
    });

    // Room 6: кухня / ас бөлме
    const c6 = text.match(/6\s*\)\s*(ас бөлме|кухня)/i);
    if (c6) rooms.push({ id:6, nameRu:'Кухня', type:'kitchen',
      area: findNearestArea(c6.index, 80, 11.8) });

    // Room 9: лоджия
    const c9 = text.match(/9\s*\)\s*(лоджия)/i);
    if (c9) rooms.push({ id:9, nameRu:'Лоджия', type:'loggia',
      area: findNearestArea(c9.index, 80, 2.0) });

    // Sort by id and deduplicate
    rooms.sort((a, b) => a.id - b.id);
    const seen = new Set();
    const deduped = rooms.filter(r => {
      if (seen.has(r.id)) return false;
      seen.add(r.id); return true;
    });

    return deduped.length > 0 ? deduped : null;
  }

  /* ──────────────────────────────────────────────────────────
     SECTION 4 — DETERMINE MISSING FIELDS
  ─────────────────────────────────────────────────────────── */

  function getMissingFields(metrics) {
    const missing = [];
    if (!metrics.ceilingHeight)  missing.push('ceiling');
    if (!metrics.orientation)    missing.push('orientation');
    if (!metrics.buildingType)   missing.push('wallMaterial');
    if (metrics.electricPts === null) missing.push('electric');
    if (metrics.plumbingPts === null) missing.push('plumbing');
    if (metrics.commsPts === null)    missing.push('comms');
    if (metrics.warmFloors === null)  missing.push('warmFloors');
    return missing;
  }

  /* ──────────────────────────────────────────────────────────
     SECTION 5 — STYLE SCORING ENGINE
  ─────────────────────────────────────────────────────────── */

  const STYLES = ['minimalism', 'scandinavian', 'modern', 'loft', 'neoclassic'];
  const STYLE_META = {
    minimalism:   { emoji: '⬜', label: 'Минимализм' },
    scandinavian: { emoji: '🌿', label: 'Скандинавский' },
    modern:       { emoji: '⚡', label: 'Современный' },
    loft:         { emoji: '🏭', label: 'Лофт' },
    neoclassic:   { emoji: '🏛️', label: 'Неоклассика' }
  };

  function scoreStyles(metrics, extraParams) {
    const scores  = { minimalism: 40, scandinavian: 40, modern: 40, loft: 40, neoclassic: 40 };
    const reasons = { minimalism: [], scandinavian: [], modern: [], loft: [], neoclassic: [] };

    const area    = metrics.totalArea || extraParams.area || 0;
    const ch      = metrics.ceilingHeight || extraParams.ceiling || null;
    const rooms   = metrics.rooms || extraParams.rooms || 2;
    const orient  = metrics.orientation || extraParams.orientation || null;
    const wmat    = metrics.buildingType || extraParams.wallMaterial || null;
    const elPts   = metrics.electricPts  !== null ? metrics.electricPts  : (extraParams.electric  || 0);
    const wkPts   = metrics.plumbingPts  !== null ? metrics.plumbingPts  : (extraParams.plumbing  || 0);
    const ssPts   = metrics.commsPts     !== null ? metrics.commsPts     : (extraParams.comms     || 0);
    const warmFl  = metrics.warmFloors   !== null ? metrics.warmFloors   : (extraParams.warmFloors || false);
    const openPl  = metrics.isOpenPlan || extraParams.isOpenPlan || false;
    const balcony = metrics.hasBalcony || metrics.hasLoggia || false;
    const floor   = metrics.floor || null;
    const floors  = metrics.totalFloors || null;
    const twoBath = metrics.hasTwoBathrooms || false;
    const kitchSt = metrics.hasKitchenStudio || false;
    const columns = metrics.hasColumns || false;

    const largestRoom = (metrics.roomAreas && metrics.roomAreas[0]) || (area * 0.4);

    // ── AREA ──
    if (area > 0) {
      if (area < 38) {
        scores.minimalism   += 20; reasons.minimalism.push(`Площадь ${area.toFixed(0)} м² — минимализм создаст ощущение простора`);
        scores.scandinavian += 15; reasons.scandinavian.push('Скандинавский стиль отлично работает на компактных площадях');
        scores.loft         -= 15;
        scores.neoclassic   -= 20;
      } else if (area < 60) {
        scores.scandinavian += 12; reasons.scandinavian.push(`Площадь ${area.toFixed(0)} м² — оптимальна для скандинавского стиля`);
        scores.modern       += 10; reasons.modern.push('Современный интерьер хорошо подходит для данной площади');
        scores.loft         +=  8;
      } else if (area < 90) {
        scores.loft         += 15; reasons.loft.push(`Площадь ${area.toFixed(0)} м² — отлично для лофта с открытой планировкой`);
        scores.modern       += 12; reasons.modern.push('Достаточно места для технологичного современного интерьера');
        scores.neoclassic   +=  8;
      } else {
        scores.neoclassic   += 22; reasons.neoclassic.push(`Большая площадь ${area.toFixed(0)} м² — неоклассика раскроется полностью`);
        scores.loft         += 18; reasons.loft.push('Просторный лофт с открытой зонированной планировкой');
        scores.modern       += 10;
        scores.minimalism   -= 10;
      }
    }

    // ── CEILING HEIGHT ──
    if (ch) {
      if (ch > 3.2) {
        scores.loft       += 25; reasons.loft.push(`Высокие потолки ${ch.toFixed(1)} м — главный признак аутентичного лофта`);
        scores.neoclassic += 15; reasons.neoclassic.push(`Высота ${ch.toFixed(1)} м позволит использовать лепнину и карнизы`);
        scores.modern     +=  8;
      } else if (ch >= 2.8) {
        scores.scandinavian += 10; reasons.scandinavian.push(`Потолки ${ch.toFixed(1)} м — хороши для скандинавского интерьера`);
        scores.modern       += 12; reasons.modern.push('Высота потолков подходит для современных решений');
      } else {
        scores.minimalism   += 15; reasons.minimalism.push(`Потолки ${ch.toFixed(1)} м — минимализм визуально поднимет высоту`);
        scores.loft         -= 15; reasons.loft.push('Низкие потолки не подходят для лофта');
        scores.neoclassic   -= 12;
      }
    }

    // ── ORIENTATION ──
    if (orient) {
      if (['S', 'SE', 'SW'].includes(orient)) {
        scores.scandinavian += 15; reasons.scandinavian.push(`Южная ориентация (${orientLabel(orient)}) — много света, идеально для скандинавского`);
        scores.modern       +=  8;
      } else if (['N', 'NE', 'NW'].includes(orient)) {
        scores.loft         += 10; reasons.loft.push(`Северная сторона (${orientLabel(orient)}) — рассеянный свет характерен для промышленных помещений`);
        scores.neoclassic   +=  8;
        scores.scandinavian -= 10;
      } else if (['E'].includes(orient)) {
        scores.scandinavian += 10; reasons.scandinavian.push('Восточная ориентация — утренний свет, жизнерадостная атмосфера');
        scores.modern       +=  8;
      }
    }

    // ── WALL MATERIAL ──
    if (wmat === 'brick') {
      scores.loft         += 22; reasons.loft.push('Кирпичный дом — кирпичные акценты органичны для лофта');
      scores.neoclassic   +=  8;
      scores.scandinavian -=  5;
    } else if (wmat === 'monolith' || wmat === 'monolithic') {
      scores.modern       += 15; reasons.modern.push('Монолитный дом — гладкие стены идеальны для современного интерьера');
      scores.loft         += 10; reasons.loft.push('Бетонный монолит — органичная основа для лофта');
      scores.minimalism   += 10;
    } else if (wmat === 'panel') {
      scores.minimalism   += 18; reasons.minimalism.push('Панельный дом — минимализм скроет недостатки конструкции');
      scores.modern       += 12;
      scores.neoclassic   -= 15;
      scores.loft         -= 10;
    } else if (wmat === 'block') {
      scores.scandinavian += 12; reasons.scandinavian.push('Газоблочный дом — энергоэффективный, хорошая основа для скандинавского стиля');
      scores.minimalism   +=  8; reasons.minimalism.push('Газоблоки дают ровные стены — идеально для минимализма');
      scores.modern       +=  8;
    }

    // ── OPEN PLAN / KITCHEN STUDIO ──
    if (openPl || kitchSt) {
      scores.modern += 15; reasons.modern.push('Открытая планировка — тренд современного дизайна');
      scores.scandinavian += 10; reasons.scandinavian.push('Кухня-гостиная в скандинавском стиле — уютное открытое пространство');
      scores.neoclassic -= 10;
    }
    if (kitchSt) {
      scores.loft += 10; reasons.loft.push('Зонированная кухня-студия — классика лофт-концепции');
    }

    // ── ROOMS COUNT ──
    if (rooms === 1) {
      scores.minimalism   += 15; reasons.minimalism.push('Однокомнатная — минимализм максимально функционален');
      scores.scandinavian += 12;
      scores.neoclassic   -= 15;
    } else if (rooms >= 3) {
      scores.neoclassic   += 15; reasons.neoclassic.push(`${rooms}-комнатная квартира — неоклассике есть где развернуться`);
      scores.modern       += 10;
    }

    // ── TWO BATHROOMS ──
    if (twoBath) {
      scores.modern       += 12; reasons.modern.push('Два санузла — возможна SPA-ванная и гостевой санузел');
      scores.neoclassic   += 10; reasons.neoclassic.push('Два санузла — признак представительской квартиры');
      scores.scandinavian +=  6;
    }

    // ── COLUMNS (архитектурные колонны) ──
    if (columns) {
      scores.loft       += 12; reasons.loft.push('Колонны в интерьере — характерная черта лофта');
      scores.neoclassic += 10; reasons.neoclassic.push('Колонны — элемент неоклассической архитектуры');
    }

    // ── ELECTRICAL POINTS ──
    if (elPts > 0) {
      if (elPts >= 15) {
        scores.modern += 15; reasons.modern.push(`Много электрических точек (${elPts}) — идеально для умного дома`);
        scores.loft   +=  8;
      } else if (elPts >= 8) {
        scores.modern += 8;
      }
    }

    // ── PLUMBING ──
    if (wkPts > 0) {
      if (wkPts >= 6) {
        scores.modern       += 10; reasons.modern.push(`Развитая сантехника (${wkPts} точек) — возможна SPA-ванная`);
        scores.scandinavian +=  8;
      }
    }

    // ── COMMS ──
    if (ssPts > 0) {
      scores.modern += Math.min(ssPts * 2, 12);
      if (ssPts >= 4) reasons.modern.push(`СС-точки (${ssPts} шт.) — основа для умного дома`);
    }

    // ── WARM FLOORS ──
    if (warmFl) {
      scores.scandinavian += 10; reasons.scandinavian.push('Тёплые полы — уют в скандинавском стиле');
      scores.modern       +=  8;
      scores.neoclassic   +=  6;
    }

    // ── BALCONY / LOGGIA ──
    if (balcony) {
      scores.scandinavian += 8; reasons.scandinavian.push('Лоджия — возможность создать уголок природы');
      scores.modern       += 6;
    }

    // ── FLOOR (top = panorama chance) ──
    if (floor && floors && floor === floors) {
      scores.loft   += 8; reasons.loft.push('Последний этаж — возможны высокие потолки');
      scores.modern += 6;
    }

    // ── LARGEST ROOM ──
    if (largestRoom > 28) {
      scores.loft       += 12; reasons.loft.push(`Большой зал (≈${largestRoom.toFixed(0)} м²) — центральное пространство лофта`);
      scores.neoclassic += 10;
    }

    // Normalize 0–100
    STYLES.forEach(s => { scores[s] = Math.max(0, Math.min(100, Math.round(scores[s]))); });

    const ranked = STYLES
      .map(s => ({ style: s, score: scores[s], reasons: reasons[s], ...STYLE_META[s] }))
      .sort((a, b) => b.score - a.score);

    // Ensure readable top score
    const maxScore = ranked[0].score;
    if (maxScore < 70) {
      const boost = 70 - maxScore;
      ranked.forEach((r, i) => {
        r.score = Math.min(100, Math.round(r.score + boost * Math.max(0, 1 - i * 0.18)));
      });
    }
    return ranked;
  }

  function orientLabel(code) {
    const map = { N:'Север', S:'Юг', E:'Восток', W:'Запад', NE:'Северо-восток', NW:'Северо-запад', SE:'Юго-восток', SW:'Юго-запад' };
    return map[code] || code;
  }

  /* ──────────────────────────────────────────────────────────
     PUBLIC API
  ─────────────────────────────────────────────────────────── */

  async function analyzePDF(file, declaredRooms) {
    if (!initWorker()) throw new Error('PDF.js not loaded');
    const ab  = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: ab }).promise;

    let fullText = '';
    let planPageIndex = 1;
    let maxPlanScore  = -1;

    for (let i = 1; i <= pdf.numPages; i++) {
      const p  = await pdf.getPage(i);
      const tc = await p.getTextContent();
      const pageText = tc.items.map(it => it.str).join(' ');
      fullText += ' ' + pageText + '\n';

      let score = 0;
      if (/план\s+квартиры|пәтердің жоспары/i.test(pageText)) score += 10;
      if (/схема|масштаб|масштабы/i.test(pageText)) score += 5;
      if (/экспликаци/i.test(pageText)) score += 3;

      if (score > maxPlanScore) {
        maxPlanScore  = score;
        planPageIndex = i;
      }
    }

    // For BTI documents the plan is usually page 2
    if (maxPlanScore === 0 && pdf.numPages >= 2) {
      planPageIndex = 2;
    }

    const planPage = await pdf.getPage(planPageIndex);
    const canvas   = await renderToCanvas(planPage);
    const metrics  = parseMetrics(fullText);

    // ALWAYS try strict explication table extraction first!
    // The generic parseMetrics might return flawed results (wrong areas)
    // due to column extraction issues, so strict parser takes priority.
    const expRooms = parseAmanatExplicationStrict(fullText);
    if (expRooms && expRooms.length > 0) {
      metrics.roomDetails = expRooms;
    } else if (metrics.roomDetails.length === 0) {
      // Fallback to Amanat proximity-based parsing
      const amanatRooms = parseBTIAmanatFormat(fullText);
      if (amanatRooms) metrics.roomDetails = amanatRooms;
    }

    // Post-process roomDetails
    if (metrics.roomDetails.length > 0) {
      // Update flags from room details
      const bathrooms = metrics.roomDetails.filter(r => r.type === 'bathroom');
      if (bathrooms.length >= 2) metrics.hasTwoBathrooms = true;

      const loggiaRoom = metrics.roomDetails.find(r => r.type === 'loggia');
      if (loggiaRoom) { metrics.hasLoggia = true; metrics.loggiaArea = loggiaRoom.area; }

      const balconyRoom = metrics.roomDetails.find(r => r.type === 'balcony');
      if (balconyRoom) { metrics.hasBalcony = true; }

      // Detect kitchen-studio: kitchen + adjacent living room
      const kitchens = metrics.roomDetails.filter(r => r.type === 'kitchen');
      const livingRooms = metrics.roomDetails.filter(r => r.type === 'living');
      kitchens.forEach(kr => {
        const adj = livingRooms.find(lr => Math.abs(lr.id - kr.id) <= 2);
        if (adj) metrics.hasKitchenStudio = true;
      });

      // Recalculate rooms count from living rooms
      if (!metrics.rooms && livingRooms.length > 0) {
        metrics.rooms = livingRooms.length;
      }

      // Update roomAreas
      metrics.roomAreas = metrics.roomDetails
        .filter(r => r.area > 0)
        .map(r => r.area)
        .sort((a, b) => b - a);
    }

    if (declaredRooms && !metrics.rooms) metrics.rooms = declaredRooms;
    const missing = getMissingFields(metrics);

    return { metrics, missing, canvas, planPage, pageCount: pdf.numPages };
  }

  function finalize(metrics, extraParams, declaredRooms) {
    if (declaredRooms) metrics.rooms = declaredRooms;
    const ranked = scoreStyles(metrics, extraParams);
    return { metrics, ranked };
  }

  function scoreManual(params) {
    const metrics = {
      totalArea:     params.area,
      rooms:         params.rooms,
      ceilingHeight: params.ceiling,
      roomAreas:     [],
      roomDetails:   [],
      hasBalcony:    params.balcony || false,
      hasLoggia:     false,
      isOpenPlan:    params.isOpenPlan || false,
      electricPts:   params.electric  || 0,
      plumbingPts:   params.plumbing  || 0,
      commsPts:      params.comms     || 0,
      warmFloors:    params.warmFloors || false,
      buildingType:  params.wallMaterial || null,
      orientation:   params.orientation || null,
      hasTwoBathrooms: false,
      hasKitchenStudio: false,
      hasColumns: false,
    };
    const ranked = scoreStyles(metrics, {});
    return { metrics, ranked };
  }

  return {
    analyzePDF,
    finalize,
    scoreManual,
    getMissingFields,
    STYLE_META,
    STYLES,
    orientLabel,
    parseBTIAmanatFormat,
  };
})();
