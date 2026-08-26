/**
 * 대한민국 대기업 네트워크 - D3.js 고성능 인터랙티브 그래프 엔진 (v2.0)
 * - 원의 면적: 자산/시가총액/재산 규모에 비례 (Area ∝ Value)
 * - 연결선 굵기: 소유 지분율(%)에 비례 (Stroke Width ∝ Stake %)
 * - 고대비 텍스트 배지 및 동적 화살표 위치 보정
 */

export class NetworkGraphEngine {
  constructor(containerSelector, onNodeClick) {
    this.container = document.querySelector(containerSelector);
    this.onNodeClick = onNodeClick;

    this.width = this.container.clientWidth || window.innerWidth;
    this.height = this.container.clientHeight || window.innerHeight;

    this.svg = null;
    this.g = null;
    this.simulation = null;
    this.zoom = null;

    this.nodes = [];
    this.links = [];
    this.groupColorMap = new Map();
    this.currentViewMode = 'holistic';
    this.selectedNodeId = null;
    this.highlightedPath = null;
    this.sizeScaleEnabled = true;

    this.initSVG();
    this.bindWindowResize();
  }

  setGroupColors(groups) {
    this.groupColorMap.clear();
    groups.forEach(g => {
      this.groupColorMap.set(g.id, g.color || '#6366f1');
    });
  }

  getNodeColor(node) {
    if (this.groupColorMap.has(node.group)) {
      return this.groupColorMap.get(node.group);
    }
    return '#6366f1';
  }

  /**
   * Calculate node radius based on Asset / Market Cap / Wealth (Area proportional)
   * Formula: Area = π * r^2  =>  r ∝ sqrt(Value)
   */
  getNodeRadius(node) {
    if (!this.sizeScaleEnabled) {
      return node.type === 'person' ? 22 : 26;
    }

    const val = node.val_trillion || 0.5;

    if (node.type === 'person') {
      // Wealth range: 0.2조 ~ 14조 (이재용 14조, 서정진 11조 등)
      // Radius range: 18px ~ 36px
      const minR = 18;
      const maxR = 36;
      const normalized = Math.sqrt(Math.min(val, 15) / 15);
      return minR + normalized * (maxR - minR);
    } else {
      // Corporate valuation range: 0.3조 ~ 450조 (삼성전자 450조, 하이닉스 140조, 모비스 23조 등)
      // Radius range: 20px ~ 48px
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
      // 2배 적용: 1% -> 3px, 20% -> 8px, 50% -> 13px, 80%+ -> 19px
      return Math.max(3.0, Math.min(20.0, (Math.pow(stake / 100, 0.55) * 9 + 1.2) * 2));
    }
    if (link.type === 'family') return 5.0;
    if (link.type === 'marriage' || link.type === 'marriage_past') return 4.5;
    return 3.6;
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

    // Dynamic marker generator function with enhanced visibility
    const createMarker = (id, color) => {
      defs.append('marker')
        .attr('id', id)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 12)
        .attr('refY', 0)
        .attr('markerWidth', 7.5)
        .attr('markerHeight', 7.5)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-4.5L9,0L0,4.5')
        .attr('fill', color);
    };

    createMarker('arrow-ownership', '#3b82f6');
    createMarker('arrow-circular', '#f43f5e');
    createMarker('arrow-family', '#a855f7');
    createMarker('arrow-marriage', '#ec4899');
    createMarker('arrow-alliance', '#eab308');
    createMarker('arrow-highlight', '#38bdf8');

    // Glow filter for holdings and super billionaires
    const filter = defs.append('filter')
      .attr('id', 'glow')
      .attr('x', '-50%')
      .attr('y', '-50%')
      .attr('width', '200%')
      .attr('height', '200%');
    filter.append('feGaussianBlur')
      .attr('stdDeviation', '5')
      .attr('result', 'coloredBlur');
    const feMerge = filter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    this.g = this.svg.append('g').attr('class', 'network-root-group');

