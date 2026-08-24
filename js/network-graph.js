/**
 * 대한민국 대기업 네트워크 - D3.js 고성능 인터랙티브 그래프 엔진
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

  initSVG() {
    this.container.innerHTML = '';

    // Create base SVG
    this.svg = d3.select(this.container)
      .append('svg')
      .attr('id', 'network-svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', [0, 0, this.width, this.height]);

    // Define defs: markers and filters
    const defs = this.svg.append('defs');

    // Arrow markers
    const createMarker = (id, color) => {
      defs.append('marker')
        .attr('id', id)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 28)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', color);
    };

    createMarker('arrow-ownership', '#3b82f6');
    createMarker('arrow-circular', '#f43f5e');
    createMarker('arrow-family', '#a855f7');
    createMarker('arrow-marriage', '#ec4899');
    createMarker('arrow-alliance', '#eab308');
    createMarker('arrow-highlight', '#38bdf8');

    // Glow filter
    const filter = defs.append('filter')
      .attr('id', 'glow')
      .attr('x', '-50%')
      .attr('y', '-50%')
      .attr('width', '200%')
      .attr('height', '200%');
    filter.append('feGaussianBlur')
      .attr('stdDeviation', '4')
      .attr('result', 'coloredBlur');
    const feMerge = filter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    // Root transformation group
    this.g = this.svg.append('g').attr('class', 'network-root-group');

    // Link container & Node container
    this.linkLayer = this.g.append('g').attr('class', 'links-layer');
    this.nodeLayer = this.g.append('g').attr('class', 'nodes-layer');
    this.labelLayer = this.g.append('g').attr('class', 'labels-layer');

    // Setup Zoom
    this.zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        this.g.attr('transform', event.transform);
      });

    this.svg.call(this.zoom)
      .on('dblclick.zoom', null); // Disable double click to zoom in favor of centering node
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
    // Deep clone data to avoid D3 mutation issues on re-filtering
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

    // Force simulation setup
    this.simulation = d3.forceSimulation(this.nodes)
      .force('link', d3.forceLink(this.links).id(d => d.id).distance(d => {
        if (d.type === 'circular') return 110;
        if (d.type === 'family' || d.type === 'marriage') return 80;
        return 130;
      }).strength(0.6))
      .force('charge', d3.forceManyBody().strength(d => d.is_holding ? -450 : -280))
      .force('center', d3.forceCenter(this.width / 2, this.height / 2).strength(0.08))
      .force('collision', d3.forceCollide().radius(d => d.type === 'person' ? 35 : 45).strength(0.7));

    // Special clustering force when in 'cluster' mode
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
            node.vx += (center.x - node.x) * alpha * 0.3;
            node.vy += (center.y - node.y) * alpha * 0.3;
          }
        });
      });
    }

    // Render Links
    const linkSelection = this.linkLayer.selectAll('g.link-group')
      .data(this.links, d => `${d.source.id || d.source}-${d.target.id || d.target}-${d.type}`);

    linkSelection.exit().remove();

    const linkEnter = linkSelection.enter().append('g')
      .attr('class', 'link-group');

    // Link line
    linkEnter.append('path')
      .attr('class', d => `link-path ${d.type === 'circular' ? 'circular-flow-edge' : ''}`)
      .attr('stroke', d => this.getLinkColor(d))
      .attr('stroke-width', d => this.getLinkWidth(d))
      .attr('stroke-opacity', 0.6)
      .attr('fill', 'none')
      .attr('marker-end', d => this.getMarkerEnd(d));

    // Link label (stake / type badge)
    linkEnter.append('text')
      .attr('class', 'link-label')
      .attr('font-size', '9px')
      .attr('font-weight', '600')
      .attr('fill', d => d.type === 'circular' ? '#fb7185' : '#94a3b8')
      .attr('text-anchor', 'middle')
      .attr('dy', -4)
      .text(d => d.label || '');

    const linkGroup = linkEnter.merge(linkSelection);

    // Render Nodes
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

    // Node Shape based on Type
    nodeEnter.each((d, i, nodes) => {
      const el = d3.select(nodes[i]);
      const color = this.getNodeColor(d);

      if (d.type === 'person') {
        // Person Node: Circle with avatar icon/initial
        el.append('circle')
          .attr('r', 20)
          .attr('fill', '#1e293b')
          .attr('stroke', color)
          .attr('stroke-width', 2.5)
          .attr('filter', d.wealth_est ? 'url(#glow)' : null);

        el.append('text')
          .attr('text-anchor', 'middle')
          .attr('dy', 5)
          .attr('font-size', '13px')
          .attr('fill', '#f8fafc')
          .attr('font-weight', 'bold')
          .text(d.name.slice(-2)); // Last 2 Korean chars
      } else {
        // Company Node: Rounded Rect
        const width = d.is_holding ? 54 : 48;
        const height = d.is_holding ? 34 : 28;

        el.append('rect')
          .attr('x', -width / 2)
          .attr('y', -height / 2)
          .attr('width', width)
          .attr('height', height)
          .attr('rx', d.is_holding ? 8 : 6)
          .attr('fill', d.is_holding ? '#1e1b4b' : '#0f172a')
          .attr('stroke', d.is_holding ? '#f59e0b' : color)
          .attr('stroke-width', d.is_holding ? 3 : 2)
          .attr('filter', d.is_holding ? 'url(#glow)' : null);

        // Holding crown / badge icon
        if (d.is_holding) {
          el.append('circle')
            .attr('cx', width / 2 - 4)
            .attr('cy', -height / 2 + 4)
            .attr('r', 5)
            .attr('fill', '#f59e0b');
        }

        el.append('text')
          .attr('text-anchor', 'middle')
          .attr('dy', 4)
          .attr('font-size', '11px')
          .attr('font-weight', '600')
          .attr('fill', '#ffffff')
          .text(d.name.length > 5 ? d.name.slice(0, 4) + '..' : d.name);
      }

      // Bottom Full Label
      el.append('text')
        .attr('class', 'node-title-label')
        .attr('text-anchor', 'middle')
        .attr('dy', d.type === 'person' ? 34 : 30)
        .attr('font-size', '11px')
        .attr('font-weight', '700')
        .attr('fill', '#f1f5f9')
        .text(d.name);

      // Sub-label (title or market cap)
      el.append('text')
        .attr('class', 'node-sub-label')
        .attr('text-anchor', 'middle')
        .attr('dy', d.type === 'person' ? 46 : 42)
        .attr('font-size', '9px')
        .attr('fill', '#94a3b8')
        .text(d.type === 'person' ? (d.title || d.role) : (d.market_cap || ''));
    });

    const nodeGroup = nodeEnter.merge(nodeSelection);

    // Simulation Tick
    this.simulation.on('tick', () => {
      linkGroup.select('path').attr('d', d => {
        const dx = d.target.x - d.source.x;
        const dy = d.target.y - d.source.y;
        const dr = (d.type === 'circular' || d.type === 'marriage') ? Math.sqrt(dx * dx + dy * dy) * 1.3 : 0;
        if (dr === 0) {
          return `M${d.source.x},${d.source.y}L${d.target.x},${d.target.y}`;
        }
        return `M${d.source.x},${d.source.y}A${dr},${dr} 0 0,1 ${d.target.x},${d.target.y}`;
      });

      linkGroup.select('text').attr('transform', d => {
        const x = (d.source.x + d.target.x) / 2;
        const y = (d.source.y + d.target.y) / 2;
        return `translate(${x},${y})`;
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

  getLinkWidth(d) {
    if (d.type === 'circular') return 3.5;
    if (d.stake && d.stake > 20) return 3;
    if (d.stake && d.stake > 10) return 2.2;
    return 1.5;
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
    if (this.highlightedPath) return; // Don't override active path search

    if (!isHovering) {
      this.nodeLayer.selectAll('g.node-group').attr('opacity', 1);
      this.linkLayer.selectAll('g.link-group').attr('opacity', 1);
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
      .attr('opacity', d => connectedNodeIds.has(d.id) ? 1 : 0.15);

    this.linkLayer.selectAll('g.link-group')
      .attr('opacity', d => {
        const sourceId = d.source.id || d.source;
        const targetId = d.target.id || d.target;
        return (sourceId === node.id || targetId === node.id) ? 1 : 0.05;
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
      .attr('opacity', d => pathNodeSet.has(d.id) ? 1 : 0.12)
      .select('circle, rect')
      .attr('stroke', d => pathNodeSet.has(d.id) ? '#38bdf8' : this.getNodeColor(d))
      .attr('stroke-width', d => pathNodeSet.has(d.id) ? 4 : 2);

    this.linkLayer.selectAll('g.link-group')
      .attr('opacity', d => {
        const sourceId = d.source.id || d.source;
        const targetId = d.target.id || d.target;
        return (pathLinkPairSet.has(`${sourceId}->${targetId}`)) ? 1 : 0.05;
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
        return (pathLinkPairSet.has(`${sourceId}->${targetId}`)) ? 4 : this.getLinkWidth(d);
      });
  }

  clearHighlight() {
    this.highlightedPath = null;
    this.nodeLayer.selectAll('g.node-group')
      .attr('opacity', 1)
      .select('circle, rect')
      .attr('stroke', d => d.is_holding ? '#f59e0b' : this.getNodeColor(d))
      .attr('stroke-width', d => d.is_holding ? 3 : 2.5);

    this.linkLayer.selectAll('g.link-group')
      .attr('opacity', 1)
      .select('path')
      .attr('stroke', d => this.getLinkColor(d))
      .attr('stroke-width', d => this.getLinkWidth(d));
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

    const scale = 1.4;
    const x = this.width / 2 - node.x * scale;
    const y = this.height / 2 - node.y * scale;

    this.svg.transition().duration(600).call(
      this.zoom.transform,
      d3.zoomIdentity.translate(x, y).scale(scale)
    );
  }

  // Export high-res PNG
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

  // Drag handlers
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
