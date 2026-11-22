/**
 * 대한민국 대기업 네트워크 - 필터 및 뷰 모드 관리자 (v3.0)
 */

export class FilterManager {
  constructor(initialData, onFilterChange) {
    this.rawNetwork = initialData;
    this.onFilterChange = onFilterChange;

    // Collect all unique group IDs present in network nodes
    this.allGroupIds = new Set();
    (this.rawNetwork.nodes || []).forEach(n => {
      if (n.group) this.allGroupIds.add(n.group);
    });

    this.state = {
      viewMode: 'holistic', // 'holistic', 'circular', 'dynasty', 'cluster', 'path'
      activeGroups: new Set(this.allGroupIds),
      allGroupsMode: true, // true = show all groups including any ungrouped nodes
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
  }

  registerSummaryGroups(groups = []) {
    groups.forEach(g => {
      if (g && g.id) {
        this.allGroupIds.add(g.id);
        if (this.state.allGroupsMode) {
          this.state.activeGroups.add(g.id);
        }
      }
    });
  }

  setViewMode(mode) {
    this.state.viewMode = mode;
    this.applyViewModeDefaults(mode);
    this.notify();
  }

  applyViewModeDefaults(mode) {
    if (mode === 'circular') {
      this.state.nodeTypes.person = true;
      this.state.nodeTypes.company = true;
      this.state.nodeTypes.holding = true;
      this.state.linkTypes.ownership = true;
      this.state.linkTypes.circular = true;
      this.state.linkTypes.family = false;
      this.state.linkTypes.marriage = false;
    } else if (mode === 'dynasty') {
      this.state.nodeTypes.person = true;
      this.state.nodeTypes.company = false;
      this.state.nodeTypes.holding = false;
      this.state.linkTypes.ownership = false;
      this.state.linkTypes.circular = false;
      this.state.linkTypes.family = true;
      this.state.linkTypes.marriage = true;
    } else if (mode === 'holistic' || mode === 'cluster' || mode === 'path') {
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
    this.state.allGroupsMode = false;
    if (this.state.activeGroups.has(groupId)) {
      this.state.activeGroups.delete(groupId);
    } else {
      this.state.activeGroups.add(groupId);
    }
    this.notify();
  }

  soloGroup(groupId) {
    this.state.allGroupsMode = false;
    this.state.activeGroups.clear();
    this.state.activeGroups.add(groupId);
    this.notify();
  }

  selectAllGroups(allGroups = []) {
    this.state.allGroupsMode = true;
    this.allGroupIds.forEach(id => this.state.activeGroups.add(id));
    allGroups.forEach(g => this.state.activeGroups.add(g.id));
    this.notify();
  }

  clearAllGroups() {
    this.state.allGroupsMode = false;
    this.state.activeGroups.clear();
    this.notify();
  }

  resetAllFilters(allGroups = []) {
    this.state.allGroupsMode = true;
    this.allGroupIds.forEach(id => this.state.activeGroups.add(id));
    allGroups.forEach(g => this.state.activeGroups.add(g.id));
    this.state.nodeTypes = { person: true, company: true, holding: true };
    this.state.linkTypes = { ownership: true, circular: true, family: true, marriage: true };
    this.state.minStake = 0;
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

    // 1. Filter nodes
    const validNodeIdSet = new Set();
    let filteredNodes = rawNodes.filter(node => {
      // Group filter (if not in allGroupsMode, must be in activeGroups)
      if (!this.state.allGroupsMode && !this.state.activeGroups.has(node.group)) {
        return false;
      }

      // Node type filter
      if (node.type === 'person' && !this.state.nodeTypes.person) return false;
      if (node.type === 'company') {
        if (node.is_holding && !this.state.nodeTypes.holding) return false;
        if (!node.is_holding && !this.state.nodeTypes.company) return false;
      }

      validNodeIdSet.add(node.id);
      return true;
    });

    // 2. Filter links
    const filteredLinks = rawLinks.filter(link => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;

      // Both ends must be in filtered nodes
      if (!validNodeIdSet.has(sourceId) || !validNodeIdSet.has(targetId)) {
        return false;
      }

      // Link type filter
      if ((link.type === 'ownership_corp' || link.type === 'ownership_person' || link.type === 'business_alliance') && !this.state.linkTypes.ownership) {
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

    // 3. Prune isolated nodes in focused modes (dynasty / circular) for visual clarity
    if (this.state.viewMode === 'dynasty' || this.state.viewMode === 'circular') {
      const connectedIds = new Set();
      filteredLinks.forEach(l => {
        const s = typeof l.source === 'object' ? l.source.id : l.source;
        const t = typeof l.target === 'object' ? l.target.id : l.target;
        connectedIds.add(s);
        connectedIds.add(t);
      });
      if (connectedIds.size > 0) {
        filteredNodes = filteredNodes.filter(n => connectedIds.has(n.id));
      }
    }

    return {
      nodes: filteredNodes,
      links: filteredLinks
    };
  }
}
