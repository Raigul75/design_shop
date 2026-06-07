/* ============================================================
   PLAN GRAPHICS EDITOR (Polygon Mode)
   Interactive 2D vector editor overlay on PDF canvas.
   Allows point-by-point drawing of room polygons.
   ============================================================ */

const PlanGraphicsEditor = (() => {
  'use strict';

  let _container, _canvas, _onChange;
  let _svg, _img;
  
  // State
  let _activeRoomId = null;
  let _activeColor = '#ffffff';
  let _activeLabel = '';
  
  // Data structure for polygons: roomId -> { color, label, points: [{x,y}], isClosed: boolean }
  let _roomsData = {};
  
  // Interaction state
  let _draggedPoint = null; // { roomId, pointIndex }
  let _hoveredPoint = null;
  
  const CLOSE_DISTANCE = 8; // Reduced snap distance for precision

  function init({ containerId, canvas, onChange }) {
    _container = document.getElementById(containerId);
    _canvas = canvas;
    _onChange = onChange || (() => {});

    renderCanvas();
  }

  function setActiveRoom(roomId, color, label) {
    _activeRoomId = roomId;
    _activeColor = color;
    _activeLabel = label;
    
    if (!_roomsData[roomId]) {
      _roomsData[roomId] = { color, label, points: [], isClosed: false };
    } else {
      // Update color/label if it changed
      _roomsData[roomId].color = color;
      _roomsData[roomId].label = label;
    }
    
    // Update indicator
    const indicator = document.getElementById('graphicEditorActiveRoomIndicator');
    if (indicator) {
       indicator.style.display = 'block';
       indicator.innerHTML = `<span style="display:inline-block; width:12px; height:12px; border-radius:50%; background-color:${color}; margin-right:8px; vertical-align:middle;"></span><span style="vertical-align:middle;">Выбрано: ${label}</span>`;
       indicator.style.borderColor = color;
    }
    
    redraw();
  }

  function renderCanvas() {
    if (!_container || !_canvas) return;

    _container.innerHTML = '';
    _container.style.position = 'relative';
    _container.style.width = '100%';
    _container.style.height = '600px';
    _container.style.overflow = 'auto';
    _container.style.background = '#1a1a1a';
    _container.style.border = '1px solid rgba(255,255,255,0.1)';
    _container.style.borderRadius = '8px';
    // Use crosshair when drawing
    _container.style.cursor = 'crosshair';

    // Background layer (PDF)
    _img = document.createElement('img');
    try {
      _img.src = _canvas.toDataURL('image/png');
    } catch(e) {}
    _img.style.position = 'absolute';
    _img.style.top = '0';
    _img.style.left = '0';
    _img.style.pointerEvents = 'none';
    _img.style.filter = 'grayscale(100%) contrast(1.2) opacity(0.8)';
    _container.appendChild(_img);

    // SVG Layer
    _svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    _svg.style.position = 'absolute';
    _svg.style.top = '0';
    _svg.style.left = '0';
    // Ensure SVG is exactly same size as canvas
    _svg.style.width = _canvas.width + 'px';
    _svg.style.height = _canvas.height + 'px';
    
    _container.appendChild(_svg);

    // Mouse events
    _svg.addEventListener('mousedown', onMouseDown);
    _svg.addEventListener('mousemove', onMouseMove);
    _svg.addEventListener('mouseup', onMouseUp);
    _svg.addEventListener('contextmenu', onContextMenu);
    
    // Active Room Indicator
    const indicator = document.createElement('div');
    indicator.id = 'graphicEditorActiveRoomIndicator';
    indicator.style.position = 'absolute';
    indicator.style.top = '10px';
    indicator.style.left = '10px';
    indicator.style.padding = '8px 16px';
    indicator.style.background = 'rgba(0,0,0,0.8)';
    indicator.style.border = '1px solid rgba(255,255,255,0.2)';
    indicator.style.borderRadius = '8px';
    indicator.style.color = '#fff';
    indicator.style.fontFamily = 'sans-serif';
    indicator.style.fontWeight = 'bold';
    indicator.style.zIndex = '10';
    indicator.style.display = 'none';
    indicator.style.pointerEvents = 'none';
    indicator.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
    _container.appendChild(indicator);
    
    // Note: Removed the large visual "Undo" button because it blocked the view.
    // Undo is now purely right-click.
  }

  function undoLastPoint() {
    if (_activeRoomId && _roomsData[_activeRoomId] && !_roomsData[_activeRoomId].isClosed) {
       _roomsData[_activeRoomId].points.pop();
       redraw();
    }
  }

  function onContextMenu(e) {
    e.preventDefault(); // Prevent default right-click menu
    undoLastPoint();
  }

  function getMouseCoords(e) {
    const pt = _svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(_svg.getScreenCTM().inverse());
  }
  
  function distance(p1, p2) {
    return Math.sqrt((p1.x - p2.x)**2 + (p1.y - p2.y)**2);
  }

  function onMouseDown(e) {
    if (e.button === 2) return; // Ignore right click (handled by contextmenu)

    if (!_activeRoomId) {
       alert("Пожалуйста, выберите комнату в таблице справа для отрисовки.");
       return;
    }

    const pt = getMouseCoords(e);
    const room = _roomsData[_activeRoomId];

    // Check snapping: 
    // IF the polygon is not closed, we ONLY allow snapping to the FIRST point (index 0) of the ACTIVE room to close it.
    // IF the polygon is closed, we allow snapping to ANY point of the active room to drag it.
    let clickedPoint = null;
    
    if (!room.isClosed && room.points.length > 2) {
       // Only snap to the first point to close
       if (distance(pt, room.points[0]) <= CLOSE_DISTANCE) {
          clickedPoint = { roomId: _activeRoomId, pointIndex: 0 };
       }
    } else if (room.isClosed) {
       // Snap to any point of the closed room for dragging
       for (let i = 0; i < room.points.length; i++) {
         if (distance(pt, room.points[i]) <= CLOSE_DISTANCE) {
           clickedPoint = { roomId: _activeRoomId, pointIndex: i };
           break;
         }
       }
    }

    if (clickedPoint) {
      // If we clicked the FIRST point of the ACTIVE room, and it's NOT closed, we close it
      if (clickedPoint.pointIndex === 0 && !room.isClosed) {
         room.isClosed = true;
         _draggedPoint = null; // Don't drag on close click
         redraw();
      } else {
         // Start dragging a point
         _draggedPoint = clickedPoint;
      }
      return;
    }

    // If active room polygon is not closed, add a new point
    if (!room.isClosed) {
      room.points.push({ x: pt.x, y: pt.y });
      redraw();
    }
  }

  function onMouseMove(e) {
    const pt = getMouseCoords(e);

    // Dragging logic
    if (_draggedPoint) {
      const { roomId, pointIndex } = _draggedPoint;
      _roomsData[roomId].points[pointIndex] = { x: pt.x, y: pt.y };
      redraw();
      return;
    }

    // Hover logic (cursor change)
    let hovered = false;
    const room = _roomsData[_activeRoomId];
    
    if (room) {
       if (!room.isClosed && room.points.length > 2) {
          // Hover over first point to close
          if (distance(pt, room.points[0]) <= CLOSE_DISTANCE) {
             hovered = true;
          }
       } else if (room.isClosed) {
          // Hover over any point of the active closed room
          for (let i = 0; i < room.points.length; i++) {
             if (distance(pt, room.points[i]) <= CLOSE_DISTANCE) {
                hovered = true;
                break;
             }
          }
       }
    }
    
    if (hovered) {
      _svg.style.cursor = 'pointer';
    } else {
      _svg.style.cursor = _activeRoomId && !_roomsData[_activeRoomId]?.isClosed ? 'crosshair' : 'default';
    }

    // Draw dynamic line from last point to mouse cursor if not closed
    if (_activeRoomId && _roomsData[_activeRoomId] && !_roomsData[_activeRoomId].isClosed && _roomsData[_activeRoomId].points.length > 0) {
       redraw(pt); // pass current mouse pos to draw temporary line
    }
  }

  function onMouseUp(e) {
    _draggedPoint = null;
  }

  function redraw(mousePt = null) {
    _svg.innerHTML = '';

    // Draw all rooms
    for (const [roomId, room] of Object.entries(_roomsData)) {
      if (room.points.length === 0) continue;

      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      
      // Points string
      const pointsStr = room.points.map(p => `${p.x},${p.y}`).join(' ');

      // Polygon or Polyline
      const shape = document.createElementNS('http://www.w3.org/2000/svg', room.isClosed ? 'polygon' : 'polyline');
      shape.setAttribute('points', pointsStr);
      shape.setAttribute('fill', room.isClosed ? room.color : 'none');
      shape.setAttribute('stroke', room.color);
      shape.setAttribute('stroke-width', '3');
      shape.setAttribute('stroke-linejoin', 'round');
      
      // Semi-transparent fill
      if (room.isClosed) {
         shape.setAttribute('fill-opacity', '0.4');
      }

      group.appendChild(shape);

      // Temporary line to mouse cursor
      if (mousePt && !room.isClosed && roomId === _activeRoomId) {
         const lastPt = room.points[room.points.length - 1];
         const tempLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
         tempLine.setAttribute('x1', lastPt.x);
         tempLine.setAttribute('y1', lastPt.y);
         tempLine.setAttribute('x2', mousePt.x);
         tempLine.setAttribute('y2', mousePt.y);
         tempLine.setAttribute('stroke', room.color);
         tempLine.setAttribute('stroke-width', '2');
         tempLine.setAttribute('stroke-dasharray', '5,5');
         group.appendChild(tempLine);
         
         // Highlight first point if close enough to close polygon
         if (room.points.length > 2 && distance(mousePt, room.points[0]) <= CLOSE_DISTANCE) {
            const snapCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            snapCircle.setAttribute('cx', room.points[0].x);
            snapCircle.setAttribute('cy', room.points[0].y);
            snapCircle.setAttribute('r', '8');
            snapCircle.setAttribute('fill', 'none');
            snapCircle.setAttribute('stroke', '#fff');
            snapCircle.setAttribute('stroke-width', '2');
            group.appendChild(snapCircle);
         }
      }

      // Draw nodes (points)
      room.points.forEach((p, idx) => {
         const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
         circle.setAttribute('cx', p.x);
         circle.setAttribute('cy', p.y);
         circle.setAttribute('r', '5');
         circle.setAttribute('fill', '#fff');
         circle.setAttribute('stroke', room.color);
         circle.setAttribute('stroke-width', '2');
         circle.style.cursor = 'grab';
         group.appendChild(circle);
         
         // Draw label at the center of polygon (approximated by average of points)
         if (room.isClosed && idx === room.points.length - 1) {
            let cx = 0, cy = 0;
            room.points.forEach(pt => { cx += pt.x; cy += pt.y; });
            cx /= room.points.length;
            cy /= room.points.length;
            
            const textBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', cx);
            text.setAttribute('y', cy);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('alignment-baseline', 'middle');
            text.setAttribute('fill', '#fff');
            text.setAttribute('font-size', '14');
            text.setAttribute('font-weight', 'bold');
            text.setAttribute('pointer-events', 'none');
            text.textContent = room.label;
            
            // Background pill for text
            textBg.setAttribute('fill', '#000');
            textBg.setAttribute('fill-opacity', '0.6');
            textBg.setAttribute('rx', '4');
            // Estimate width
            const tw = room.label.length * 8 + 10;
            textBg.setAttribute('x', cx - tw/2);
            textBg.setAttribute('y', cy - 12);
            textBg.setAttribute('width', tw);
            textBg.setAttribute('height', '24');
            textBg.setAttribute('pointer-events', 'none');
            
            group.appendChild(textBg);
            group.appendChild(text);
         }
      });

      _svg.appendChild(group);
    }
  }

  function updateRoomLabel(roomId, newLabel) {
    if (_roomsData[roomId]) {
      _roomsData[roomId].label = newLabel;
      if (roomId === _activeRoomId) {
        _activeLabel = newLabel;
        const indicator = document.getElementById('graphicEditorActiveRoomIndicator');
        if (indicator) {
           indicator.innerHTML = `<span style="display:inline-block; width:12px; height:12px; border-radius:50%; background-color:${_activeColor}; margin-right:8px; vertical-align:middle;"></span><span style="vertical-align:middle;">Выбрано: ${newLabel}</span>`;
        }
      }
      redraw();
    }
  }

  return { init, setActiveRoom, updateRoomLabel };
})();
