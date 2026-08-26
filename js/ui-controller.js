/**
 * 대한민국 대기업 네트워크 - UI 컨트롤러 & 인터랙션 매니저
 */

export class UIController {
  constructor(app) {
    this.app = app;
    this.inspectorDrawer = document.getElementById('inspector-drawer');
    this.filterSidebar = document.getElementById('filter-sidebar');
    this.matrixView = document.getElementById('matrix-view-container');
    this.searchInput = document.getElementById('search-input');
    this.searchResultsDropdown = document.getElementById('search-results-dropdown');
    
    this.initEventListeners();
  }

  initEventListeners() {
    // Theme toggle
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => this.toggleTheme());
    }

    // Filter sidebar toggle
    const toggleFilterBtn = document.getElementById('toggle-filter-btn');
    if (toggleFilterBtn) {
      toggleFilterBtn.addEventListener('click', () => {
        this.filterSidebar.classList.toggle('closed');
      });
    }

    // Inspector close button
    const closeInspectorBtn = document.getElementById('close-inspector-btn');
    if (closeInspectorBtn) {
      closeInspectorBtn.addEventListener('click', () => {
        this.closeInspector();
      });
    }

    // Search autocomplete
    if (this.searchInput) {
      this.searchInput.addEventListener('input', (e) => this.handleSearchInput(e.target.value));
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-box-container')) {
          this.searchResultsDropdown.style.display = 'none';
        }
      });
    }

    // Canvas action buttons (zoom in/out/reset/png)
    document.getElementById('zoom-in-btn')?.addEventListener('click', () => this.app.graphEngine.zoomIn());
    document.getElementById('zoom-out-btn')?.addEventListener('click', () => this.app.graphEngine.zoomOut());
    document.getElementById('zoom-reset-btn')?.addEventListener('click', () => this.app.graphEngine.resetZoom());
    document.getElementById('export-png-btn')?.addEventListener('click', () => this.app.graphEngine.exportPNG());

    // Path finder trigger
    document.getElementById('run-path-btn')?.addEventListener('click', () => this.handleRunPathFinder());
    document.getElementById('clear-path-btn')?.addEventListener('click', () => this.handleClearPath());

    // Proportional Sizing toggle
    document.getElementById('toggle-proportional-size')?.addEventListener('change', (e) => {
      this.app.graphEngine.sizeScaleEnabled = e.target.checked;
      const currentFiltered = this.app.filterManager.getFilteredData();
      this.app.graphEngine.setData(currentFiltered, this.app.currentViewMode);
    });

    // Node Type Checkboxes
    document.getElementById('filter-node-person')?.addEventListener('change', (e) => {
      this.app.filterManager.setNodeType('person', e.target.checked);
    });
    document.getElementById('filter-node-holding')?.addEventListener('change', (e) => {
      this.app.filterManager.setNodeType('holding', e.target.checked);
    });
    document.getElementById('filter-node-company')?.addEventListener('change', (e) => {
      this.app.filterManager.setNodeType('company', e.target.checked);
    });

    // Link Type Checkboxes
    document.getElementById('filter-link-ownership')?.addEventListener('change', (e) => {
      this.app.filterManager.setLinkType('ownership', e.target.checked);
    });
    document.getElementById('filter-link-circular')?.addEventListener('change', (e) => {
      this.app.filterManager.setLinkType('circular', e.target.checked);
    });
    document.getElementById('filter-link-family')?.addEventListener('change', (e) => {
      this.app.filterManager.setLinkType('family', e.target.checked);
    });
    document.getElementById('filter-link-marriage')?.addEventListener('change', (e) => {
      this.app.filterManager.setLinkType('marriage', e.target.checked);
    });

    // Stake slider
    const stakeSlider = document.getElementById('stake-slider');
    const stakeValueDisplay = document.getElementById('stake-value-display');
    if (stakeSlider && stakeValueDisplay) {
      stakeSlider.addEventListener('input', (e) => {
        const val = e.target.value;
        stakeValueDisplay.textContent = `${val}% 이상`;
        this.app.filterManager.setMinStake(val);
      });
    }
  }

  toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', nextTheme);
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) {
      themeBtn.innerHTML = nextTheme === 'dark' ? '🌙' : '☀️';
    }
  }

  // Populate Groups in Filter Sidebar
  populateGroupFilters(groups) {
    const container = document.getElementById('group-pill-container');
    if (!container) return;

    container.innerHTML = '';
    groups.forEach(g => {
      const pill = document.createElement('div');
      pill.className = 'group-pill active';
      pill.setAttribute('data-group-id', g.id);
      pill.innerHTML = `
        <span class="legend-color-dot" style="background: ${g.color || '#6366f1'}"></span>
        <span>${g.name.split(' ')[0]}</span>
      `;
      pill.addEventListener('click', () => {
        pill.classList.toggle('active');
        this.app.filterManager.toggleGroup(g.id);
      });
      container.appendChild(pill);
    });

    document.getElementById('select-all-groups-btn')?.addEventListener('click', () => {
      container.querySelectorAll('.group-pill').forEach(p => p.classList.add('active'));
      this.app.filterManager.selectAllGroups(groups);
    });

    document.getElementById('clear-all-groups-btn')?.addEventListener('click', () => {
      container.querySelectorAll('.group-pill').forEach(p => p.classList.remove('active'));
      this.app.filterManager.clearAllGroups();
    });
  }

  // Populate Path Finder Select Options
  populatePathOptions(nodes) {
    const startSelect = document.getElementById('path-start-select');
    const endSelect = document.getElementById('path-end-select');
    if (!startSelect || !endSelect) return;

    startSelect.innerHTML = '<option value="">출발 대상 선택...</option>';
    endSelect.innerHTML = '<option value="">도착 대상 선택...</option>';

    // Sort by name
    const sortedNodes = [...nodes].sort((a, b) => a.name.localeCompare(b.name, 'ko'));

    sortedNodes.forEach(n => {
      const opt1 = document.createElement('option');
      opt1.value = n.id;
      opt1.textContent = `${n.type === 'person' ? '👤' : '🏢'} ${n.name} (${n.title || n.group})`;
      startSelect.appendChild(opt1);

      const opt2 = document.createElement('option');
      opt2.value = n.id;
      opt2.textContent = `${n.type === 'person' ? '👤' : '🏢'} ${n.name} (${n.title || n.group})`;
      endSelect.appendChild(opt2);
    });

    // Default suggestions
    startSelect.value = 'p_lee_jae_yong'; // 이재용
    endSelect.value = 'p_bang_si_hyuk'; // 방시혁
  }

  // Search Autocomplete
  handleSearchInput(query) {
    const cleanQuery = (query || '').trim().toLowerCase();
    if (!cleanQuery) {
      this.searchResultsDropdown.style.display = 'none';
      return;
    }

    const allNodes = this.app.networkData.nodes || [];
    const matched = allNodes.filter(n => 
      n.name.toLowerCase().includes(cleanQuery) ||
      (n.title && n.title.toLowerCase().includes(cleanQuery)) ||
      (n.group && n.group.toLowerCase().includes(cleanQuery))
    ).slice(0, 8);

    if (matched.length === 0) {
      this.searchResultsDropdown.innerHTML = `
        <div style="padding: 12px; font-size: 0.8rem; color: var(--text-muted); text-align: center;">
          일치하는 검색 결과가 없습니다.
        </div>
      `;
    } else {
      this.searchResultsDropdown.innerHTML = '';
      matched.forEach(n => {
        const item = document.createElement('div');
        item.className = 'search-result-item';
        item.innerHTML = `
          <div>
            <div style="font-weight: 700; font-size: 0.85rem;">${n.type === 'person' ? '👤' : '🏢'} ${n.name}</div>
            <div style="font-size: 0.72rem; color: var(--text-muted);">${n.title || n.industry || n.group}</div>
          </div>
          <span class="badge badge-group">${n.group}</span>
        `;
        item.addEventListener('click', () => {
          this.searchResultsDropdown.style.display = 'none';
          this.searchInput.value = n.name;
          this.app.graphEngine.centerNode(n.id);
          this.showInspector(n);
        });
        this.searchResultsDropdown.appendChild(item);
      });
    }

    this.searchResultsDropdown.style.display = 'block';
  }

  // Open Inspector Drawer
  showInspector(node) {
    this.inspectorDrawer.classList.remove('closed');
    const content = document.getElementById('inspector-dynamic-content');
    if (!content) return;

    const groupColor = this.app.graphEngine.getNodeColor(node);
    const links = this.app.networkData.links || [];

    // Filter outgoing & incoming connections
    const outgoing = links.filter(l => (l.source.id || l.source) === node.id);
    const incoming = links.filter(l => (l.target.id || l.target) === node.id);

    // Build Node Map for easy lookup
    const nodeMap = new Map(this.app.networkData.nodes.map(n => [n.id, n]));

    content.innerHTML = `
      <div class="profile-card">
        <div class="profile-top">
          <div class="profile-avatar" style="background: linear-gradient(135deg, ${groupColor}, #1e293b)">
            ${node.type === 'person' ? '👤' : (node.is_holding ? '👑' : '🏢')}
          </div>
          <div class="profile-title-area">
            <h2>${node.name}</h2>
            <p>${node.title || (node.is_holding ? '그룹 지주회사' : '주요 계열사')}</p>
          </div>
        </div>

        <div class="profile-badge-row">
          <span class="badge badge-group" style="border-color: ${groupColor}; color: ${groupColor}">${node.group.toUpperCase()}</span>
          ${node.generation ? `<span class="badge badge-gen">${node.generation}</span>` : ''}
          ${node.is_holding ? `<span class="badge badge-holding">지주회사</span>` : ''}
          ${node.role ? `<span class="badge" style="background: rgba(255,255,255,0.1); color: #fff">${node.role}</span>` : ''}
        </div>

        ${(node.wealth_est || node.market_cap) ? `
          <div class="metric-grid">
            <div class="metric-box">
              <label>${node.type === 'person' ? '추정 지분 평가액' : '시가총액 / 기업가치'}</label>
              <value>${node.wealth_est || node.market_cap}</value>
            </div>
            <div class="metric-box">
              <label>연결 관계 수</label>
              <value>${outgoing.length + incoming.length}개</value>
            </div>
          </div>
        ` : ''}

        <div class="profile-bio">
          ${node.desc || '대한민국 주요 대기업 지배구조 네트워크 구성원'}
        </div>

        <div style="display: flex; gap: 8px; margin-top: 6px;">
          <button id="set-path-start-btn" class="path-btn" style="flex: 1; font-size: 0.75rem; padding: 6px;">
            🚩 출발지로 지정
          </button>
          <button id="set-path-end-btn" class="path-btn" style="flex: 1; font-size: 0.75rem; padding: 6px; background: linear-gradient(135deg, #10b981, #059669)">
            🎯 도착지로 지정
          </button>
        </div>
      </div>

      <!-- Outgoing Connections -->
      ${outgoing.length > 0 ? `
        <div>
          <div class="section-title">
            <span>📤 소유 지분 및 가족/하위 관계 (${outgoing.length})</span>
          </div>
          <div class="conn-list">
            ${outgoing.map(l => {
              const targetNode = nodeMap.get(l.target.id || l.target);
              if (!targetNode) return '';
              return `
                <div class="conn-card" data-node-id="${targetNode.id}">
                  <div class="conn-left">
                    <span class="conn-tag ${this.getLinkTagClass(l.type)}">${this.getLinkTagLabel(l.type)}</span>
                    <div>
                      <div class="conn-name">${targetNode.name}</div>
                      <div class="conn-sub">${targetNode.title || targetNode.industry || targetNode.group}</div>
                    </div>
                  </div>
                  <div class="conn-right">
                    <div class="conn-value">${l.label || ''}</div>
                    ${l.amount_krw ? `<div class="conn-sub">${l.amount_krw}</div>` : ''}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Incoming Connections -->
      ${incoming.length > 0 ? `
        <div>
          <div class="section-title">
            <span>📥 피소유 지분 및 부모/상위 관계 (${incoming.length})</span>
          </div>
          <div class="conn-list">
            ${incoming.map(l => {
              const sourceNode = nodeMap.get(l.source.id || l.source);
              if (!sourceNode) return '';
              return `
                <div class="conn-card" data-node-id="${sourceNode.id}">
                  <div class="conn-left">
                    <span class="conn-tag ${this.getLinkTagClass(l.type)}">${this.getLinkTagLabel(l.type)}</span>
                    <div>
                      <div class="conn-name">${sourceNode.name}</div>
                      <div class="conn-sub">${sourceNode.title || sourceNode.industry || sourceNode.group}</div>
                    </div>
                  </div>
                  <div class="conn-right">
                    <div class="conn-value">${l.label || ''}</div>
                    ${l.amount_krw ? `<div class="conn-sub">${l.amount_krw}</div>` : ''}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      ` : ''}
    `;

    // Bind click events on connection items
    content.querySelectorAll('.conn-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.getAttribute('data-node-id');
        if (id) {
          this.app.graphEngine.centerNode(id);
          const target = nodeMap.get(id);
          if (target) this.showInspector(target);
        }
      });
    });

    // Bind Quick Path Assign buttons
    document.getElementById('set-path-start-btn')?.addEventListener('click', () => {
      const select = document.getElementById('path-start-select');
      if (select) {
        select.value = node.id;
        document.getElementById('path-finder-banner').style.display = 'flex';
      }
    });

    document.getElementById('set-path-end-btn')?.addEventListener('click', () => {
      const select = document.getElementById('path-end-select');
      if (select) {
        select.value = node.id;
        document.getElementById('path-finder-banner').style.display = 'flex';
      }
    });
  }

  getLinkTagClass(type) {
    if (type === 'circular') return 'circular';
    if (type === 'family') return 'family';
    if (type === 'marriage' || type === 'marriage_past') return 'marriage';
    return 'ownership';
  }

  getLinkTagLabel(type) {
    if (type === 'circular') return '🔄 순환출자';
    if (type === 'family') return '👨‍👩‍👧 혈연';
    if (type === 'marriage' || type === 'marriage_past') return '💍 혼맥';
    if (type === 'ownership_person') return '👤 개인보유';
    return '🏢 법인출자';
  }

  closeInspector() {
    this.inspectorDrawer.classList.add('closed');
  }

  // Handle Path Finder Execution
  handleRunPathFinder() {
    const startId = document.getElementById('path-start-select')?.value;
    const endId = document.getElementById('path-end-select')?.value;

    if (!startId || !endId) {
      alert('출발 대상과 도착 대상을 모두 선택해주세요.');
      return;
    }

    const result = this.app.pathFinder.findShortestPath(startId, endId);
    const stepsContainer = document.getElementById('path-steps-container');

    if (!result || !result.found) {
      if (stepsContainer) {
        stepsContainer.innerHTML = `<span style="color: #f43f5e; font-size: 0.8rem;">연결 경로를 찾을 수 없습니다.</span>`;
      }
      this.app.graphEngine.clearHighlight();
      return;
    }

    // Render Path Steps Breadcrumb
    if (stepsContainer) {
      stepsContainer.innerHTML = result.steps.map(step => `
        <span class="path-step-node">${step.from.name}</span>
        <span class="path-step-arrow">${step.description}</span>
      `).join('') + `<span class="path-step-node" style="border-color: #34d399; color: #34d399;">${result.nodes[result.nodes.length - 1].name}</span>`;
    }

    // Highlight in graph
    this.app.graphEngine.highlightPath(result);
  }

  handleClearPath() {
    document.getElementById('path-steps-container').innerHTML = '';
    this.app.graphEngine.clearHighlight();
  }

  // Render Matrix Analytics View
  renderMatrixView(summaryData, networkData) {
    if (!this.matrixView) return;

    const groups = summaryData.groups || [];
    const nodes = networkData.nodes || [];
    const links = networkData.links || [];

    // Filter Billionaires
    const billionaires = nodes
      .filter(n => n.type === 'person' && n.wealth_est)
      .sort((a, b) => {
        const valA = parseFloat(a.wealth_est.replace(/[^0-9.]/g, '')) || 0;
        const valB = parseFloat(b.wealth_est.replace(/[^0-9.]/g, '')) || 0;
        return valB - valA;
      });

    // Filter Circular Loops
    const circularLinks = links.filter(l => l.type === 'circular');

    this.matrixView.innerHTML = `
      <div class="matrix-header">
        <div class="matrix-title">
          <h2>📊 대한민국 대기업 지배구조 & 지분 종합 매트릭스</h2>
          <p style="color: var(--text-secondary); font-size: 0.9rem; margin-top: 4px;">
            공정거래위원회 기업집단 현황 및 DART 공시 기준 30대 그룹 요약
          </p>
        </div>
        <button id="close-matrix-btn" class="sidebar-toggle-btn" style="padding: 8px 16px; font-size: 0.9rem;">
          ✖ 캔버스 뷰로 돌아가기
        </button>
      </div>

      <div class="matrix-grid-sections">
        <!-- 1. Group Ranking Table -->
        <div class="matrix-card" style="grid-column: span 2;">
          <h3>🏢 주요 대기업 집단(재벌) 현황 및 지배구조 특징</h3>
          <table class="data-table">
            <thead>
              <tr>
                <th>순위</th>
                <th>그룹명</th>
                <th>총수 (동일인)</th>
                <th>공정자산 총액</th>
                <th>핵심 사업군</th>
                <th>지배구조 형태</th>
              </tr>
            </thead>
            <tbody>
              ${groups.map(g => `
                <tr>
                  <td><span class="badge badge-group" style="background: ${g.color}22; color: ${g.color}">${g.rank || '-'}위</span></td>
                  <td style="font-weight: 700;">${g.name}</td>
                  <td>${g.head}</td>
                  <td style="color: #34d399; font-weight: 700;">${g.asset_krw}</td>
                  <td>${(g.core_business || []).slice(0, 3).join(', ')}</td>
                  <td style="font-size: 0.8rem; color: var(--text-secondary);">${g.holding_structure}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <!-- 2. Top Wealth Billionaires -->
        <div class="matrix-card">
          <h3>💰 대기업 총수 및 오너 일가 주식 평가액 랭킹</h3>
          <table class="data-table">
            <thead>
              <tr>
                <th>순위</th>
                <th>인물</th>
                <th>소속 / 직함</th>
                <th>추정 지분 평가액</th>
              </tr>
            </thead>
            <tbody>
              ${billionaires.map((b, idx) => `
                <tr>
                  <td><span class="badge" style="background: rgba(255,255,255,0.08);">${idx + 1}</span></td>
                  <td style="font-weight: 700;">${b.name} (${b.generation || ''})</td>
                  <td>${b.title || b.group}</td>
                  <td style="color: #34d399; font-weight: 700;">${b.wealth_est}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <!-- 3. Circular Shareholdings & Special Loops -->
        <div class="matrix-card">
          <h3>🔄 대표 순환출자 및 핵심 지분 출자 고리</h3>
          <table class="data-table">
            <thead>
              <tr>
                <th>출자 회사 (Source)</th>
                <th>구분</th>
                <th>피출자 회사 (Target)</th>
                <th>지분율 (%)</th>
              </tr>
            </thead>
            <tbody>
              ${circularLinks.map(l => {
                const sName = typeof l.source === 'object' ? l.source.name : l.source;
                const tName = typeof l.target === 'object' ? l.target.name : l.target;
                return `
                  <tr>
                    <td style="font-weight: 700; color: #f43f5e;">${sName}</td>
                    <td><span class="badge" style="background: rgba(244,63,94,0.2); color: #fb7185;">순환출자</span></td>
                    <td style="font-weight: 700; color: #f43f5e;">${tName}</td>
                    <td style="color: #60a5fa; font-weight: 700;">${l.label}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById('close-matrix-btn')?.addEventListener('click', () => {
      this.app.switchViewMode('holistic');
    });
  }
}
