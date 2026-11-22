/**
 * 대한민국 대기업 네트워크 - D3.js 고도화 포스 레이아웃 시각화 엔진 (v3.0 High-Performance UX)
 * 프리워밍(Pre-warming) 무버벅 로딩, 자동 화면 맞춤(Fit-to-Screen), 시맨틱 줌(LOD), 클릭 이동 미니맵 지원
 */

export class NetworkGraph {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.options = options;
    this.width = this.container.clientWidth || window.innerWidth;
    this.height = this.container.clientHeight || window.innerHeight;

    this.nodes = [];
    this.links = [];
    this.svg = null;
    this.g = null;
    this.simulation = null;
    this.zoom = null;
    this.currentTransform = d3.zoomIdentity;

    this.selectedNodeId = null;
    this.hoveredNodeId = null;
    this.highlightedPath = null;
    this.viewMode = 'holistic';
    this.sizeScaleEnabled = true;
    this.hasRenderedOnce = false;
    this._minimapMeta = null;
    this._tickCounter = 0;

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

    this.initSVG();
    this.initTooltip();
    this.initMinimap();
    this.initResizeObserver();
  }

  initSVG() {
    this.container.innerHTML = '';

    this.svg = d3.select(this.container)
      .append('svg')
      .attr('id', 'network-svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', [0, 0, this.width, this.height]);

    const defs = this.svg.append('defs');

    // Dynamic marker generator: crisp, stroke-proportional arrowheads
    const createMarker = (id, color) => {
      defs.append('marker')
        .attr('id', id)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 7)
        .attr('refY', 0)
        .attr('markerUnits', 'strokeWidth')
        .attr('markerWidth', 5.5)
        .attr('markerHeight', 5.5)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-3.5L7,0L0,3.5Z')
        .attr('fill', color)
        .attr('stroke', '#0b0f19')
        .attr('stroke-width', 0.6);
    };

    createMarker('arrow-ownership', '#3b82f6');
    createMarker('arrow-circular', '#f43f5e');
    createMarker('arrow-family', '#a855f7');
    createMarker('arrow-marriage', '#ec4899');
    createMarker('arrow-highlight', '#38bdf8');

    // Main Graph Container
    this.g = this.svg.append('g').attr('class', 'main-graph-group');

    // Layer groups for precise z-indexing
    this.clusterLayer = this.g.append('g').attr('class', 'cluster-layer');
    this.linkLayer = this.g.append('g').attr('class', 'link-layer');
    this.linkLabelLayer = this.g.append('g').attr('class', 'link-label-layer');
    this.nodeLayer = this.g.append('g').attr('class', 'node-layer');

    // Zoom & Pan Behavior (Wide zoom range so huge networks fit effortlessly)
    this.zoom = d3.zoom()
      .scaleExtent([0.08, 4.0])
      .on('zoom', (event) => {
        this.currentTransform = event.transform;
        this.g.attr('transform', event.transform);
        this.applySemanticZoom(event.transform.k);
        this.updateMinimap();
      });

    this.svg.call(this.zoom);

    // Canvas background click resets selection
    this.svg.on('click', (event) => {
      if (event.target === this.svg.node()) {
        this.clearHighlight();
        if (typeof this.options.onCanvasClick === 'function') {
          this.options.onCanvasClick();
        }
      }
    });
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

    // Interactive click-to-pan on minimap
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

      this.svg.transition().duration(300).ease(d3.easeCubicOut).call(this.zoom.transform, transform);
    };

    this.minimapCanvas.addEventListener('click', navigateFromEvent);
  }

  /**
   * Calculate node radius proportional to asset / market cap ($A \propto \text{Value}$)
   */
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

  /**
   * Calculate link stroke width based on stake percentage (0% ~ 100%) - 2x Boosted
   */
  getLinkWidth(link) {
    if (link.type === 'circular') {
      const stake = link.stake || 20;
      return Math.max(7.0, Math.min(18.0, (Math.pow(stake / 100, 0.5) * 8 + 2) * 2));
    }
    if (link.type === 'ownership_corp' || link.type === 'ownership_person') {
      const stake = link.stake || 5;
      return Math.max(3.0, Math.min(20.0, (Math.pow(stake / 100, 0.55) * 9 + 1.2) * 2));
    }
    if (link.type === 'family') return 5.0;
    if (link.type === 'marriage' || link.type === 'marriage_past') return 4.5;
    return 3.6;
  }

  setData(data, viewMode = 'holistic', options = {}) {
    this.viewMode = viewMode;
    this.nodes = JSON.parse(JSON.stringify(data.nodes || []));
    this.links = JSON.parse(JSON.stringify(data.links || []));
    this.selectedNodeId = null;
    this.hoveredNodeId = null;
    this.highlightedPath = null;

    // Refresh canvas dimensions accurately before layout
    this.width = this.container.clientWidth || window.innerWidth;
    this.height = this.container.clientHeight || window.innerHeight;
    this.svg.attr('viewBox', [0, 0, this.width, this.height]);

    // Toggle Empty State overlay
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

    // Pre-cache radii & seed initial coordinates near cluster/group centers for fast, low-tangle convergence
    const groupCenters = this.getGroupCenters();
    const cx = this.width / 2;
    const cy = this.height / 2;

    nodes.forEach((n, i) => {
      n._r = this.getNodeRadius(n);
      if (this.viewMode === 'cluster') {
        const c = groupCenters.get(n.group) || { x: cx, y: cy };
        const angle = (i * 2.39996); // golden angle spread
        const rSpread = 25 + (i % 7) * 14;
        n.x = c.x + Math.cos(angle) * rSpread;
        n.y = c.y + Math.sin(angle) * rSpread;
      } else {
        // Group-seeded gentle radial layout prevents chaotic tangle on tick 0
        const c = groupCenters.get(n.group) || { x: cx, y: cy };
        const angle = (i * 2.39996);
        const rSpread = 20 + (i % 6) * 18;
        n.x = cx + (c.x - cx) * 0.45 + Math.cos(angle) * rSpread;
        n.y = cy + (c.y - cy) * 0.45 + Math.sin(angle) * rSpread;
      }
    });

    // Clear existing SVG elements when empty
    if (nodes.length === 0) {
      this.clusterLayer.selectAll('*').remove();
      this.linkLayer.selectAll('*').remove();
      this.linkLabelLayer.selectAll('*').remove();
      this.nodeLayer.selectAll('*').remove();
      this.updateMinimap();
      return;
    }

    // Force simulation setup (tuned for crisp spacing & fast settling)
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
      this.renderClusterBackgrounds();
    } else {
      this.simulation.force('cluster', null);
      if (this.clusterLayer) {
        this.clusterLayer.selectAll('*').remove();
      }
    }

    // --- Pre-warm Simulation Synchronously Offscreen (Eliminates Initial Explosion Stutter!) ---
    this.simulation.stop();
    const preTicks = nodes.length > 60 ? 150 : 90;
    for (let i = 0; i < preTicks; i++) {
      this.simulation.tick();
    }

    // --- Render Links ---
    const linkGroup = this.linkLayer.selectAll('g.link-group')
      .data(links, d => `${d.source.id || d.source}-${d.target.id || d.target}-${d.type}`);

    linkGroup.exit().remove();

    const linkEnter = linkGroup.enter().append('g')
      .attr('class', 'link-group');

    linkEnter.append('path')
      .attr('fill', 'none');

    const linkElements = linkEnter.merge(linkGroup);
    const linkPaths = linkElements.select('path')
      .attr('class', d => `network-link ${d.type} ${d.highlight_loop ? 'circular-flow-edge' : ''}`)
      .attr('stroke', d => this.getLinkColor(d))
      .attr('stroke-width', d => this.getLinkWidth(d))
      .attr('marker-end', d => this.getMarkerEnd(d));

    // --- Render Link Labels (Badge pill) ---
    const labelGroup = this.linkLabelLayer.selectAll('g.link-label-group')
      .data(links.filter(l => l.stake || l.label), d => `${d.source.id || d.source}-${d.target.id || d.target}-${d.type}`);

    labelGroup.exit().remove();

    const labelEnter = labelGroup.enter().append('g')
      .attr('class', 'link-label-group');

    labelEnter.append('rect')
      .attr('class', 'link-label-bg')
      .attr('rx', 4)
      .attr('ry', 4)
      .attr('fill', 'rgba(11, 15, 25, 0.88)')
      .attr('stroke', d => this.getLinkColor(d))
      .attr('stroke-width', 1);

    labelEnter.append('text')
      .attr('class', 'link-label-text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('font-size', '9.5px')
      .attr('font-weight', '700')
      .attr('fill', '#f1f5f9')
      .text(d => d.stake ? `${d.stake}%` : (d.label || ''));

    const labelElements = labelEnter.merge(labelGroup);
    labelElements.select('text').text(d => d.stake ? `${d.stake}%` : (d.label || ''));
    labelElements.each(function() {
      const group = d3.select(this);
      const textNode = group.select('text').node();
      if (textNode) {
        const bbox = textNode.getBBox();
        group.select('rect')
          .attr('x', bbox.x - 4)
          .attr('y', bbox.y - 2)
          .attr('width', bbox.width + 8)
          .attr('height', bbox.height + 4);
      }
    });

    // --- Render Nodes (Zero expensive SVG blur/shadow filters -> 60fps silky smooth!) ---
    const nodeGroup = this.nodeLayer.selectAll('g.node-group')
      .data(nodes, d => d.id);

    nodeGroup.exit().remove();

    const nodeEnter = nodeGroup.enter().append('g')
      .attr('class', d => `node-group node-${d.type} ${d.is_holding ? 'is-holding' : ''}`)
      .call(this.drag(this.simulation))
      .on('click', (event, d) => {
        event.stopPropagation();
        this.selectNode(d, true);
      })
      .on('mouseenter', (event, d) => {
        this.hoveredNodeId = d.id;
        this.handleNodeHover(d, true);
        this.showTooltip(event, d);
      })
      .on('mousemove', (event) => {
        this.moveTooltip(event);
      })
      .on('mouseleave', () => {
        this.hoveredNodeId = null;
        this.hideTooltip();
        if (this.selectedNodeId) {
          const selected = this.nodes.find(n => n.id === this.selectedNodeId);
          if (selected) {
            this.handleNodeHover(selected, true);
            return;
          }
        }
        this.handleNodeHover(null, false);
      });

    // Crisp Gold Outer Ring for Holding Companies (No expensive feGaussianBlur filter)
    nodeEnter.filter(d => d.is_holding)
      .append('circle')
      .attr('class', 'holding-aura-ring')
      .attr('r', d => d._r + 6)
      .attr('fill', 'none')
      .attr('stroke', '#f59e0b')
      .attr('stroke-width', 2.5)
      .attr('stroke-dasharray', '6,3')
      .attr('opacity', 0.85);

    // Main Circle Node
    nodeEnter.append('circle')
      .attr('class', 'node-shape')
      .attr('r', d => d._r)
      .attr('fill', d => this.getNodeColor(d))
      .attr('stroke', d => d.is_holding ? '#fbbf24' : '#ffffff')
      .attr('stroke-width', d => d.is_holding ? 3.5 : 2.2);

    // Inner Icon / Emoji (2x boosted size)
    nodeEnter.append('text')
      .attr('class', 'node-icon')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('dy', '0.05em')
      .attr('font-size', d => `${Math.max(22, d._r * 1.05)}px`)
      .attr('pointer-events', 'none')
      .text(d => {
        if (d.type === 'person') return '👤';
        if (d.is_holding) return '👑';
        return '🏢';
      });

    // Node Title Label (Below)
    const textGroup = nodeEnter.append('g')
      .attr('class', 'node-label-wrap')
      .attr('transform', d => `translate(0, ${d._r + 14})`);

    textGroup.append('text')
      .attr('class', 'node-label-bg')
      .attr('text-anchor', 'middle')
      .attr('stroke', '#090d16')
      .attr('stroke-width', 4)
      .attr('stroke-linejoin', 'round')
      .attr('font-size', '11.5px')
      .attr('font-weight', '700')
      .text(d => d.name);

    textGroup.append('text')
      .attr('class', 'node-label')
      .attr('text-anchor', 'middle')
      .attr('fill', '#ffffff')
      .attr('font-size', '11.5px')
      .attr('font-weight', '700')
      .text(d => d.name);

    // Subtitle (Valuation / Stake / Role)
    textGroup.append('text')
      .attr('class', 'node-sublabel')
      .attr('text-anchor', 'middle')
      .attr('y', 13)
      .attr('fill', '#94a3b8')
      .attr('font-size', '9px')
      .attr('font-weight', '500')
      .text(d => d.val_trillion ? `${d.val_trillion}조` : (d.industry || d.title || ''));

    const nodeElements = nodeEnter.merge(nodeGroup);

    // Update dynamic radii if sizeScaleEnabled changed
    nodeElements.select('circle.node-shape').attr('r', d => d._r);
    nodeElements.select('circle.holding-aura-ring').attr('r', d => d._r + 6);
    nodeElements.select('.node-label-wrap').attr('transform', d => `translate(0, ${d._r + 14})`);
    nodeElements.select('.node-icon')
      .attr('font-size', d => `${Math.max(22, d._r * 1.05)}px`)
      .attr('dominant-baseline', 'central')
      .attr('dy', '0.05em');

    // Helper to paint current coordinates to DOM
    const updatePositions = () => {
      linkPaths.attr('d', d => {
        const sx = d.source.x, sy = d.source.y;
        const tx = d.target.x, ty = d.target.y;
        const dx = tx - sx, dy = ty - sy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist === 0) return `M${sx},${sy}L${tx},${ty}`;

        const sourceR = (d.source._r || 24) + 1;
        const targetR = (d.target._r || 24) + 2;

        const startX = sx + (dx * sourceR) / dist;
        const startY = sy + (dy * sourceR) / dist;
        const endX = tx - (dx * targetR) / dist;
        const endY = ty - (dy * targetR) / dist;

        return `M${startX},${startY}L${endX},${endY}`;
      });

      labelElements.attr('transform', d => {
        const x = (d.source.x + d.target.x) / 2;
        const y = (d.source.y + d.target.y) / 2;
        return `translate(${x},${y})`;
      });

      nodeElements.attr('transform', d => `translate(${d.x},${d.y})`);
    };

    // Paint settled pre-warmed positions immediately!
    updatePositions();

    // Auto-fit entire network into viewport so 100% is visible immediately!
    if (!options.skipAutoFit) {
      const shouldAnimate = this.hasRenderedOnce;
      this.fitToScreen(shouldAnimate);
    }
    this.hasRenderedOnce = true;

    // Gentle live settling ticks (throttled minimap updates)
    this._tickCounter = 0;
    this.simulation.on('tick', () => {
      updatePositions();
      this._tickCounter++;
      if (this._tickCounter % 4 === 0) {
        this.updateMinimap();
      }
    });

    this.simulation.on('end', () => {
      this.updateMinimap();
    });

    // Very soft residual motion to feel alive without jank
    this.simulation.alpha(0.06).restart();
    this.updateMinimap();
  }

  /**
   * Automatically fits the ENTIRE visible network inside the canvas with comfortable margins
   */
  fitToScreen(animate = true, padding = 52) {
    if (!this.nodes || this.nodes.length === 0) return;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    this.nodes.forEach(n => {
      if (n.x === undefined || n.y === undefined) return;
      const r = (n._r || 28) + 28; // Include label clearance
      if (n.x - r < minX) minX = n.x - r;
      if (n.x + r > maxX) maxX = n.x + r;
      if (n.y - r < minY) minY = n.y - r;
      if (n.y + r + 14 > maxY) maxY = n.y + r + 14;
    });

    // Include cluster background rings if in cluster mode
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

    // Reserve visual breathing room for search bar (top) & legend bar (bottom)
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
      this.svg.transition()
        .duration(650)
        .ease(d3.easeCubicOut)
        .call(this.zoom.transform, transform);
    } else {
      this.svg.call(this.zoom.transform, transform);
    }
  }

  /**
   * Smoothly frame a specific subset of nodes (e.g. Path Finder result)
   */
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
      this.svg.transition().duration(650).ease(d3.easeCubicOut).call(this.zoom.transform, transform);
    } else {
      this.svg.call(this.zoom.transform, transform);
    }
  }

  /**
   * Semantic Zoom (Level of Detail): keep wide overviews ultra-clean, show fine labels when zoomed in
   */
  applySemanticZoom(k) {
    const badge = document.getElementById('zoom-level-badge');
    if (badge) {
      badge.textContent = `${Math.round(k * 100)}%`;
    }

    // Do not override visibility if user is actively inspecting a node or path
    if (this.hoveredNodeId || this.selectedNodeId || this.highlightedPath) {
      return;
    }

    const showLinkLabels = k >= 0.55;
    const showSublabels = k >= 0.42;

    if (this.linkLabelLayer) {
      this.linkLabelLayer.selectAll('g.link-label-group')
        .style('opacity', showLinkLabels ? 1 : 0)
        .style('pointer-events', showLinkLabels ? 'auto' : 'none');
    }

    if (this.nodeLayer) {
      this.nodeLayer.selectAll('text.node-sublabel')
        .style('opacity', showSublabels ? 1 : 0);
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
    if (!this.minimapCanvas || !this.minimapCtx) return;
    const ctx = this.minimapCtx;
    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;

    ctx.clearRect(0, 0, w, h);

    if (this.nodes.length === 0) {
      this._minimapMeta = null;
      return;
    }

    const isLight = document.documentElement.getAttribute('data-theme') === 'light';

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    this.nodes.forEach(n => {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    });

    const padding = 120;
    minX -= padding; maxX += padding;
    minY -= padding; maxY += padding;

    const dataW = Math.max(100, maxX - minX);
    const dataH = Math.max(100, maxY - minY);
    const scale = Math.min(w / dataW, h / dataH);

    // Center drawing in minimap
    const offsetX = (w - dataW * scale) / 2;
    const offsetY = (h - dataH * scale) / 2;
    this._minimapMeta = { minX: minX - offsetX / scale, minY: minY - offsetY / scale, scale };

    const mapX = (x) => (x - minX) * scale + offsetX;
    const mapY = (y) => (y - minY) * scale + offsetY;

    // Draw Links on Minimap
    ctx.strokeStyle = isLight ? 'rgba(15, 23, 42, 0.16)' : 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    this.links.forEach(l => {
      if (l.source.x !== undefined && l.target.x !== undefined) {
        ctx.moveTo(mapX(l.source.x), mapY(l.source.y));
        ctx.lineTo(mapX(l.target.x), mapY(l.target.y));
      }
    });
    ctx.stroke();

    // Draw Nodes on Minimap
    this.nodes.forEach(n => {
      if (n.x !== undefined && n.y !== undefined) {
        ctx.fillStyle = this.getNodeColor(n);
        ctx.beginPath();
        ctx.arc(mapX(n.x), mapY(n.y), n.is_holding ? 3 : 1.8, 0, 2 * Math.PI);
        ctx.fill();
      }
    });

    // Draw Viewport Box
    const t = this.currentTransform;
    const viewLeft = -t.x / t.k;
    const viewTop = -t.y / t.k;
    const viewRight = (this.width - t.x) / t.k;
    const viewBottom = (this.height - t.y) / t.k;

    const vx = mapX(viewLeft);
    const vy = mapY(viewTop);
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
      for (const node of this.nodes) {
        const center = centers.get(node.group) || { x: centerX, y: centerY };
        node.vx += (center.x - node.x) * 0.22 * alpha;
        node.vy += (center.y - node.y) * 0.22 * alpha;
      }
    };
  }

  renderClusterBackgrounds() {
    if (!this.clusterLayer) return;
    this.clusterLayer.selectAll('*').remove();

    const centers = this.getGroupCenters();
    const presentGroups = new Set(this.nodes.map(n => n.group));
    const activeCenters = Array.from(centers.entries()).filter(([key]) => presentGroups.has(key));

    const clusterGroup = this.clusterLayer.selectAll('g.cluster-group')
      .data(activeCenters, d => d[0])
      .enter()
      .append('g')
      .attr('class', 'cluster-group')
      .attr('transform', d => `translate(${d[1].x}, ${d[1].y})`)
      .attr('pointer-events', 'none');

    // Soft ambient zone circle for each active group cluster
    clusterGroup.append('circle')
      .attr('r', 165)
      .attr('fill', d => d[1].color)
      .attr('opacity', 0.05)
      .attr('stroke', d => d[1].color)
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '5,5')
      .attr('stroke-opacity', 0.35);

    // Group territory title
    clusterGroup.append('text')
      .attr('text-anchor', 'middle')
      .attr('y', -180)
      .attr('fill', d => d[1].color)
      .attr('font-size', '16px')
      .attr('font-weight', '800')
      .attr('opacity', 0.92)
      .attr('letter-spacing', '0.04em')
      .text(d => d[1].name);
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

  getMarkerEnd(d) {
    if (d.type === 'circular') return 'url(#arrow-circular)';
    if (d.type === 'family') return 'url(#arrow-family)';
    if (d.type === 'marriage' || d.type === 'marriage_past') return 'url(#arrow-marriage)';
    if (d.type === 'ownership_corp' || d.type === 'ownership_person' || d.type === 'business_alliance') return 'url(#arrow-ownership)';
    return 'url(#arrow-ownership)';
  }

  // Hover & Selection highlighting
  handleNodeHover(node, isHovering) {
    if (this.highlightedPath) return;

    if (!isHovering || !node) {
      this.nodeLayer.selectAll('g.node-group').attr('opacity', 1);
      this.linkLayer.selectAll('g.link-group').attr('opacity', 1);
      this.linkLabelLayer.selectAll('g.link-label-group').attr('opacity', 1);
      this.applySemanticZoom(this.currentTransform.k);
      return;
    }

    const connectedNodeIds = new Set([node.id]);

    this.links.forEach(link => {
      const sourceId = link.source.id || link.source;
      const targetId = link.target.id || link.target;
      if (sourceId === node.id || targetId === node.id) {
        connectedNodeIds.add(sourceId);
        connectedNodeIds.add(targetId);
      }
    });

    this.nodeLayer.selectAll('g.node-group')
      .attr('opacity', d => connectedNodeIds.has(d.id) ? 1 : 0.12);

    this.linkLayer.selectAll('g.link-group')
      .attr('opacity', d => {
        const sourceId = d.source.id || d.source;
        const targetId = d.target.id || d.target;
        return (sourceId === node.id || targetId === node.id) ? 1 : 0.04;
      });

    // Always reveal connected link percentage badges clearly when hovering/selecting!
    this.linkLabelLayer.selectAll('g.link-label-group')
      .style('opacity', d => {
        const sourceId = d.source.id || d.source;
        const targetId = d.target.id || d.target;
        return (sourceId === node.id || targetId === node.id) ? 1 : 0;
      });
  }

  /**
   * Select a node by live object OR raw node object OR ID string, with reliable camera autofocus
   */
  selectNode(nodeOrId, autoFocus = true, triggerCallback = true) {
    const id = typeof nodeOrId === 'string' ? nodeOrId : (nodeOrId && nodeOrId.id);
    if (!id) return;

    const liveNode = this.nodes.find(n => n.id === id);
    this.selectedNodeId = id;

    if (liveNode) {
      this.handleNodeHover(liveNode, true);
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
    this.handleNodeHover(node, true);

    const transform = d3.zoomIdentity
      .translate(this.width / 2 - node.x * targetScale, this.height / 2 - node.y * targetScale)
      .scale(targetScale);

    this.svg.transition()
      .duration(650)
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

    this.nodeLayer.selectAll('g.node-group')
      .attr('opacity', d => pathNodeSet.has(d.id) ? 1 : 0.1)
      .select('circle.node-shape')
      .attr('stroke', d => pathNodeSet.has(d.id) ? '#38bdf8' : this.getNodeColor(d))
      .attr('stroke-width', d => pathNodeSet.has(d.id) ? 4.5 : 2.2);

    this.linkLayer.selectAll('g.link-group')
      .attr('opacity', d => {
        const sourceId = d.source.id || d.source;
        const targetId = d.target.id || d.target;
        return (pathLinkPairSet.has(`${sourceId}->${targetId}`)) ? 1 : 0.04;
      })
      .select('path')
      .attr('stroke', d => {
        const sourceId = d.source.id || d.source;
        const targetId = d.target.id || d.target;
        return (pathLinkPairSet.has(`${sourceId}->${targetId}`)) ? '#38bdf8' : this.getLinkColor(d);
      })
      .attr('stroke-width', d => {
        const sourceId = d.source.id || d.source;
        const targetId = d.target.id || d.target;
        return (pathLinkPairSet.has(`${sourceId}->${targetId}`)) ? Math.max(8, this.getLinkWidth(d) + 3) : this.getLinkWidth(d);
      });

    this.linkLabelLayer.selectAll('g.link-label-group')
      .style('opacity', d => {
        const sourceId = d.source.id || d.source;
        const targetId = d.target.id || d.target;
        return (pathLinkPairSet.has(`${sourceId}->${targetId}`)) ? 1 : 0;
      });

    // Automatically frame the discovered path!
    this.fitToNodes(pathResult.nodeIds, true);
  }

  clearHighlight() {
    this.highlightedPath = null;
    this.selectedNodeId = null;
    this.hoveredNodeId = null;

    this.nodeLayer.selectAll('g.node-group')
      .attr('opacity', 1)
      .select('circle.node-shape')
      .attr('stroke', d => d.is_holding ? '#fbbf24' : '#ffffff')
      .attr('stroke-width', d => d.is_holding ? 3.5 : 2.2);

    this.linkLayer.selectAll('g.link-group')
      .attr('opacity', 1)
      .select('path')
      .attr('stroke', d => this.getLinkColor(d))
      .attr('stroke-width', d => this.getLinkWidth(d));

    this.linkLabelLayer.selectAll('g.link-label-group')
      .attr('opacity', 1);

    this.applySemanticZoom(this.currentTransform.k);
  }

  zoomIn() {
    this.svg.transition().duration(260).ease(d3.easeCubicOut).call(this.zoom.scaleBy, 1.35);
  }

  zoomOut() {
    this.svg.transition().duration(260).ease(d3.easeCubicOut).call(this.zoom.scaleBy, 0.72);
  }

  resetZoom() {
    this.fitToScreen(true);
  }

  exportPNG() {
    const svgEl = document.getElementById('network-svg');
    const svgString = new XMLSerializer().serializeToString(svgEl);
    const canvas = document.createElement('canvas');
    canvas.width = this.width * 2;
    canvas.height = this.height * 2;
    const ctx = canvas.getContext('2d');
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';

    const img = new Image();
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      ctx.fillStyle = isLight ? '#f8fafc' : '#0b0f19';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);

      const a = document.createElement('a');
      a.download = `korean_conglomerate_network_${Date.now()}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    };
    img.src = url;
  }

  initResizeObserver() {
    const handleResize = () => {
      const nextW = this.container.clientWidth;
      const nextH = this.container.clientHeight;
      if (!nextW || !nextH) return;
      if (Math.abs(nextW - this.width) < 2 && Math.abs(nextH - this.height) < 2) return;

      this.width = nextW;
      this.height = nextH;
      this.svg.attr('viewBox', [0, 0, this.width, this.height]);
      this.updateMinimap();
    };

    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(handleResize);
      this._resizeObserver.observe(this.container);
    } else {
      window.addEventListener('resize', handleResize);
    }
  }

  drag(simulation) {
    function dragstarted(event, d) {
      if (!event.active) simulation.alphaTarget(0.25).restart();
      d.fx = d.x;
      d.fy = d.y;
    }
    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }
    function dragended(event, d) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }
    return d3.drag()
      .on('start', dragstarted)
      .on('drag', dragged)
      .on('end', dragended);
  }
}
