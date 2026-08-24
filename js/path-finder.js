/**
 * 대한민국 대기업 네트워크 - 6단계 인맥/지분 경로 탐색기 (Path Finder)
 * BFS & Dijkstra 최단 경로 탐색 알고리즘
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
   */
  findShortestPath(startNodeId, endNodeId) {
    if (!startNodeId || !endNodeId) return null;
    if (startNodeId === endNodeId) {
      return {
        found: true,
        distance: 0,
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
    const linkPathMap = new Map(); // targetId -> link used to reach it

    while (queue.length > 0) {
      const currentPath = queue.shift();
      const currentNodeId = currentPath[currentPath.length - 1];

      if (currentNodeId === endNodeId) {
        // Path found! Reconstruct steps
        return this.reconstructPath(currentPath, linkPathMap);
      }

      const neighbors = this.adjacency.get(currentNodeId) || [];
      for (const edge of neighbors) {
        const neighborId = edge.target;
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          linkPathMap.set(`${currentNodeId}->${neighborId}`, edge);
          queue.push([...currentPath, neighborId]);
        }
      }
    }

    return { found: false, error: '두 대상 간의 직접적인 연결 경로를 찾을 수 없습니다.' };
  }

  reconstructPath(nodeIds, linkPathMap) {
    const nodes = nodeIds.map(id => this.nodeMap.get(id));
    const links = [];
    const steps = [];

    for (let i = 0; i < nodeIds.length - 1; i++) {
      const u = nodeIds[i];
      const v = nodeIds[i + 1];
      const edge = linkPathMap.get(`${u}->${v}`);
      const link = edge ? edge.link : null;

      if (link) {
        links.push(link);
        const sourceNode = this.nodeMap.get(u);
        const targetNode = this.nodeMap.get(v);

        let relationDesc = link.label || link.type;
        if (link.type === 'ownership_corp' || link.type === 'ownership_person') {
          relationDesc = edge.direction === 'forward' 
            ? `➔ [${link.label}] 지분 보유 ➔`
            : `➔ [${link.label}] 지분 피소유 ➔`;
        } else if (link.type === 'circular') {
          relationDesc = `🔄 [${link.label}] 순환출자 ➔`;
        } else if (link.type === 'family') {
          relationDesc = `👨‍👩‍👧‍👦 [${link.label}] ➔`;
        } else if (link.type === 'marriage' || link.type === 'marriage_past') {
          relationDesc = `💍 [${link.label}] ➔`;
        } else {
          relationDesc = `🔗 [${link.label || '연결'}] ➔`;
        }

        steps.push({
          from: sourceNode,
          to: targetNode,
          link: link,
          direction: edge.direction,
          description: relationDesc
        });
      }
    }

    return {
      found: true,
      distance: nodes.length - 1,
      nodeIds: nodeIds,
      nodes: nodes,
      links: links,
      steps: steps
    };
  }
}
