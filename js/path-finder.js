/**
 * 대한민국 대기업 네트워크 - 6단계 인맥/지분 경로 탐색기 (Path Finder v2.0)
 * BFS & Dijkstra 최단 경로 탐색 알고리즘 + 다중 경로 모드(통합/지분/혼맥)
 */

export class PathFinder {
  constructor(networkData) {
    this.nodes = networkData.nodes || [];
    this.links = networkData.links || [];
    this.adjacency = new Map();
    this.nodeMap = new Map();
    this.buildGraph();
  }

  updateData(networkData) {
    this.nodes = networkData.nodes || [];
    this.links = networkData.links || [];
    this.buildGraph();
  }

  buildGraph() {
    this.adjacency.clear();
    this.nodeMap.clear();

    // Map all nodes
    this.nodes.forEach(node => {
      this.nodeMap.set(node.id, node);
      this.adjacency.set(node.id, []);
    });

    // Build bidirectional adjacency list for relational finding
    this.links.forEach(link => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;

      if (this.adjacency.has(sourceId) && this.adjacency.has(targetId)) {
        this.adjacency.get(sourceId).push({
          target: targetId,
          link: link,
          direction: 'forward'
        });

        this.adjacency.get(targetId).push({
          target: sourceId,
          link: link,
          direction: 'backward'
        });
      }
    });
  }

  /**
   * Find shortest path between startNodeId and endNodeId using BFS
   * @param {string} startNodeId
   * @param {string} endNodeId
   * @param {string} filterMode 'all' | 'ownership' | 'family'
   */
  findShortestPath(startNodeId, endNodeId, filterMode = 'all') {
    if (!startNodeId || !endNodeId) return null;
    if (startNodeId === endNodeId) {
      return {
        found: true,
        distance: 0,
        nodeIds: [startNodeId],
        nodes: [this.nodeMap.get(startNodeId)],
        links: [],
        steps: []
      };
    }

    if (!this.nodeMap.has(startNodeId) || !this.nodeMap.has(endNodeId)) {
      return { found: false, error: '존재하지 않는 노드입니다.' };
    }

    const queue = [[startNodeId]];
    const visited = new Set([startNodeId]);
    const linkPathMap = new Map(); // 'u->v' -> edge

    while (queue.length > 0) {
      const currentPath = queue.shift();
      const currentNodeId = currentPath[currentPath.length - 1];

      if (currentNodeId === endNodeId) {
        return this.reconstructPath(currentPath, linkPathMap);
      }

      const neighbors = this.adjacency.get(currentNodeId) || [];
      for (const edge of neighbors) {
        const link = edge.link;
        
        // Check filter mode
        if (filterMode === 'ownership') {
          if (!['ownership_corp', 'ownership_person', 'circular'].includes(link.type)) continue;
        } else if (filterMode === 'family') {
          if (!['family', 'marriage', 'marriage_past'].includes(link.type)) continue;
        }

        const neighborId = edge.target;
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          linkPathMap.set(`${currentNodeId}->${neighborId}`, edge);
          queue.push([...currentPath, neighborId]);
        }
      }
    }

    const modeLabel = filterMode === 'ownership' ? '지분 출자 관계' : filterMode === 'family' ? '혈연/혼맥 관계' : '전체 네트워크';
    return { found: false, error: `${modeLabel} 내에서 두 대상 간의 직접적인 연결 경로를 찾을 수 없습니다.` };
  }

  reconstructPath(nodeIds, linkPathMap) {
    const nodes = nodeIds.map(id => this.nodeMap.get(id));
    const links = [];
    const steps = [];

    for (let i = 0; i < nodeIds.length - 1; i++) {
      const u = nodeIds[i];
      const v = nodeIds[i + 1];
      const edge = linkPathMap.get(`${u}->${v}`);
      if (edge) {
        links.push(edge.link);
        const sourceNode = this.nodeMap.get(u);
        const targetNode = this.nodeMap.get(v);
        steps.push({
          from: sourceNode,
          to: targetNode,
          link: edge.link,
          direction: edge.direction,
          label: edge.link.label || '연결',
          desc: edge.link.desc || ''
        });
      }
    }

    return {
      found: true,
      distance: steps.length,
      nodeIds: nodeIds,
      nodes: nodes,
      links: links,
      steps: steps
    };
  }
}
