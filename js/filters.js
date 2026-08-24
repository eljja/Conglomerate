/**
 * 대한민국 대기업 네트워크 - 필터 및 뷰 모드 관리자
 */

export class FilterManager {
  constructor(initialData, onFilterChange) {
    this.rawNetwork = initialData;
    this.onFilterChange = onFilterChange;

    this.state = {
      viewMode: 'holistic', // 'holistic', 'circular', 'dynasty', 'cluster'
      activeGroups: new Set(), // empty means ALL
      nodeTypes: {
        person: true,
        company: true,
        holding: true
      },
      linkTypes: {
        ownership: true,
        circular: true,
        family: true,
        marriage: true
      },
      minStake: 0,
      searchQuery: ''
    };

    // Initialize all available groups
    if (this.rawNetwork.groups) {
      this.rawNetwork.groups.forEach(g => this.state.activeGroups.add(g.id));
    }
  }

  setViewMode(mode) {
    this.state.viewMode = mode;
    this.applyViewModeDefaults(mode);
    this.notify();
  }

  applyViewModeDefaults(mode) {
    if (mode === 'circular') {
      // Prioritize companies, holdings, ownership & circular loops
      this.state.nodeTypes.person = true;
      this.state.nodeTypes.company = true;
      this.state.nodeTypes.holding = true;
      this.state.linkTypes.ownership = true;
      this.state.linkTypes.circular = true;
      this.state.linkTypes.family = false;
      this.state.linkTypes.marriage = false;
    } else if (mode === 'dynasty') {
      // Prioritize people, family bloodlines & marriage networks
      this.state.nodeTypes.person = true;
      this.state.nodeTypes.company = false;
      this.state.nodeTypes.holding = false;
      this.state.linkTypes.ownership = false;
      this.state.linkTypes.circular = false;
      this.state.linkTypes.family = true;
      this.state.linkTypes.marriage = true;
    } else if (mode === 'holistic' || mode === 'cluster') {
      // Enable all
      this.state.nodeTypes.person = true;
      this.state.nodeTypes.company = true;
      this.state.nodeTypes.holding = true;
      this.state.linkTypes.ownership = true;
      this.state.linkTypes.circular = true;
      this.state.linkTypes.family = true;
      this.state.linkTypes.marriage = true;
      this.state.minStake = 0;
    }
  }

  toggleGroup(groupId) {
    if (this.state.activeGroups.has(groupId)) {
      this.state.activeGroups.delete(groupId);
    } else {
      this.state.activeGroups.add(groupId);
    }
    this.notify();
  }

  selectAllGroups(allGroups) {
    allGroups.forEach(g => this.state.activeGroups.add(g.id));
    this.notify();
  }

  clearAllGroups() {
    this.state.activeGroups.clear();
    this.notify();
  }

  setNodeType(type, enabled) {
    this.state.nodeTypes[type] = enabled;
    this.notify();
  }

  setLinkType(type, enabled) {
    this.state.linkTypes[type] = enabled;
    this.notify();
  }

  setMinStake(stake) {
    this.state.minStake = Number(stake);
    this.notify();
  }

  setSearchQuery(query) {
    this.state.searchQuery = (query || '').trim().toLowerCase();
    this.notify();
  }

  notify() {
    if (typeof this.onFilterChange === 'function') {
      const filtered = this.getFilteredData();
      this.onFilterChange(filtered, this.state);
    }
  }

  getFilteredData() {
    const rawNodes = this.rawNetwork.nodes || [];
    const rawLinks = this.rawNetwork.links || [];

    // Filter nodes
    const validNodeIdSet = new Set();
    const filteredNodes = rawNodes.filter(node => {
      // 1. Group filter
      if (this.state.activeGroups.size > 0 && !this.state.activeGroups.has(node.group)) {
        return false;
      }

      // 2. Node type filter
      if (node.type === 'person' && !this.state.nodeTypes.person) return false;
      if (node.type === 'company') {
        if (node.is_holding && !this.state.nodeTypes.holding) return false;
        if (!node.is_holding && !this.state.nodeTypes.company) return false;
      }

      validNodeIdSet.add(node.id);
      return true;
    });

    // Filter links
    const filteredLinks = rawLinks.filter(link => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;

      // Both ends must be in filtered nodes
      if (!validNodeIdSet.has(sourceId) || !validNodeIdSet.has(targetId)) {
        return false;
      }

      // Link type filter
      if ((link.type === 'ownership_corp' || link.type === 'ownership_person') && !this.state.linkTypes.ownership) {
        return false;
      }
      if (link.type === 'circular' && !this.state.linkTypes.circular) {
        return false;
      }
      if (link.type === 'family' && !this.state.linkTypes.family) {
        return false;
      }
      if ((link.type === 'marriage' || link.type === 'marriage_past') && !this.state.linkTypes.marriage) {
        return false;
      }

      // Minimum stake filter (only applies to links with stake)
      if (link.stake !== undefined && link.stake < this.state.minStake) {
        return false;
      }

      return true;
    });

    // Re-verify isolated nodes in specific modes if needed
    return {
      nodes: filteredNodes,
      links: filteredLinks
    };
  }
}
