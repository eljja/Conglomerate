/**
 * 대한민국 대기업 네트워크 - D3.js 고도화 포스 레이아웃 시각화 엔진 (v2.0 Advanced)
 * 미니맵(Minimap), 스마트 툴팁(Tooltip), 성운 오라(Nebula Aura), 비례 면적/선굵기 지원
 */

export class NetworkGraph {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.options = options;
    this.width = this.container.clientWidth || window.innerWidth;
    this.height = this.container.clientHeight || window.innerHeight;
    
    this.nodes = [];
    this.links = [];
    this.filteredNodes = [];
    this.filteredLinks = [];
    
    this.svg = null;
    this.g = null;
    this.simulation = null;
    this.zoom = null;
    this.currentTransform = d3.zoomIdentity;
    
    this.selectedNodeId = null;
    this.highlightedPath = null;
    this.viewMode = 'holistic';
    this.sizeScaleEnabled = true;

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
    this.initResizeListener();
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

    // Dynamic marker generator function with userSpaceOnUse (prevents huge triangle explosion)
    const createMarker = (id, color) => {
      defs.append('marker')
        .attr('id', id)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 7)
        .attr('refY', 0)
        .attr('markerUnits', 'userSpaceOnUse')
        .attr('markerWidth', 10)
        .attr('markerHeight', 10)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-3.2L6.5,0L0,3.2')
        .attr('fill', color);
    };

    createMarker('arrow-ownership', '#3b82f6');
    createMarker('arrow-circular', '#f43f5e');
    createMarker('arrow-family', '#a855f7');
    createMarker('arrow-marriage', '#ec4899');
    createMarker('arrow-highlight', '#38bdf8');

    // Drop shadow filter for nodes
    const filter = defs.append('filter')
      .attr('id', 'node-shadow')
      .attr('x', '-20%')
      .attr('y', '-20%')
      .attr('width', '140%')
      .attr('height', '140%');
    filter.append('feDropShadow')
      .attr('dx', 0)
      .attr('dy', 4)
      .attr('stdDeviation', 6)
      .attr('flood-color', '#000000')
      .attr('flood-opacity', 0.4);

    // Neon glow filter for holdings and circular nodes
    const glow = defs.append('filter')
      .attr('id', 'neon-glow')
      .attr('x', '-40%')
      .attr('y', '-40%')
      .attr('width', '180%')
      .attr('height', '180%');
    glow.append('feGaussianBlur')
      .attr('stdDeviation', 4.5)
      .attr('result', 'coloredBlur');
    const feMerge = glow.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    // Main Graph Container
    this.g = this.svg.append('g').attr('class', 'main-graph-group');

    // Layer groups for precise z-indexing
    this.clusterLayer = this.g.append('g').attr('class', 'cluster-layer');
    this.linkLayer = this.g.append('g').attr('class', 'link-layer');
    this.linkLabelLayer = this.g.append('g').attr('class', 'link-label-layer');
    this.nodeLayer = this.g.append('g').attr('class', 'node-layer');

    // Zoom & Pan Behavior
    this.zoom = d3.zoom()
      .scaleExtent([0.15, 4.0])
      .on('zoom', (event) => {
        this.currentTransform = event.transform;
        this.g.attr('transform', event.transform);
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

  setData(data, viewMode = 'holistic') {
    this.viewMode = viewMode;
    this.nodes = JSON.parse(JSON.stringify(data.nodes || []));
    this.links = JSON.parse(JSON.stringify(data.links || []));

    this.render();
  }

  render() {
    if (this.simulation) {
      this.simulation.stop();
    }

    const nodes = this.nodes;
    const links = this.links;

    // Simulation forces setup with dynamic node collision based on radii
    this.simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).distance(d => {
        if (d.type === 'circular') return 100;
        if (d.type === 'family') return 80;
        if (d.type === 'marriage' || d.type === 'marriage_past') return 95;
        return 125;
      }).strength(0.75))
      .force('charge', d3.forceManyBody().strength(d => {
        const r = this.getNodeRadius(d);
        return -r * 26;
      }))
      .force('center', d3.forceCenter(this.width / 2, this.height / 2).strength(0.08))
      .force('collide', d3.forceCollide().radius(d => this.getNodeRadius(d) + 18).iterations(3))
      .force('x', d3.forceX(this.width / 2).strength(0.04))
      .force('y', d3.forceY(this.height / 2).strength(0.04));

    // Specific Layout clustering based on viewMode
    if (this.viewMode === 'cluster') {
      this.simulation.force('cluster', this.forceCluster());
    }

    // --- Render Links ---
    const linkGroup = this.linkLayer.selectAll('g.link-group')
      .data(links, d => `${d.source.id || d.source}-${d.target.id || d.target}-${d.type}`);

    linkGroup.exit().remove();

    const linkEnter = linkGroup.enter().append('g')
      .attr('class', 'link-group');

    linkEnter.append('path')
      .attr('class', d => `network-link ${d.type} ${d.highlight_loop ? 'circular-flow-edge' : ''}`)
      .attr('stroke', d => this.getLinkColor(d))
      .attr('stroke-width', d => this.getLinkWidth(d))
      .attr('marker-end', d => this.getMarkerEnd(d))
      .attr('fill', 'none');

    const linkElements = linkEnter.merge(linkGroup);

    // --- Render Link Labels (Badge pill) ---
    const labelGroup = this.linkLabelLayer.selectAll('g.link-label-group')
      .data(links.filter(l => l.stake || l.label), d => `${d.source.id || d.source}-${d.target.id || d.target}`);

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

    // --- Render Nodes ---
    const nodeGroup = this.nodeLayer.selectAll('g.node-group')
      .data(nodes, d => d.id);

    nodeGroup.exit().remove();

    const nodeEnter = nodeGroup.enter().append('g')
      .attr('class', d => `node-group node-${d.type} ${d.is_holding ? 'is-holding' : ''}`)
      .call(this.drag(this.simulation))
      .on('click', (event, d) => {
        event.stopPropagation();
        this.selectNode(d);
      })
      .on('mouseenter', (event, d) => {
        this.handleNodeHover(d, true);
        this.showTooltip(event, d);
      })
      .on('mousemove', (event, d) => {
        this.moveTooltip(event);
      })
      .on('mouseleave', (event, d) => {
        this.handleNodeHover(d, false);
        this.hideTooltip();
      });

    // Outer Aura Ring for Holding Companies
    nodeEnter.filter(d => d.is_holding)
      .append('circle')
      .attr('class', 'holding-aura-ring')
      .attr('r', d => this.getNodeRadius(d) + 7)
      .attr('fill', 'none')
      .attr('stroke', '#f59e0b')
      .attr('stroke-width', 2.5)
      .attr('stroke-dasharray', '6,3')
      .attr('filter', 'url(#neon-glow)');

    // Main Circle Node
    nodeEnter.append('circle')
      .attr('class', 'node-shape')
      .attr('r', d => this.getNodeRadius(d))
      .attr('fill', d => this.getNodeColor(d))
      .attr('stroke', d => d.is_holding ? '#fbbf24' : '#ffffff')
      .attr('stroke-width', d => d.is_holding ? 3.5 : 2.5)
      .attr('filter', 'url(#node-shadow)');

    // Inner Icon / Emoji
    nodeEnter.append('text')
      .attr('class', 'node-icon')
      .attr('text-anchor', 'middle')
      .attr('dy', d => d.type === 'person' ? '0.35em' : '0.35em')
      .attr('font-size', d => `${Math.max(12, this.getNodeRadius(d) * 0.5)}px`)
      .attr('pointer-events', 'none')
      .text(d => {
        if (d.type === 'person') return '👤';
        if (d.is_holding) return '👑';
        return '🏢';
      });

    // Node Title Label (Below)
    const textGroup = nodeEnter.append('g')
      .attr('class', 'node-label-wrap')
      .attr('transform', d => `translate(0, ${this.getNodeRadius(d) + 14})`);

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

    // --- Simulation Tick Handler ---
    this.simulation.on('tick', () => {
      // Trim path to stop precisely at node boundaries
      linkElements.select('path').attr('d', d => {
        const sx = d.source.x, sy = d.source.y;
        const tx = d.target.x, ty = d.target.y;
        const dx = tx - sx, dy = ty - sy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist === 0) return `M${sx},${sy}L${tx},${ty}`;

        const sourceR = this.getNodeRadius(d.source) + 2;
        const targetR = this.getNodeRadius(d.target) + 4;

        const startX = sx + (dx * sourceR) / dist;
        const startY = sy + (dy * sourceR) / dist;
        const endX = tx - (dx * targetR) / dist;
        const endY = ty - (dy * targetR) / dist;

        return `M${startX},${startY}L${endX},${endY}`;
      });

      // Position Link Labels
      labelElements.attr('transform', d => {
        const x = (d.source.x + d.target.x) / 2;
        const y = (d.source.y + d.target.y) / 2;
        return `translate(${x},${y})`;
      });

      // Update Label Bounding Boxes
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

      nodeElements.attr('transform', d => `translate(${d.x},${d.y})`);

      this.updateMinimap();
    });

    this.simulation.alpha(1).restart();
  }

  showTooltip(event, node) {
    if (!this.tooltip) return;
    
    const roleText = node.title || node.industry || node.role || '';
    const valText = node.val_trillion ? `자산/가치: 약 ${node.val_trillion}조 원` : '';
    const groupName = (node.group || '').toUpperCase();

    this.tooltip.innerHTML = `
      <div class="tooltip-header">
        <span class="tooltip-badge" style="background:${this.getNodeColor(node)};">${groupName}</span>
        <strong>${node.name}</strong>
      </div>
      <div class="tooltip-sub">${roleText}</div>
      ${valText ? `<div class="tooltip-val">${valText}</div>` : ''}
      <div class="tooltip-desc">${node.desc ? node.desc.slice(0, 75) + '...' : ''}</div>
    `;
    this.tooltip.style.display = 'block';
    this.moveTooltip(event);
  }

  moveTooltip(event) {
    if (!this.tooltip) return;
    const x = event.clientX + 14;
    const y = event.clientY + 14;
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

    if (this.nodes.length === 0) return;

    // Calculate bounding box of all nodes
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    this.nodes.forEach(n => {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    });

    const padding = 100;
    minX -= padding; maxX += padding;
    minY -= padding; maxY += padding;

    const dataW = Math.max(100, maxX - minX);
    const dataH = Math.max(100, maxY - minY);
    const scale = Math.min(w / dataW, h / dataH);

    const mapX = (x) => (x - minX) * scale;
    const mapY = (y) => (y - minY) * scale;

    // Draw Links on Minimap
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    this.links.forEach(l => {
      if (l.source.x && l.target.x) {
        ctx.beginPath();
        ctx.moveTo(mapX(l.source.x), mapY(l.source.y));
        ctx.lineTo(mapX(l.target.x), mapY(l.target.y));
        ctx.stroke();
      }
    });

    // Draw Nodes on Minimap
    this.nodes.forEach(n => {
      if (n.x && n.y) {
        ctx.fillStyle = this.getNodeColor(n);
        ctx.beginPath();
        ctx.arc(mapX(n.x), mapY(n.y), n.is_holding ? 3.5 : 2, 0, 2 * Math.PI);
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
    ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
    ctx.fillRect(vx, vy, vw, vh);
    ctx.strokeRect(vx, vy, vw, vh);
  }

  getNodeColor(node) {
    return this.groupColors[node.group] || this.groupColors['default'];
  }

  getLinkColor(d) {
    if (d.type === 'circular') return '#f43f5e';
    if (d.type === 'family') return '#a855f7';
    if (d.type === 'marriage' || d.type === 'marriage_past') return '#ec4899';
    if (d.type === 'ownership_corp' || d.type === 'ownership_person') return '#3b82f6';
    return '#64748b';
  }

  getMarkerEnd(d) {
    if (d.type === 'circular') return 'url(#arrow-circular)';
    if (d.type === 'family') return 'url(#arrow-family)';
    if (d.type === 'marriage' || d.type === 'marriage_past') return 'url(#arrow-marriage)';
    if (d.type === 'ownership_corp' || d.type === 'ownership_person') return 'url(#arrow-ownership)';
    return null;
  }

  // Hover highlighting
  handleNodeHover(node, isHovering) {
    if (this.highlightedPath) return;

    if (!isHovering) {
      this.nodeLayer.selectAll('g.node-group').attr('opacity', 1);
      this.linkLayer.selectAll('g.link-group').attr('opacity', 1);
      this.linkLabelLayer.selectAll('g.link-label-group').attr('opacity', 1);
      return;
    }

    const connectedNodeIds = new Set([node.id]);
    const connectedLinkIds = new Set();

    this.links.forEach(link => {
      const sourceId = link.source.id || link.source;
      const targetId = link.target.id || link.target;
      if (sourceId === node.id || targetId === node.id) {
        connectedNodeIds.add(sourceId);
        connectedNodeIds.add(targetId);
        connectedLinkIds.add(`${sourceId}-${targetId}`);
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

    this.linkLabelLayer.selectAll('g.link-label-group')
      .attr('opacity', d => {
        const sourceId = d.source.id || d.source;
        const targetId = d.target.id || d.target;
        return (sourceId === node.id || targetId === node.id) ? 1 : 0.04;
      });
  }

  selectNode(node) {
    this.selectedNodeId = node.id;
    if (typeof this.onNodeClick === 'function') {
      this.onNodeClick(node);
    }
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
      .attr('stroke-width', d => pathNodeSet.has(d.id) ? 4.5 : 2.5);

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
      .attr('opacity', d => {
        const sourceId = d.source.id || d.source;
        const targetId = d.target.id || d.target;
        return (pathLinkPairSet.has(`${sourceId}->${targetId}`)) ? 1 : 0.04;
      });
  }

  clearHighlight() {
    this.highlightedPath = null;
    this.nodeLayer.selectAll('g.node-group')
      .attr('opacity', 1)
      .select('circle.node-shape')
      .attr('stroke', d => d.is_holding ? '#fbbf24' : '#ffffff')
      .attr('stroke-width', d => d.is_holding ? 3.5 : 2.5);

    this.linkLayer.selectAll('g.link-group')
      .attr('opacity', 1)
      .select('path')
      .attr('stroke', d => this.getLinkColor(d))
      .attr('stroke-width', d => this.getLinkWidth(d));

    this.linkLabelLayer.selectAll('g.link-label-group')
      .attr('opacity', 1);
  }

  zoomIn() {
    this.svg.transition().duration(300).call(this.zoom.scaleBy, 1.3);
  }

  zoomOut() {
    this.svg.transition().duration(300).call(this.zoom.scaleBy, 0.7);
  }

  resetZoom() {
    this.svg.transition().duration(500).call(this.zoom.transform, d3.zoomIdentity);
  }

  exportPNG() {
    const svgEl = document.getElementById('network-svg');
    const svgString = new XMLSerializer().serializeToString(svgEl);
    const canvas = document.createElement('canvas');
    canvas.width = this.width * 2;
    canvas.height = this.height * 2;
    const ctx = canvas.getContext('2d');
    
    const img = new Image();
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      ctx.fillStyle = '#0b0f19';
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

  initResizeListener() {
    window.addEventListener('resize', () => {
      this.width = this.container.clientWidth || window.innerWidth;
      this.height = this.container.clientHeight || window.innerHeight;
      this.svg.attr('viewBox', [0, 0, this.width, this.height]);
      if (this.simulation) {
        this.simulation.force('center', d3.forceCenter(this.width / 2, this.height / 2));
        this.simulation.alpha(0.3).restart();
      }
    });
  }

  drag(simulation) {
    function dragstarted(event, d) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
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
