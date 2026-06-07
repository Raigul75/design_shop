/* ============================================================
   PLAN GRAPHICS EDITOR
   Interactive 2D vector editor overlay on PDF canvas.
   Allows moving and resizing room blocks.
   ============================================================ */

const PlanGraphicsEditor = (() => {
  'use strict';

  let _container, _canvas, _roomDetails, _positions, _onChange;
  let _svg, _dragItem = null, _resizeItem = null;
  let _offsetX = 0, _offsetY = 0;
  
  // Base scale: 1 meter = 40 pixels
  const PPM = 40;

  function init({ containerId, canvas, roomDetails, positions, onChange }) {
    _container = document.getElementById(containerId);
    _canvas = canvas;
    _roomDetails = roomDetails || [];
    _positions = positions || {}; // map of roomId -> {x,y}
    _onChange = onChange || (() => {});

    render();
  }

  function getRoomColor(type) {
    const colors = {
      living: 'rgba(52, 152, 219, 0.4)',
      bedroom: 'rgba(155, 89, 182, 0.4)',
      kitchen: 'rgba(230, 126, 34, 0.4)',
      bathroom: 'rgba(26, 188, 156, 0.4)',
      hallway: 'rgba(149, 165, 166, 0.4)',
      wardrobe: 'rgba(241, 196, 15, 0.4)',
      loggia: 'rgba(46, 204, 113, 0.4)',
      balcony: 'rgba(46, 204, 113, 0.4)'
    };
    return colors[type] || 'rgba(189, 195, 199, 0.4)';
  }

  function render() {
    if (!_container || !_canvas) return;

    _container.innerHTML = '';
    _container.style.position = 'relative';
    _container.style.width = '100%';
    // Set a fixed height or max-height with scroll
    _container.style.height = '600px';
    _container.style.overflow = 'auto';
    _container.style.background = '#1a1a1a';
    _container.style.border = '1px solid rgba(255,255,255,0.1)';
    _container.style.borderRadius = '8px';

    // Background layer (PDF)
    const img = document.createElement('img');
    try {
      img.src = _canvas.toDataURL('image/png');
    } catch(e) {}
    img.style.position = 'absolute';
    img.style.top = '0';
    img.style.left = '0';
    img.style.pointerEvents = 'none';
    img.style.filter = 'grayscale(100%) contrast(1.2) opacity(0.5)';
    _container.appendChild(img);

    // SVG Layer
    _svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    _svg.style.position = 'absolute';
    _svg.style.top = '0';
    _svg.style.left = '0';
    _svg.style.width = Math.max(_canvas.width, 800) + 'px';
    _svg.style.height = Math.max(_canvas.height, 600) + 'px';
    
    // Create defs for grid (optional, but looks nice)
    _svg.innerHTML = `
      <defs>
        <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)" pointer-events="none" />
    `;

    _roomDetails.forEach(room => {
      createRoomBlock(room);
    });

    _container.appendChild(_svg);

    // Mouse events
    _svg.addEventListener('mousedown', onMouseDown);
    _svg.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp); // window to catch drops outside
  }

  function createRoomBlock(room) {
    const area = room.area || 10;
    // Assuming a square room to get initial width/height in meters
    const sideMeters = Math.sqrt(area);
    const w = sideMeters * PPM;
    const h = sideMeters * PPM;

    // Position
    let cx = _canvas.width / 2;
    let cy = _canvas.height / 2;
    
    if (_positions[room.id]) {
      cx = _positions[room.id].x;
      cy = _positions[room.id].y;
    } else {
      // Offset randomly if no position found
      cx += (Math.random() - 0.5) * 200;
      cy += (Math.random() - 0.5) * 200;
    }

    const x = cx - w/2;
    const y = cy - h/2;

    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('transform', `translate(${x}, ${y})`);
    group.setAttribute('class', 'room-block');
    group.setAttribute('data-id', room.id);
    group.setAttribute('data-w', w);
    group.setAttribute('data-h', h);

    // Rect
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('width', w);
    rect.setAttribute('height', h);
    rect.setAttribute('fill', getRoomColor(room.type));
    rect.setAttribute('stroke', '#fff');
    rect.setAttribute('stroke-width', '2');
    rect.setAttribute('rx', '4');
    rect.style.cursor = 'move';
    rect.classList.add('room-rect');

    // Label
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', w/2);
    text.setAttribute('y', h/2);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('alignment-baseline', 'middle');
    text.setAttribute('fill', '#fff');
    text.setAttribute('font-size', '14');
    text.setAttribute('font-weight', 'bold');
    text.setAttribute('pointer-events', 'none');
    text.textContent = `${room.id}) ${room.nameRu || room.name}`;
    
    // Area Label
    const areaText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    areaText.setAttribute('x', w/2);
    areaText.setAttribute('y', h/2 + 18);
    areaText.setAttribute('text-anchor', 'middle');
    areaText.setAttribute('fill', 'rgba(255,255,255,0.8)');
    areaText.setAttribute('font-size', '12');
    areaText.setAttribute('pointer-events', 'none');
    areaText.classList.add('room-area-label');
    areaText.textContent = `${area.toFixed(1)} м²`;

    // Resize handle
    const handle = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    handle.setAttribute('x', w - 10);
    handle.setAttribute('y', h - 10);
    handle.setAttribute('width', '10');
    handle.setAttribute('height', '10');
    handle.setAttribute('fill', '#fff');
    handle.setAttribute('cursor', 'nwse-resize');
    handle.classList.add('resize-handle');

    group.appendChild(rect);
    group.appendChild(text);
    group.appendChild(areaText);
    group.appendChild(handle);

    _svg.appendChild(group);
  }

  function getMouseCoords(e) {
    const pt = _svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(_svg.getScreenCTM().inverse());
  }

  function onMouseDown(e) {
    if (e.target.classList.contains('resize-handle')) {
      _resizeItem = e.target.parentNode;
      const pt = getMouseCoords(e);
      _offsetX = pt.x;
      _offsetY = pt.y;
      e.preventDefault();
    } else if (e.target.classList.contains('room-rect')) {
      _dragItem = e.target.parentNode;
      const pt = getMouseCoords(e);
      
      const transform = _dragItem.getAttribute('transform');
      const match = /translate\(([^,]+),\s*([^)]+)\)/.exec(transform);
      const startX = match ? parseFloat(match[1]) : 0;
      const startY = match ? parseFloat(match[2]) : 0;
      
      _offsetX = pt.x - startX;
      _offsetY = pt.y - startY;
      
      // Bring to front
      _svg.appendChild(_dragItem);
      e.preventDefault();
    }
  }

  function onMouseMove(e) {
    if (_dragItem) {
      const pt = getMouseCoords(e);
      _dragItem.setAttribute('transform', `translate(${pt.x - _offsetX}, ${pt.y - _offsetY})`);
    } else if (_resizeItem) {
      const pt = getMouseCoords(e);
      const dx = pt.x - _offsetX;
      const dy = pt.y - _offsetY;
      
      const w = Math.max(20, parseFloat(_resizeItem.getAttribute('data-w')) + dx);
      const h = Math.max(20, parseFloat(_resizeItem.getAttribute('data-h')) + dy);
      
      updateRoomBlockSize(_resizeItem, w, h);
      
      _offsetX = pt.x;
      _offsetY = pt.y;
    }
  }

  function onMouseUp(e) {
    if (_resizeItem) {
      const w = parseFloat(_resizeItem.getAttribute('data-w'));
      const h = parseFloat(_resizeItem.getAttribute('data-h'));
      const newArea = (w / PPM) * (h / PPM);
      
      const roomId = parseInt(_resizeItem.getAttribute('data-id'));
      
      // Update room area label
      const areaLabel = _resizeItem.querySelector('.room-area-label');
      if (areaLabel) areaLabel.textContent = `${newArea.toFixed(1)} м²`;

      // Notify external
      _onChange(roomId, newArea);
    }
    
    _dragItem = null;
    _resizeItem = null;
  }

  function updateRoomBlockSize(group, w, h) {
    group.setAttribute('data-w', w);
    group.setAttribute('data-h', h);
    
    const rect = group.querySelector('.room-rect');
    rect.setAttribute('width', w);
    rect.setAttribute('height', h);
    
    const text = group.querySelector('text');
    text.setAttribute('x', w/2);
    text.setAttribute('y', h/2);
    
    const areaText = group.querySelector('.room-area-label');
    if (areaText) {
      areaText.setAttribute('x', w/2);
      areaText.setAttribute('y', h/2 + 18);
      // update text is done in mouseup to avoid too many callbacks, but visually we can update it
      const newArea = (w / PPM) * (h / PPM);
      areaText.textContent = `${newArea.toFixed(1)} м²`;
    }
    
    const handle = group.querySelector('.resize-handle');
    handle.setAttribute('x', w - 10);
    handle.setAttribute('y', h - 10);
  }

  // API to update from external input (explication table)
  function updateRoomArea(roomId, newArea) {
    const group = _svg.querySelector(`.room-block[data-id="${roomId}"]`);
    if (!group) return;

    // keep ratio, scale both w and h
    const oldW = parseFloat(group.getAttribute('data-w'));
    const oldH = parseFloat(group.getAttribute('data-h'));
    const oldArea = (oldW / PPM) * (oldH / PPM);
    
    if (oldArea === 0) return;
    
    const scale = Math.sqrt(newArea / oldArea);
    const newW = oldW * scale;
    const newH = oldH * scale;
    
    updateRoomBlockSize(group, newW, newH);
  }

  return { init, updateRoomArea };
})();
