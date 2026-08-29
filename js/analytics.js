/**
 * 대한민국 대기업 네트워크 - 심층 분석(Analytics) & 중심성(Centrality) 엔진
 */

export class AnalyticsEngine {
  constructor(nodes, links) {
    this.nodes = nodes || [];
    this.links = links || [];
    this.nodeMap = new Map();
    this.nodes.forEach(n => this.nodeMap.set(n.id, n));
    this.adjList = new Map();
    this.buildAdjacency();
  }

  updateData(nodes, links) {
    this.nodes = nodes || [];
    this.links = links || [];
    this.nodeMap.clear();
    this.nodes.forEach(n => this.nodeMap.set(n.id, n));
    this.buildAdjacency();
  }

  buildAdjacency() {
    this.adjList.clear();
    this.nodes.forEach(n => this.adjList.set(n.id, []));

    this.links.forEach(link => {
      const u = typeof link.source === 'object' ? link.source.id : link.source;
      const v = typeof link.target === 'object' ? link.target.id : link.target;
      if (this.adjList.has(u) && this.adjList.has(v)) {
        this.adjList.get(u).push({ target: v, link });
        this.adjList.get(v).push({ target: u, link });
      }
    });
  }

  /**
   * 1. Degree Centrality (연결 중심성) 계산
   */
  calculateDegreeCentrality() {
    const stats = this.nodes.map(node => {
      const connectedLinks = this.links.filter(l => {
        const u = typeof l.source === 'object' ? l.source.id : l.source;
        const v = typeof l.target === 'object' ? l.target.id : l.target;
        return u === node.id || v === node.id;
      });

      const ownershipOut = connectedLinks.filter(l => {
        const u = typeof l.source === 'object' ? l.source.id : l.source;
        return u === node.id && (l.type === 'ownership_corp' || l.type === 'ownership_person' || l.type === 'circular');
      }).length;

      const ownershipIn = connectedLinks.filter(l => {
        const v = typeof l.target === 'object' ? l.target.id : l.target;
        return v === node.id && (l.type === 'ownership_corp' || l.type === 'ownership_person' || l.type === 'circular');
      }).length;

      const familyCount = connectedLinks.filter(l => l.type === 'family' || l.type === 'marriage' || l.type === 'marriage_past').length;

      return {
        node,
        totalConnections: connectedLinks.length,
        ownershipOut,
        ownershipIn,
        familyCount,
        score: connectedLinks.length
      };
    });

    return stats.sort((a, b) => b.totalConnections - a.totalConnections);
  }

  /**
   * 2. Betweenness Centrality (매개 중심성: Brandes Algorithm)
   */
  calculateBetweennessCentrality() {
    const CB = {};
    this.nodes.forEach(n => CB[n.id] = 0);

    const nodeIds = this.nodes.map(n => n.id);

    nodeIds.forEach(s => {
      const S = [];
      const P = {};
      const sigma = {};
      const d = {};

      nodeIds.forEach(w => {
        P[w] = [];
        sigma[w] = 0;
        d[w] = -1;
      });

      sigma[s] = 1;
      d[s] = 0;

      const Q = [s];

      while (Q.length > 0) {
        const v = Q.shift();
        S.push(v);

        const neighbors = this.adjList.get(v) || [];
        for (let item of neighbors) {
          const w = item.target;
          if (d[w] < 0) {
            Q.push(w);
            d[w] = d[v] + 1;
          }
          if (d[w] === d[v] + 1) {
            sigma[w] += sigma[v];
            P[w].push(v);
          }
        }
      }

      const delta = {};
      nodeIds.forEach(w => delta[w] = 0);

      while (S.length > 0) {
        const w = S.pop();
        for (let v of P[w]) {
          delta[v] += (sigma[v] / sigma[w]) * (1 + delta[w]);
        }
        if (w !== s) {
          CB[w] += delta[w];
        }
      }
    });

    const results = this.nodes.map(node => ({
      node,
      betweenness: CB[node.id] ? Number(CB[node.id].toFixed(2)) : 0
    }));

    return results.sort((a, b) => b.betweenness - a.betweenness);
  }

  /**
   * 3. 그룹별 자본 흐름 계층 트리 (Capital Flow Hierarchy) 생성
   */
  getGroupCapitalFlow(groupId) {
    const groupNodes = this.nodes.filter(n => n.group === groupId || (groupId === 'all'));
    const groupLinks = this.links.filter(l => {
      const u = typeof l.source === 'object' ? l.source.id : l.source;
      const v = typeof l.target === 'object' ? l.target.id : l.target;
      const uNode = this.nodeMap.get(u);
      const vNode = this.nodeMap.get(v);
      return uNode && vNode && (uNode.group === groupId || vNode.group === groupId);
    });

    // 1. 오너/최상위 지주사 찾기
    const rootNodes = groupNodes.filter(n => {
      if (n.type === 'person' && (n.role.includes('총수') || n.role.includes('회장') || n.role.includes('창업주'))) return true;
      if (n.type === 'company' && n.is_holding) return true;
      return false;
    });

    return {
      groupId,
      nodes: groupNodes,
      links: groupLinks,
      rootNodes
    };
  }

  /**
   * 4. 거시적 통계 KPI 메트릭 계산
   */
  getMacroKPIs() {
    const totalNodes = this.nodes.length;
    const totalCompanies = this.nodes.filter(n => n.type === 'company').length;
    const totalPeople = this.nodes.filter(n => n.type === 'person').length;
    const totalLinks = this.links.length;
    const circularLinks = this.links.filter(l => l.type === 'circular' || l.highlight_loop).length;
    
    const totalValTrillion = this.nodes.reduce((acc, n) => acc + (n.val_trillion || 0), 0);

    const groupSet = new Set(this.nodes.map(n => n.group).filter(Boolean));

    return {
      totalGroups: groupSet.size,
      totalNodes,
      totalCompanies,
      totalPeople,
      totalLinks,
      circularCount: circularLinks,
      totalValTrillion: Math.round(totalValTrillion)
    };
  }
}