    this.linkLayer = this.g.append('g').attr('class', 'links-layer');
    this.linkLabelLayer = this.g.append('g').attr('class', 'link-labels-layer');
    this.nodeLayer = this.g.append('g').attr('class', 'nodes-layer');

    // Setup Zoom
    this.zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        this.g.attr('transform', event.transform);
      });

    this.svg.call(this.zoom).on('dblclick.zoom', null);
  }

  bindWindowResize() {
    window.addEventListener('resize', () => {
      this.width = this.container.clientWidth;
      this.height = this.container.clientHeight;
      if (this.svg) {
        this.svg.attr('viewBox', [0, 0, this.width, this.height]);
      }
      if (this.simulation) {
        this.simulation.force('center', d3.forceCenter(this.width / 2, this.height / 2));
        this.simulation.alpha(0.3).restart();
      }
    });
  }

  setData(data, viewMode = 'holistic') {
    this.currentViewMode = viewMode;
    this.nodes = data.nodes.map(d => ({ ...d }));
    const nodeMap = new Map(this.nodes.map(n => [n.id, n]));

    this.links = data.links
      .map(d => {
        const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
        const targetId = typeof d.target === 'object' ? d.target.id : d.target;
        return {
          ...d,
          source: sourceId,
          target: targetId
        };
      })
      .filter(l => nodeMap.has(l.source) && nodeMap.has(l.target));

    this.render();
  }

  render() {
    if (this.simulation) {
      this.simulation.stop();
    }

    // Force Simulation with Dynamic Radii and Collision Buffers
    this.simulation = d3.forceSimulation(this.nodes)
      .force('link', d3.forceLink(this.links).id(d => d.id).distance(d => {
        const sourceR = this.getNodeRadius(d.source);
        const targetR = this.getNodeRadius(d.target);
        if (d.type === 'circular') return sourceR + targetR + 70;
        if (d.type === 'family' || d.type === 'marriage') return sourceR + targetR + 50;
        return sourceR + targetR + 80;
      }).strength(0.65))
      .force('charge', d3.forceManyBody().strength(d => {
        const r = this.getNodeRadius(d);
        return d.is_holding ? -600 : (-r * 12);
      }))
      .force('center', d3.forceCenter(this.width / 2, this.height / 2).strength(0.08))
      .force('collision', d3.forceCollide().radius(d => this.getNodeRadius(d) + 16).strength(0.85));

    // Group cluster forces
    if (this.currentViewMode === 'cluster') {
      const groups = Array.from(new Set(this.nodes.map(n => n.group)));
      const groupCenters = new Map();
      const numGroups = groups.length;
      const radius = Math.min(this.width, this.height) * 0.38;

      groups.forEach((grp, idx) => {
        const angle = (idx / numGroups) * 2 * Math.PI;
        groupCenters.set(grp, {
          x: this.width / 2 + radius * Math.cos(angle),
          y: this.height / 2 + radius * Math.sin(angle)
        });
      });

      this.simulation.force('groupCluster', alpha => {
        this.nodes.forEach(node => {
          const center = groupCenters.get(node.group);
          if (center) {
            node.vx += (center.x - node.x) * alpha * 0.35;
            node.vy += (center.y - node.y) * alpha * 0.35;
          }
        });
      });
    }

    // --- Render Links ---
    const linkSelection = this.linkLayer.selectAll('g.link-group')
      .data(this.links, d => `${d.source.id || d.source}-${d.target.id || d.target}-${d.type}`);

    linkSelection.exit().remove();

    const linkEnter = linkSelection.enter().append('g')
      .attr('class', 'link-group');

    linkEnter.append('path')
      .attr('class', d => `link-path ${d.type === 'circular' ? 'circular-flow-edge' : ''}`)
      .attr('stroke', d => this.getLinkColor(d))
      .attr('stroke-width', d => this.getLinkWidth(d))
      .attr('stroke-opacity', 0.65)
      .attr('fill', 'none')
      .attr('marker-end', d => this.getMarkerEnd(d));

    const linkGroup = linkEnter.merge(linkSelection);

    // --- Render Link Label Badges (with high contrast background) ---
    const labelSelection = this.linkLabelLayer.selectAll('g.link-label-group')
      .data(this.links.filter(l => l.label), d => `${d.source.id || d.source}-${d.target.id || d.target}-${d.type}`);

    labelSelection.exit().remove();

    const labelEnter = labelSelection.enter().append('g')
      .attr('class', 'link-label-group');

    labelEnter.append('rect')
      .attr('class', 'link-label-bg')
      .attr('rx', 4)
      .attr('ry', 4)
      .attr('fill', 'rgba(15, 23, 42, 0.85)')
      .attr('stroke', d => d.type === 'circular' ? '#fb7185' : 'rgba(148, 163, 184, 0.3)')
      .attr('stroke-width', 1);

    labelEnter.append('text')
      .attr('class', 'link-label-text')
      .attr('font-size', '9.5px')
      .attr('font-weight', '700')
      .attr('fill', d => d.type === 'circular' ? '#fb7185' : '#e2e8f0')
      .attr('text-anchor', 'middle')
      .attr('dy', 3.5)
      .text(d => d.label || '');

    const labelGroup = labelEnter.merge(labelSelection);

    // --- Render Nodes ---
    const nodeSelection = this.nodeLayer.selectAll('g.node-group')
      .data(this.nodes, d => d.id);

    nodeSelection.exit().remove();

    const nodeEnter = nodeSelection.enter().append('g')
      .attr('class', 'node-group')
      .attr('cursor', 'pointer')
      .call(d3.drag()
        .on('start', (event, d) => this.dragstarted(event, d))
        .on('drag', (event, d) => this.dragged(event, d))
        .on('end', (event, d) => this.dragended(event, d))
      )
      .on('click', (event, d) => {
        event.stopPropagation();
        this.selectNode(d);
      })
      .on('mouseenter', (event, d) => this.handleNodeHover(d, true))
      .on('mouseleave', (event, d) => this.handleNodeHover(d, false));

    // Dynamic shapes per node
    nodeEnter.each((d, i, nodes) => {
      const el = d3.select(nodes[i]);
      const color = this.getNodeColor(d);
      const r = this.getNodeRadius(d);

      if (d.type === 'person') {
        // Person Node: Circle with Avatar initial & proportional radius
        el.append('circle')
          .attr('class', 'node-shape')
          .attr('r', r)
          .attr('fill', '#1e293b')
          .attr('stroke', color)
          .attr('stroke-width', d.val_trillion >= 5 ? 3.5 : 2.5)
          .attr('filter', d.val_trillion >= 4 ? 'url(#glow)' : null);

        el.append('text')
          .attr('class', 'node-initial-text')
          .attr('text-anchor', 'middle')
          .attr('dy', r * 0.22)
          .attr('font-size', `${Math.max(11, r * 0.45)}px`)
          .attr('fill', '#f8fafc')
          .attr('font-weight', 'bold')
          .text(d.name.slice(-2));
      } else {
        // Company Node: Circle or Rounded Pill
        el.append('circle')
          .attr('class', 'node-shape')
          .attr('r', r)
          .attr('fill', d.is_holding ? '#1e1b4b' : '#0f172a')
          .attr('stroke', d.is_holding ? '#f59e0b' : color)
          .attr('stroke-width', d.is_holding ? 3.8 : 2.5)
          .attr('filter', (d.is_holding || d.val_trillion >= 50) ? 'url(#glow)' : null);

        // Holding crown / top badge
        if (d.is_holding) {
          el.append('circle')
            .attr('cx', r * 0.65)
            .attr('cy', -r * 0.65)
            .attr('r', 6.5)
            .attr('fill', '#f59e0b')
            .attr('stroke', '#ffffff')
            .attr('stroke-width', 1.5);
        }

        // Inner company icon/name
        el.append('text')
          .attr('class', 'node-corp-center-text')
          .attr('text-anchor', 'middle')
          .attr('dy', 4)
          .attr('font-size', `${Math.max(10, r * 0.36)}px`)
          .attr('font-weight', '800')
          .attr('fill', d.is_holding ? '#fbbf24' : '#ffffff')
          .text(d.name.length > 5 ? d.name.slice(0, 4) + '..' : d.name);
      }

      // Bottom Name Label
      el.append('text')
        .attr('class', 'node-title-label')
        .attr('text-anchor', 'middle')
        .attr('dy', r + 14)
        .attr('font-size', `${Math.max(10.5, Math.min(14, r * 0.38))}px`)
        .attr('font-weight', '700')
        .attr('fill', '#f8fafc')
        .attr('filter', 'drop-shadow(0px 2px 4px rgba(0,0,0,0.8))')
        .text(d.name);

      // Sub-label (title / market cap)
      el.append('text')
        .attr('class', 'node-sub-label')
        .attr('text-anchor', 'middle')
        .attr('dy', r + 26)
        .attr('font-size', '9.5px')
        .attr('font-weight', '600')
        .attr('fill', d.type === 'person' ? '#94a3b8' : '#34d399')
        .attr('filter', 'drop-shadow(0px 1px 3px rgba(0,0,0,0.9))')
        .text(d.type === 'person' ? (d.wealth_est || d.title) : (d.market_cap || ''));
    });

    const nodeGroup = nodeEnter.merge(nodeSelection);

    // Simulation Tick Listener with Precise Edge Trimming to Circle Borders
    this.simulation.on('tick', () => {
      linkGroup.select('path').attr('d', d => {
        const sourceR = this.getNodeRadius(d.source);
        const targetR = this.getNodeRadius(d.target);

        const dx = d.target.x - d.source.x;
        const dy = d.target.y - d.source.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist === 0) return '';

        // Calculate exact touch points on source and target circle boundaries
        const sx = d.source.x + (dx * sourceR) / dist;
        const sy = d.source.y + (dy * sourceR) / dist;
        const tx = d.target.x - (dx * (targetR + 4)) / dist;
        const ty = d.target.y - (dy * (targetR + 4)) / dist;

        if (d.type === 'circular' || d.type === 'marriage') {
          const dr = dist * 1.25;
          return `M${sx},${sy}A${dr},${dr} 0 0,1 ${tx},${ty}`;
        }
        return `M${sx},${sy}L${tx},${ty}`;
      });

      // Position Link Labels
      labelGroup.attr('transform', d => {
        const x = (d.source.x + d.target.x) / 2;
        const y = (d.source.y + d.target.y) / 2;
        return `translate(${x},${y})`;
      });

      // Update Label Bounding Boxes
      labelGroup.each(function() {
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

      nodeGroup.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    this.simulation.alpha(1).restart();
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
      .attr('stroke', d => d.is_holding ? '#f59e0b' : this.getNodeColor(d))
      .attr('stroke-width', d => d.is_holding ? 3.8 : 2.5);

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
    this.svg.transition().duration(500).call(
      this.zoom.transform,
      d3.zoomIdentity.translate(0, 0).scale(1)
    );
  }

  centerNode(nodeId) {
    const node = this.nodes.find(n => n.id === nodeId);
    if (!node) return;

    const scale = 1.3;
    const x = this.width / 2 - node.x * scale;
    const y = this.height / 2 - node.y * scale;

    this.svg.transition().duration(600).call(
      this.zoom.transform,
      d3.zoomIdentity.translate(x, y).scale(scale)
    );
  }

  exportPNG() {
    const svgElement = this.svg.node();
    const svgString = new XMLSerializer().serializeToString(svgElement);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    canvas.width = this.width * 2;
    canvas.height = this.height * 2;
    ctx.scale(2, 2);

    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      ctx.fillStyle = '#0b0f19';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);

      const a = document.createElement('a');
      a.download = 'korean_chaebol_network.png';
      a.href = canvas.toDataURL('image/png');
      a.click();
    };
    img.src = url;
  }

  dragstarted(event, d) {
    if (!event.active) this.simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }

  dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
  }

  dragended(event, d) {
    if (!event.active) this.simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }
}
