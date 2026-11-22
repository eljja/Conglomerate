/**
 * 대한민국 대기업 네트워크 - HiDPI GPU 가속 HTML5 Canvas 2D 시각화 엔진 (v4.0.0)
 * - 레티나(HiDPI) 실시간 벡터 + 128px 고해상도 이모지 스프라이트 캐싱으로 60~120fps 초고속 패닝/줌
 * - 프리워밍(Pre-warming) 무버벅 로딩, 자동 화면 맞춤(Fit-to-Screen), 시맨틱 줌(LOD), 클릭 이동 미니맵
 */

export class NetworkGraph {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.options = options;
    this.width = this.container.clientWidth || window.innerWidth;
    this.height = this.container.clientHeight || window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);

    this.nodes = [];
    this.links = [];
    this.canvas = null;
    this.ctx = null;
    this.canvasSelection = null;
    this.simulation = null;
    this.zoom = null;
    this.currentTransform = d3.zoomIdentity;

    this.selectedNodeId = null;
    this.hoveredNodeId = null;
    this.highlightedPath = null;
    this.viewMode = 'holistic';
    this.sizeScaleEnabled = true;
    this.hasRenderedOnce = false;

    // Fast highlight lookup caches (rebuilt only on hover/select/path change)
    this._activeNodeIds = null;
    this._activeLinkSet = null;
    this._hasAnimatedLinks = false;

    // Frame scheduler & animation state
    this._needsDraw = true;
    this._rafId = null;
    this._lastIdleAnimTime = 0;
    this._isPanning = false;
    this._lastZoomPct = null;
    this._zoomBadgeEl = null;

    // Minimap offscreen cache
    this._minimapMeta = null;
    this._minimapBgCanvas = null;
    this._minimapBgCtx = null;
    this._tickCounter = 0;

    // Pre-rendered HiDPI Emoji Sprites (128x128px each — crisp at 400% zoom, 50x faster!)
    this._emojiSprites = {};

    this.onNodeClick = options.onNodeClick || null;
    this.onLinkClick = options.onLinkClick || null;

    // Group Color Palette
    this.groupColors = {
      'samsung': '#3b82f6',
      'sk': '#ef4444',
      'hyundai_motor': '#0284c7',
      'hd_hyundai': '#059669',
      'lg': '#ec4899',
      'gs': '#f59e0b',
      'ls': '#84cc16',
      'lotte': '#e11d48',
      'hanwha': '#f97316',
      'shinsegae': '#d97706',
      'cj': '#dc2626',
      'hanjin': '#2563eb',
      'hoban': '#0d9488',
      'doosan': '#0891b2',
      'hyosung': '#4f46e5',
      'celltrion': '#10b981',
      'naver': '#22c55e',
      'kakao': '#eab308',
      'tech_giants': '#a855f7',
      'inlaw_alliances': '#a855f7',
      'default': '#64748b'
    };

    this.buildEmojiSprites();
    this.initCanvas();
    this.initTooltip();
    this.initMinimap();
    this.initResizeObserver();
    this.startRenderLoop();

    // Repaint cleanly once webfont (Pretendard) finishes loading
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        this.measureLinkLabels();
        this.requestDraw();
      });
    }
  }

  /**
   * Pre-render high-resolution 128x128 emoji bitmaps once so drawing 147 icons takes <0.1ms
   */
  buildEmojiSprites() {
    const emojis = ['🏢', '👤', '👑'];
    const size = 128;
    emojis.forEach(emoji => {
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const ctx = c.getContext('2d');
      ctx.font = '84px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(emoji, size / 2, size / 2 + 4);
      this._emojiSprites[emoji] = c;
    });
  }

  initCanvas() {
    this.container.innerHTML = '';

    const canvas = document.createElement('canvas');
    canvas.id = 'network-canvas';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    canvas.style.touchAction = 'none';
    this.container.appendChild(canvas);

    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
    this.canvasSelection = d3.select(canvas);
    this.resizeCanvasBuffer();

    // 1. Node Drag Behavior (intercepts pointer ONLY when starting on a node!)
    let dragStartPos = null;
    let draggedMoved = false;

    const dragBehavior = d3.drag()
      .subject((event) => {
        const [sx, sy] = this.getPointerPos(event.sourceEvent || event);
        return this.findNodeAt(sx, sy);
      })
      .on('start', (event) => {
        const d = event.subject;
        if (!d) return;
        dragStartPos = [event.x, event.y];
        draggedMoved = false;
        this.hideTooltip();
        if (!event.active && this.simulation) {
          this.simulation.alphaTarget(0.25).restart();
        }
        d.fx = d.x;
        d.fy = d.y;
        this.canvas.style.cursor = 'grabbing';
        this.requestDraw();
      })
      .on('drag', (event) => {
        const d = event.subject;
        if (!d) return;
        const t = this.currentTransform;
        const [sx, sy] = this.getPointerPos(event.sourceEvent || event);
        d.fx = (sx - t.x) / t.k;
        d.fy = (sy - t.y) / t.k;
        if (dragStartPos) {
          const dist = Math.hypot(event.x - dragStartPos[0], event.y - dragStartPos[1]);
          if (dist > 4) draggedMoved = true;
        }
        this.requestDraw();
      })
      .on('end', (event) => {
        const d = event.subject;
        if (!d) return;
        if (!event.active && this.simulation) {
          this.simulation.alphaTarget(0);
        }
        d.fx = null;
        d.fy = null;
        this.canvas.style.cursor = 'pointer';

        // Short tap/click on a node without dragging -> select & inspect!
        if (!draggedMoved) {
          this.selectNode(d, true, true);
        }
        this.updateMinimap();
        this.requestDraw();
      });

    // 2. GPU-Fast Zoom & Pan Behavior
    let panStartPos = null;
    let panMoved = false;

    this.zoom = d3.zoom()
      .scaleExtent([0.08, 4.0])
      .on('start', (event) => {
        this._isPanning = true;
        panMoved = false;
        if (event.sourceEvent && event.sourceEvent.clientX !== undefined) {
          panStartPos = [event.sourceEvent.clientX, event.sourceEvent.clientY];
        } else {
          panStartPos = null;
        }
        this.hideTooltip();
      })
      .on('zoom', (event) => {
        this.currentTransform = event.transform;
        if (panStartPos && event.sourceEvent && event.sourceEvent.clientX !== undefined) {
          const dist = Math.hypot(
            event.sourceEvent.clientX - panStartPos[0],
            event.sourceEvent.clientY - panStartPos[1]
          );
          if (dist > 4) panMoved = true;
        }
        this.updateZoomBadge(event.transform.k);
        this.requestDraw();
        this.drawMinimapViewport();
      })
      .on('end', () => {
        this._isPanning = false;
        this.requestDraw();
      });

    // Apply drag first so node grabs beat canvas pan
    this.canvasSelection.call(dragBehavior);
    this.canvasSelection.call(this.zoom);

    // 3. Hover Hit-Testing & Background Click Reset
    canvas.addEventListener('mousemove', (event) => {
      if (this._isPanning || event.buttons !== 0) return;
      const [sx, sy] = this.getPointerPos(event);
      const hit = this.findNodeAt(sx, sy);

      if (hit) {
        canvas.style.cursor = 'pointer';
        if (this.hoveredNodeId !== hit.id) {
          this.hoveredNodeId = hit.id;
          this.rebuildHighlightCache(hit);
          this.showTooltip(event, hit);
          this.requestDraw();
        } else {
          this.moveTooltip(event);
        }
      } else {
        canvas.style.cursor = 'grab';
        if (this.hoveredNodeId !== null) {
          this.hoveredNodeId = null;
          this.hideTooltip();
          if (this.selectedNodeId) {
            const selected = this.nodes.find(n => n.id === this.selectedNodeId);
            this.rebuildHighlightCache(selected || null);
          } else {
            this.rebuildHighlightCache(null);
          }
          this.requestDraw();
        }
      }
    });

    canvas.addEventListener('mouseleave', () => {
      if (this.hoveredNodeId !== null) {
        this.hoveredNodeId = null;
        this.hideTooltip();
        if (this.selectedNodeId) {
          const selected = this.nodes.find(n => n.id === this.selectedNodeId);
          this.rebuildHighlightCache(selected || null);
        } else {
          this.rebuildHighlightCache(null);
        }
        this.requestDraw();
      }
    });

    canvas.addEventListener('click', (event) => {
      if (panMoved) return;
      const [sx, sy] = this.getPointerPos(event);
      const hit = this.findNodeAt(sx, sy);
      if (!hit) {
        this.clearHighlight();
        if (typeof this.options.onCanvasClick === 'function') {
          this.options.onCanvasClick();
        }
      }
    });
  }

  resizeCanvasBuffer() {
    if (!this.canvas) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.width = this.container.clientWidth || window.innerWidth;
    this.height = this.container.clientHeight || window.innerHeight;
    this.canvas.width = Math.max(1, Math.round(this.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(this.height * this.dpr));
  }

  getPointerPos(event) {
    const rect = this.canvas.getBoundingClientRect();
    const clientX = event.touches ? event.touches[0].clientX : event.clientX;
    const clientY = event.touches ? event.touches[0].clientY : event.clientY;
    return [clientX - rect.left, clientY - rect.top];
  }

  /**
   * Ultra-fast O(N) pointer hit-test against world node coordinates
   */
  findNodeAt(screenX, screenY) {
    const t = this.currentTransform;
    const wx = (screenX - t.x) / t.k;
    const wy = (screenY - t.y) / t.k;

    // Slight touch/click tolerance inversely scaled when zoomed out
    const pad = Math.min(10, 4 / Math.max(0.25, t.k));

    // Iterate backwards so topmost rendered node wins
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const n = this.nodes[i];
      if (n.x === undefined || n.y === undefined) continue;
      const r = (n._r || 24) + pad;
      const dx = wx - n.x;
      const dy = wy - n.y;
      if (dx * dx + dy * dy <= r * r) {
        return n;
      }
    }
    return null;
  }

  initTooltip() {
    let tooltip = document.getElementById('graph-floating-tooltip');
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'graph-floating-tooltip';
      tooltip.className = 'graph-tooltip-box';
      document.body.appendChild(tooltip);
    }
    this.tooltip = tooltip;
  }

  initMinimap() {
    this.minimapCanvas = document.getElementById('minimap-canvas');
    if (!this.minimapCanvas) return;
    this.minimapCtx = this.minimapCanvas.getContext('2d');

    this._minimapBgCanvas = document.createElement('canvas');
    this._minimapBgCanvas.width = this.minimapCanvas.width;
    this._minimapBgCanvas.height = this.minimapCanvas.height;
    this._minimapBgCtx = this._minimapBgCanvas.getContext('2d');

    const navigateFromEvent = (e) => {
      if (!this._minimapMeta) return;
      const rect = this.minimapCanvas.getBoundingClientRect();
      const clickX = ((e.clientX - rect.left) / rect.width) * this.minimapCanvas.width;
      const clickY = ((e.clientY - rect.top) / rect.height) * this.minimapCanvas.height;

      const { minX, minY, scale } = this._minimapMeta;
      const worldX = clickX / scale + minX;
      const worldY = clickY / scale + minY;

      const k = this.currentTransform.k || 1;
      const transform = d3.zoomIdentity
        .translate(this.width / 2 - worldX * k, this.height / 2 - worldY * k)
        .scale(k);

      this.canvasSelection.transition().duration(300).ease(d3.easeCubicOut).call(this.zoom.transform, transform);
    };

    this.minimapCanvas.addEventListener('click', navigateFromEvent);
  }

  getNodeRadius(node) {
    if (!this.sizeScaleEnabled) {
      if (node.type === 'person') return 22;
      if (node.is_holding) return 30;
      return 25;
    }

    const val = node.val_trillion || 1.0;
    if (node.type === 'person') {
      const minR = 18;
      const maxR = 38;
      const normalized = Math.sqrt(Math.min(val, 20) / 20);
      return minR + normalized * (maxR - minR);
    } else {
      const minR = 20;
      const maxR = 48;
      const normalized = Math.sqrt(Math.min(val, 450) / 450);
      return minR + normalized * (maxR - minR);
    }
  }

  getLinkWidth(link) {
    if (link.type === 'circular') {
      const stake = link.stake || 20;
      return Math.max(7.0, Math.min(18.0, (Math.pow(stake / 100, 0.5) * 8 + 2) * 2));
    }
    if (link.type === 'ownership_corp' || link.type === 'ownership_person' || link.type === 'business_alliance') {
      const stake = link.stake || 5;
      return Math.max(3.0, Math.min(20.0, (Math.pow(stake / 100, 0.55) * 9 + 1.2) * 2));
    }
    if (link.type === 'family') return 5.0;
    if (link.type === 'marriage' || link.type === 'marriage_past') return 4.5;
    return 3.6;
  }

  measureLinkLabels() {
    if (!this.ctx) return;
    this.ctx.save();
    this.ctx.font = '700 9.5px Pretendard, -apple-system, sans-serif';
    for (let i = 0; i < this.links.length; i++) {
      const l = this.links[i];
      const text = l.stake ? `${l.stake}%` : (l.label || '');
      l._labelText = text;
      l._labelW = text ? Math.ceil(this.ctx.measureText(text).width) + 10 : 0;
    }
    this.ctx.restore();
  }

  setData(data, viewMode = 'holistic', options = {}) {
    this.viewMode = viewMode;
    this.nodes = JSON.parse(JSON.stringify(data.nodes || []));
    this.links = JSON.parse(JSON.stringify(data.links || []));
    this.selectedNodeId = null;
    this.hoveredNodeId = null;
    this.highlightedPath = null;
    this._activeNodeIds = null;
    this._activeLinkSet = null;

    this.resizeCanvasBuffer();

    const emptyOverlay = document.getElementById('canvas-empty-state');
    if (emptyOverlay) {
      emptyOverlay.style.display = this.nodes.length === 0 ? 'block' : 'none';
    }

    this.render(options);
  }

  render(options = {}) {
    if (this.simulation) {
      this.simulation.stop();
    }

    const nodes = this.nodes;
    const links = this.links;

    if (nodes.length === 0) {
      this._hasAnimatedLinks = false;
      this.updateMinimap();
      this.requestDraw();
      return;
    }

    // Pre-cache node properties & seed coordinates cleanly by group
    const groupCenters = this.getGroupCenters();
    const cx = this.width / 2;
    const cy = this.height / 2;

    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      n._r = this.getNodeRadius(n);
      n._color = this.getNodeColor(n);
      n._emoji = n.type === 'person' ? '👤' : (n.is_holding ? '👑' : '🏢');
      n._subText = n.val_trillion ? `${n.val_trillion}조` : (n.industry || n.title || '');

      const c = groupCenters.get(n.group) || { x: cx, y: cy };
      const angle = i * 2.39996;
      if (this.viewMode === 'cluster') {
        const rSpread = 25 + (i % 7) * 14;
        n.x = c.x + Math.cos(angle) * rSpread;
        n.y = c.y + Math.sin(angle) * rSpread;
      } else {
        const rSpread = 20 + (i % 6) * 18;
        n.x = cx + (c.x - cx) * 0.45 + Math.cos(angle) * rSpread;
        n.y = cy + (c.y - cy) * 0.45 + Math.sin(angle) * rSpread;
      }
    }

    this._hasAnimatedLinks = false;
    for (let i = 0; i < links.length; i++) {
      const l = links[i];
      l._color = this.getLinkColor(l);
      l._width = this.getLinkWidth(l);
      l._isCircularFlow = !!(l.highlight_loop || l.type === 'circular');
      if (l._isCircularFlow) this._hasAnimatedLinks = true;
    }
    this.measureLinkLabels();

    // Force simulation setup
    this.simulation = d3.forceSimulation(nodes)
      .alphaDecay(0.045)
      .velocityDecay(0.42)
      .force('link', d3.forceLink(links).id(d => d.id).distance(d => {
        if (d.type === 'circular') return 105;
        if (d.type === 'family') return 85;
        if (d.type === 'marriage' || d.type === 'marriage_past') return 105;
        return 125;
      }).strength(0.75))
      .force('charge', d3.forceManyBody().strength(d => -d._r * 22).distanceMax(650))
      .force('center', d3.forceCenter(cx, cy).strength(0.08))
      .force('collide', d3.forceCollide().radius(d => d._r + 18).iterations(2))
      .force('x', d3.forceX(cx).strength(this.viewMode === 'cluster' ? 0.01 : 0.045))
      .force('y', d3.forceY(cy).strength(this.viewMode === 'cluster' ? 0.01 : 0.045));

    if (this.viewMode === 'cluster') {
      this.simulation.force('cluster', this.forceCluster());
    } else {
      this.simulation.force('cluster', null);
    }

    // Offscreen pre-warming so first paint is already cleanly settled
    this.simulation.stop();
    const preTicks = nodes.length > 60 ? 150 : 90;
    for (let i = 0; i < preTicks; i++) {
      this.simulation.tick();
    }

    // Auto-fit entire network into viewport immediately
    if (!options.skipAutoFit) {
      const shouldAnimate = this.hasRenderedOnce;
      this.fitToScreen(shouldAnimate);
    }
    this.hasRenderedOnce = true;

    this._tickCounter = 0;
    this.simulation.on('tick', () => {
      this.requestDraw();
      this._tickCounter++;
      if (this._tickCounter % 5 === 0) {
        this.updateMinimap();
      }
    });

    this.simulation.on('end', () => {
      this.updateMinimap();
      this.requestDraw();
    });

    this.simulation.alpha(0.06).restart();
    this.updateMinimap();
    this.requestDraw();
  }

  requestDraw() {
    this._needsDraw = true;
  }

  /**
   * Master rAF Render Loop:
   * - 60~120fps instant redraw when panning/zooming/simulating
   * - Battery-friendly ~25fps dash animation when completely idle
   */
  startRenderLoop() {
    const loop = (now) => {
      this._rafId = requestAnimationFrame(loop);

      if (this._needsDraw) {
        this._needsDraw = false;
        this.drawFrame(this.ctx, this.width, this.height, this.dpr, this.currentTransform, now);
        this._lastIdleAnimTime = now;
      } else if (this._hasAnimatedLinks && !this._isPanning && (now - this._lastIdleAnimTime) >= 40) {
        // Smooth circular-loop dash flow when idle (~25fps, near-zero CPU)
        this._lastIdleAnimTime = now;
        this.drawFrame(this.ctx, this.width, this.height, this.dpr, this.currentTransform, now);
      }
    };
    this._rafId = requestAnimationFrame(loop);
  }

  /**
   * Core HiDPI GPU-Accelerated 2D Canvas Renderer
   */
  drawFrame(ctx, viewW, viewH, dpr, t, now = performance.now(), fillBgColor = null) {
    if (!ctx) return;

    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const k = t.k;
    const tx = t.x;
    const ty = t.y;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (fillBgColor) {
      ctx.fillStyle = fillBgColor;
      ctx.fillRect(0, 0, viewW, viewH);
    } else {
      ctx.clearRect(0, 0, viewW, viewH);
    }

    if (this.nodes.length === 0) {
      ctx.restore();
      return;
    }

    // Apply camera transform
    ctx.translate(tx, ty);
    ctx.scale(k, k);

    // Viewport frustum bounds in world coordinates (cull off-screen elements!)
    const pad = 160;
    const visLeft = -tx / k - pad;
    const visTop = -ty / k - pad;
    const visRight = (viewW - tx) / k + pad;
    const visBottom = (viewH - ty) / k + pad;

    const isFocusing = !!(this._activeNodeIds || this.highlightedPath);
    const activeNodes = this._activeNodeIds;
    const activeLinks = this._activeLinkSet;
    const isPathMode = !!(this.highlightedPath && this.highlightedPath.found);

    // =========================================================================
    // LAYER 1: Cluster Territories (when in Cluster Mode)
    // =========================================================================
    if (this.viewMode === 'cluster') {
      const centers = this.getGroupCenters();
      const presentGroups = new Set();
      for (let i = 0; i < this.nodes.length; i++) presentGroups.add(this.nodes[i].group);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '800 16px Pretendard, -apple-system, sans-serif';

      centers.forEach((c, key) => {
        if (!presentGroups.has(key)) return;
        if (c.x + 200 < visLeft || c.x - 200 > visRight || c.y + 200 < visTop || c.y - 200 > visBottom) return;

        ctx.save();
        ctx.beginPath();
        ctx.arc(c.x, c.y, 165, 0, Math.PI * 2);
        ctx.fillStyle = c.color;
        ctx.globalAlpha = 0.055;
        ctx.fill();

        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = c.color;
        ctx.lineWidth = 1.6;
        ctx.setLineDash([6, 5]);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.globalAlpha = 0.92;
        ctx.fillStyle = c.color;
        ctx.fillText(c.name, c.x, c.y - 180);
        ctx.restore();
      });
    }

    // =========================================================================
    // LAYER 2: Links & Proportional Arrowheads
    // =========================================================================
    const dashOffset = -(now * 0.036) % 12;
    const arrowOutline = isLight ? '#f8fafc' : '#0b0f19';

    for (let i = 0; i < this.links.length; i++) {
      const l = this.links[i];
      const s = l.source;
      const trg = l.target;
      if (!s || !trg || s.x === undefined || trg.x === undefined) continue;

      // Frustum culling for links
      const minX = s.x < trg.x ? s.x : trg.x;
      const maxX = s.x > trg.x ? s.x : trg.x;
      const minY = s.y < trg.y ? s.y : trg.y;
      const maxY = s.y > trg.y ? s.y : trg.y;
      if (maxX < visLeft || minX > visRight || maxY < visTop || minY > visBottom) continue;

      const sId = s.id;
      const tId = trg.id;
      const linkKey = `${sId}->${tId}`;
      const isActive = !isFocusing || (activeLinks && activeLinks.has(linkKey));

      const dx = trg.x - s.x;
      const dy = trg.y - s.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 1) continue;

      const ux = dx / dist;
      const uy = dy / dist;

      const sourceR = (s._r || 24) + 1;
      const targetR = (trg._r || 24) + 2;
      if (dist <= sourceR + targetR + 2) continue;

      const startX = s.x + ux * sourceR;
      const startY = s.y + uy * sourceR;
      const tipX = trg.x - ux * targetR;
      const tipY = trg.y - uy * targetR;

      const baseWidth = l._width || 4;
      const strokeWidth = (isPathMode && isActive) ? Math.max(8, baseWidth + 3) : baseWidth;
      const strokeColor = (isPathMode && isActive) ? '#38bdf8' : l._color;

      // Proportional arrowhead dimensions (clear, balanced, never oversized)
      const headLen = Math.max(11, Math.min(26, strokeWidth * 2.05));
      const headHalfW = headLen * 0.52;
      const shaftEndX = tipX - ux * (headLen * 0.78);
      const shaftEndY = tipY - uy * (headLen * 0.78);

      ctx.globalAlpha = isActive ? (isFocusing ? 0.96 : 0.78) : 0.05;

      // Draw Shaft
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(shaftEndX, shaftEndY);
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeWidth;
      ctx.lineCap = 'butt';

      if (l._isCircularFlow) {
        ctx.setLineDash([9, 4]);
        ctx.lineDashOffset = dashOffset;
      } else {
        ctx.setLineDash([]);
      }
      ctx.stroke();

      // Draw Proportional Arrowhead Triangle with high-contrast outline
      const baseX = tipX - ux * headLen;
      const baseY = tipY - uy * headLen;
      const perpX = -uy * headHalfW;
      const perpY = ux * headHalfW;

      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(baseX + perpX, baseY + perpY);
      ctx.lineTo(baseX - perpX, baseY - perpY);
      ctx.closePath();
      ctx.fillStyle = strokeColor;
      ctx.fill();
      ctx.strokeStyle = arrowOutline;
      ctx.lineWidth = Math.max(1.0, strokeWidth * 0.14);
      ctx.lineJoin = 'round';
      ctx.stroke();
    }

    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // =========================================================================
    // LAYER 3: Link Percentage Badges (Semantic Zoom LOD or Focus Active)
    // =========================================================================
    const showAllLinkLabels = !isFocusing && k >= 0.55;
    if (showAllLinkLabels || isFocusing) {
      const pillBg = isLight ? 'rgba(255, 255, 255, 0.94)' : 'rgba(11, 15, 25, 0.90)';
      const pillText = isLight ? '#0f172a' : '#f1f5f9';

      ctx.font = '700 9.5px Pretendard, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      for (let i = 0; i < this.links.length; i++) {
        const l = this.links[i];
        if (!l._labelText) continue;
        const s = l.source;
        const trg = l.target;
        if (!s || !trg || s.x === undefined || trg.x === undefined) continue;

        const linkKey = `${s.id}->${trg.id}`;
        if (isFocusing && !(activeLinks && activeLinks.has(linkKey))) continue;

        const mx = (s.x + trg.x) * 0.5;
        const my = (s.y + trg.y) * 0.5;
        if (mx < visLeft || mx > visRight || my < visTop || my > visBottom) continue;

        const pw = l._labelW || 32;
        const ph = 15;
        const rx = mx - pw / 2;
        const ry = my - ph / 2;

        ctx.fillStyle = pillBg;
        ctx.strokeStyle = (isPathMode && activeLinks && activeLinks.has(linkKey)) ? '#38bdf8' : l._color;
        ctx.lineWidth = 1.1;

        this.roundRect(ctx, rx, ry, pw, ph, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = pillText;
        ctx.fillText(l._labelText, mx, my + 0.5);
      }
    }

    // =========================================================================
    // LAYER 4: Nodes (Holding Ring + Circle + Crisp 2x Emoji Sprite + Labels)
    // =========================================================================
    const labelStrokeColor = isLight ? '#f8fafc' : '#090d16';
    const labelFillColor = isLight ? '#0f172a' : '#ffffff';
    const sublabelFillColor = isLight ? '#475569' : '#94a3b8';
    const showSublabels = k >= 0.42;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      if (n.x === undefined || n.y === undefined) continue;
      const r = n._r || 24;

      if (n.x + r + 50 < visLeft || n.x - r - 50 > visRight || n.y + r + 50 < visTop || n.y - r - 50 > visBottom) {
        continue;
      }

      const isActive = !isFocusing || (activeNodes && activeNodes.has(n.id));
      const isSelected = n.id === this.selectedNodeId || n.id === this.hoveredNodeId;

      ctx.globalAlpha = isActive ? 1 : 0.13;

      // Subtle ambient depth halo for active/selected or holding nodes (zero blur cost!)
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + 10, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(56, 189, 248, 0.22)';
        ctx.fill();
      } else if (n.is_holding) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + 9, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(245, 158, 11, 0.12)';
        ctx.fill();
      }

      // Holding Company Gold Dashed Ring
      if (n.is_holding) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + 6, 0, Math.PI * 2);
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2.4;
        ctx.setLineDash([6, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Main Circle Node
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = n._color;
      ctx.fill();

      ctx.strokeStyle = (isPathMode && isActive)
        ? '#38bdf8'
        : isSelected
          ? '#38bdf8'
          : (n.is_holding ? '#fbbf24' : '#ffffff');
      ctx.lineWidth = (isPathMode && isActive) || isSelected ? 4.2 : (n.is_holding ? 3.5 : 2.3);
      ctx.stroke();

      // 2x Boosted Inner Emoji Sprite (Blazingly fast GPU bitmap copy!)
      const sprite = this._emojiSprites[n._emoji];
      if (sprite) {
        const iconSize = Math.max(24, r * 1.15);
        ctx.drawImage(sprite, n.x - iconSize / 2, n.y - iconSize / 2, iconSize, iconSize);
      }

      // Node Name Label (Crisp outlined Korean text)
      const labelY = n.y + r + 14;
      ctx.font = '700 11.5px Pretendard, -apple-system, sans-serif';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3.8;
      ctx.strokeStyle = labelStrokeColor;
      ctx.strokeText(n.name, n.x, labelY);
      ctx.fillStyle = labelFillColor;
      ctx.fillText(n.name, n.x, labelY);

      // Subtitle (Valuation / Role) when zoomed in or focused
      if ((showSublabels || (isFocusing && isActive)) && n._subText) {
        ctx.font = '500 9px Pretendard, -apple-system, sans-serif';
        ctx.fillStyle = sublabelFillColor;
        ctx.fillText(n._subText, n.x, labelY + 13);
      }
    }

    ctx.restore();
  }

  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  updateZoomBadge(k) {
    const pct = Math.round(k * 100);
    if (pct !== this._lastZoomPct) {
      this._lastZoomPct = pct;
      if (!this._zoomBadgeEl) {
        this._zoomBadgeEl = document.getElementById('zoom-level-badge');
      }
      if (this._zoomBadgeEl) {
        this._zoomBadgeEl.textContent = `${pct}%`;
      }
    }
  }

  rebuildHighlightCache(node) {
    if (this.highlightedPath && this.highlightedPath.found) return;

    if (!node) {
      this._activeNodeIds = null;
      this._activeLinkSet = null;
      return;
    }

    const nodeSet = new Set([node.id]);
    const linkSet = new Set();

    for (let i = 0; i < this.links.length; i++) {
      const l = this.links[i];
      const sId = typeof l.source === 'object' ? l.source.id : l.source;
      const tId = typeof l.target === 'object' ? l.target.id : l.target;
      if (sId === node.id || tId === node.id) {
        nodeSet.add(sId);
        nodeSet.add(tId);
        linkSet.add(`${sId}->${tId}`);
      }
    }

    this._activeNodeIds = nodeSet;
    this._activeLinkSet = linkSet;
  }

  fitToScreen(animate = true, padding = 52) {
    if (!this.nodes || this.nodes.length === 0) return;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      if (n.x === undefined || n.y === undefined) continue;
      const r = (n._r || 28) + 28;
      if (n.x - r < minX) minX = n.x - r;
      if (n.x + r > maxX) maxX = n.x + r;
      if (n.y - r < minY) minY = n.y - r;
      if (n.y + r + 14 > maxY) maxY = n.y + r + 14;
    }

    if (this.viewMode === 'cluster') {
      const centers = this.getGroupCenters();
      const presentGroups = new Set(this.nodes.map(n => n.group));
      centers.forEach((c, key) => {
        if (presentGroups.has(key)) {
          if (c.x - 175 < minX) minX = c.x - 175;
          if (c.x + 175 > maxX) maxX = c.x + 175;
          if (c.y - 195 < minY) minY = c.y - 195;
          if (c.y + 175 > maxY) maxY = c.y + 175;
        }
      });
    }

    if (!isFinite(minX) || !isFinite(maxX)) return;

    const boundsW = Math.max(120, maxX - minX);
    const boundsH = Math.max(120, maxY - minY);
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;

    const topMargin = 62;
    const bottomMargin = 78;
    const availW = Math.max(200, this.width - padding * 2);
    const availH = Math.max(200, this.height - topMargin - bottomMargin);

    const rawScale = Math.min(availW / boundsW, availH / boundsH);
    const scale = Math.max(0.10, Math.min(1.15, rawScale * 0.94));

    const targetCenterY = topMargin + availH / 2;
    const tx = this.width / 2 - midX * scale;
    const ty = targetCenterY - midY * scale;

    const transform = d3.zoomIdentity.translate(tx, ty).scale(scale);

    if (animate) {
      this.canvasSelection.transition()
        .duration(600)
        .ease(d3.easeCubicOut)
        .call(this.zoom.transform, transform);
    } else {
      this.canvasSelection.call(this.zoom.transform, transform);
    }
  }

  fitToNodes(nodeIds, animate = true) {
    const idSet = new Set(nodeIds);
    const subset = this.nodes.filter(n => idSet.has(n.id) && n.x !== undefined);
    if (subset.length === 0) return;

    if (subset.length === 1) {
      this.focusOnNode(subset[0].id, 1.25);
      return;
    }

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    subset.forEach(n => {
      const r = (n._r || 28) + 45;
      if (n.x - r < minX) minX = n.x - r;
      if (n.x + r > maxX) maxX = n.x + r;
      if (n.y - r < minY) minY = n.y - r;
      if (n.y + r > maxY) maxY = n.y + r;
    });

    const boundsW = Math.max(200, maxX - minX);
    const boundsH = Math.max(200, maxY - minY);
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;

    const availW = Math.max(200, this.width - 140);
    const availH = Math.max(200, this.height - 180);
    const scale = Math.max(0.25, Math.min(1.25, Math.min(availW / boundsW, availH / boundsH) * 0.88));

    const transform = d3.zoomIdentity
      .translate(this.width / 2 - midX * scale, this.height / 2 - midY * scale)
      .scale(scale);

    if (animate) {
      this.canvasSelection.transition().duration(600).ease(d3.easeCubicOut).call(this.zoom.transform, transform);
    } else {
      this.canvasSelection.call(this.zoom.transform, transform);
    }
  }

  showTooltip(event, node) {
    if (!this.tooltip) return;

    const roleText = node.title || node.industry || node.role || '';
    const valText = node.val_trillion ? `자산/가치: 약 ${node.val_trillion}조 원` : '';
    const groupName = this.getGroupDisplayName(node.group);

    this.tooltip.innerHTML = `
      <div class="tooltip-header">
        <span class="tooltip-badge" style="background:${this.getNodeColor(node)};">${groupName}</span>
        <strong>${node.name}</strong>
      </div>
      <div class="tooltip-sub">${roleText}</div>
      ${valText ? `<div class="tooltip-val">${valText}</div>` : ''}
      <div class="tooltip-desc">${node.desc ? (node.desc.length > 80 ? node.desc.slice(0, 80) + '...' : node.desc) : ''}</div>
    `;
    this.tooltip.style.display = 'block';
    this.moveTooltip(event);
  }

  moveTooltip(event) {
    if (!this.tooltip) return;
    const pad = 16;
    const tipW = this.tooltip.offsetWidth || 260;
    const tipH = this.tooltip.offsetHeight || 120;

    let x = event.clientX + 14;
    let y = event.clientY + 14;

    if (x + tipW + pad > window.innerWidth) {
      x = Math.max(pad, event.clientX - tipW - 14);
    }
    if (y + tipH + pad > window.innerHeight) {
      y = Math.max(pad, event.clientY - tipH - 14);
    }

    this.tooltip.style.left = `${x}px`;
    this.tooltip.style.top = `${y}px`;
  }

  hideTooltip() {
    if (this.tooltip) {
      this.tooltip.style.display = 'none';
    }
  }

  updateMinimap() {
    if (!this.minimapCanvas || !this._minimapBgCtx) return;
    const bgCtx = this._minimapBgCtx;
    const w = this._minimapBgCanvas.width;
    const h = this._minimapBgCanvas.height;

    bgCtx.clearRect(0, 0, w, h);

    if (this.nodes.length === 0) {
      this._minimapMeta = null;
      this.minimapCtx.clearRect(0, 0, w, h);
      return;
    }

    const isLight = document.documentElement.getAttribute('data-theme') === 'light';

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    }

    const padding = 120;
    minX -= padding; maxX += padding;
    minY -= padding; maxY += padding;

    const dataW = Math.max(100, maxX - minX);
    const dataH = Math.max(100, maxY - minY);
    const scale = Math.min(w / dataW, h / dataH);

    const offsetX = (w - dataW * scale) / 2;
    const offsetY = (h - dataH * scale) / 2;
    const effectiveMinX = minX - offsetX / scale;
    const effectiveMinY = minY - offsetY / scale;
    this._minimapMeta = { minX: effectiveMinX, minY: effectiveMinY, scale };

    const mapX = (x) => (x - effectiveMinX) * scale;
    const mapY = (y) => (y - effectiveMinY) * scale;

    bgCtx.strokeStyle = isLight ? 'rgba(15, 23, 42, 0.16)' : 'rgba(255, 255, 255, 0.15)';
    bgCtx.lineWidth = 0.8;
    bgCtx.beginPath();
    for (let i = 0; i < this.links.length; i++) {
      const l = this.links[i];
      if (l.source.x !== undefined && l.target.x !== undefined) {
        bgCtx.moveTo(mapX(l.source.x), mapY(l.source.y));
        bgCtx.lineTo(mapX(l.target.x), mapY(l.target.y));
      }
    }
    bgCtx.stroke();

    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      if (n.x !== undefined && n.y !== undefined) {
        bgCtx.fillStyle = n._color || this.getNodeColor(n);
        bgCtx.beginPath();
        bgCtx.arc(mapX(n.x), mapY(n.y), n.is_holding ? 3 : 1.8, 0, 2 * Math.PI);
        bgCtx.fill();
      }
    }

    this.drawMinimapViewport();
    this.requestDraw();
  }

  drawMinimapViewport() {
    if (!this.minimapCanvas || !this.minimapCtx || !this._minimapMeta || !this._minimapBgCanvas) return;
    const ctx = this.minimapCtx;
    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(this._minimapBgCanvas, 0, 0);

    const { minX, minY, scale } = this._minimapMeta;
    const t = this.currentTransform;
    const viewLeft = -t.x / t.k;
    const viewTop = -t.y / t.k;
    const viewRight = (this.width - t.x) / t.k;
    const viewBottom = (this.height - t.y) / t.k;

    const vx = (viewLeft - minX) * scale;
    const vy = (viewTop - minY) * scale;
    const vw = (viewRight - viewLeft) * scale;
    const vh = (viewBottom - viewTop) * scale;

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.fillStyle = 'rgba(56, 189, 248, 0.14)';
    ctx.fillRect(vx, vy, vw, vh);
    ctx.strokeRect(vx, vy, vw, vh);
  }

  getGroupDisplayName(group) {
    const names = {
      'samsung': '삼성그룹',
      'sk': 'SK그룹',
      'hyundai_motor': '현대자동차그룹',
      'hd_hyundai': 'HD현대그룹',
      'lg': 'LG그룹',
      'gs': 'GS그룹',
      'ls': 'LS그룹',
      'lotte': '롯데그룹',
      'hanwha': '한화그룹',
      'shinsegae': '신세계그룹',
      'cj': 'CJ그룹',
      'hanjin': '한진그룹',
      'hoban': '호반그룹',
      'doosan': '두산그룹',
      'hyosung': '효성그룹',
      'celltrion': '셀트리온',
      'naver': '네이버',
      'kakao': '카카오',
      'tech_giants': '빅테크·엔터',
      'inlaw_alliances': '정·재계 혼맥'
    };
    return names[group] || (group ? group.toUpperCase() : '기타');
  }

  getGroupCenters() {
    const groupList = Object.keys(this.groupColors).filter(g => g !== 'default');
    const totalGroups = groupList.length;
    const centerX = this.width / 2;
    const centerY = this.height / 2;
    const radius = Math.max(620, Math.min(this.width, this.height) * 0.62);
    const centers = new Map();

    groupList.forEach((group, index) => {
      const angle = (2 * Math.PI * index) / totalGroups - Math.PI / 2;
      centers.set(group, {
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
        name: this.getGroupDisplayName(group),
        color: this.groupColors[group] || '#64748b'
      });
    });

    return centers;
  }

  forceCluster() {
    const centers = this.getGroupCenters();
    const centerX = this.width / 2;
    const centerY = this.height / 2;

    return (alpha) => {
      for (let i = 0; i < this.nodes.length; i++) {
        const node = this.nodes[i];
        const center = centers.get(node.group) || { x: centerX, y: centerY };
        node.vx += (center.x - node.x) * 0.22 * alpha;
        node.vy += (center.y - node.y) * 0.22 * alpha;
      }
    };
  }

  getNodeColor(node) {
    return this.groupColors[node.group] || this.groupColors['default'];
  }

  getLinkColor(d) {
    if (d.type === 'circular') return '#f43f5e';
    if (d.type === 'family') return '#a855f7';
    if (d.type === 'marriage' || d.type === 'marriage_past') return '#ec4899';
    if (d.type === 'ownership_corp' || d.type === 'ownership_person' || d.type === 'business_alliance') return '#3b82f6';
    return '#64748b';
  }

  selectNode(nodeOrId, autoFocus = true, triggerCallback = true) {
    const id = typeof nodeOrId === 'string' ? nodeOrId : (nodeOrId && nodeOrId.id);
    if (!id) return;

    const liveNode = this.nodes.find(n => n.id === id);
    this.selectedNodeId = id;
    this.highlightedPath = null;

    if (liveNode) {
      this.rebuildHighlightCache(liveNode);
      this.requestDraw();
      if (autoFocus && liveNode.x !== undefined) {
        this.focusOnNode(id, Math.max(1.15, this.currentTransform.k));
      }
    }

    if (triggerCallback && typeof this.onNodeClick === 'function') {
      this.onNodeClick(liveNode || nodeOrId);
    }
  }

  focusOnNode(nodeId, scale = 1.25) {
    const node = this.nodes.find(n => n.id === nodeId);
    if (!node || node.x === undefined || node.y === undefined) return;

    const targetScale = Math.min(2.2, Math.max(0.85, scale));
    this.selectedNodeId = node.id;
    this.rebuildHighlightCache(node);
    this.requestDraw();

    const transform = d3.zoomIdentity
      .translate(this.width / 2 - node.x * targetScale, this.height / 2 - node.y * targetScale)
      .scale(targetScale);

    this.canvasSelection.transition()
      .duration(600)
      .ease(d3.easeCubicOut)
      .call(this.zoom.transform, transform);
  }

  highlightPath(pathResult) {
    this.highlightedPath = pathResult;

    if (!pathResult || !pathResult.found) {
      this.clearHighlight();
      return;
    }

    const pathNodeSet = new Set(pathResult.nodeIds);
    const pathLinkPairSet = new Set();

    for (let i = 0; i < pathResult.nodeIds.length - 1; i++) {
      const u = pathResult.nodeIds[i];
      const v = pathResult.nodeIds[i + 1];
      pathLinkPairSet.add(`${u}->${v}`);
      pathLinkPairSet.add(`${v}->${u}`);
    }

    this._activeNodeIds = pathNodeSet;
    this._activeLinkSet = pathLinkPairSet;
    this.requestDraw();
    this.fitToNodes(pathResult.nodeIds, true);
  }

  clearHighlight() {
    this.highlightedPath = null;
    this.selectedNodeId = null;
    this.hoveredNodeId = null;
    this._activeNodeIds = null;
    this._activeLinkSet = null;
    this.requestDraw();
  }

  zoomIn() {
    this.canvasSelection.transition().duration(240).ease(d3.easeCubicOut).call(this.zoom.scaleBy, 1.35);
  }

  zoomOut() {
    this.canvasSelection.transition().duration(240).ease(d3.easeCubicOut).call(this.zoom.scaleBy, 0.72);
  }

  resetZoom() {
    this.fitToScreen(true);
  }

  /**
   * High-Resolution 2x PNG Snapshot directly from Canvas 2D renderer
   */
  exportPNG() {
    const exportScale = 2;
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = Math.round(this.width * exportScale);
    exportCanvas.height = Math.round(this.height * exportScale);
    const exportCtx = exportCanvas.getContext('2d');
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';

    this.drawFrame(
      exportCtx,
      this.width,
      this.height,
      exportScale,
      this.currentTransform,
      performance.now(),
      isLight ? '#f8fafc' : '#0b0f19'
    );

    const a = document.createElement('a');
    a.download = `korean_conglomerate_network_${Date.now()}.png`;
    a.href = exportCanvas.toDataURL('image/png');
    a.click();
  }

  initResizeObserver() {
    const handleResize = () => {
      const nextW = this.container.clientWidth;
      const nextH = this.container.clientHeight;
      if (!nextW || !nextH) return;
      if (Math.abs(nextW - this.width) < 2 && Math.abs(nextH - this.height) < 2) return;

      this.resizeCanvasBuffer();
      this.drawMinimapViewport();
      this.requestDraw();
    };

    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(handleResize);
      this._resizeObserver.observe(this.container);
    } else {
      window.addEventListener('resize', handleResize);
    }
  }
}
