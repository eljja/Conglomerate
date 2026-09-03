/**
 * 대한민국 대기업 네트워크 - UI 컨트롤러 & 인터랙션 매니저 (v2.0 Advanced)
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

    // Keyboard Shortcuts (ESC to close drawers/dropdowns/reset)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeInspector();
        if (this.searchResultsDropdown) {
          this.searchResultsDropdown.style.display = 'none';
        }
        if (this.app.graphEngine) {
          this.app.graphEngine.clearHighlight();
        }
      }
    });

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

  updateKPICounters() {
    if (!this.app.analyticsEngine) return;
    const kpi = this.app.analyticsEngine.getMacroKPIs();
    
    const elGroups = document.getElementById('kpi-total-groups');
    const elCompanies = document.getElementById('kpi-total-companies');
    const elPeople = document.getElementById('kpi-total-people');
    const elLoops = document.getElementById('kpi-total-loops');
    const elCapital = document.getElementById('kpi-total-capital');

    if (elGroups) elGroups.textContent = `${kpi.totalGroups}개`;
    if (elCompanies) elCompanies.textContent = `${kpi.totalCompanies}개사`;
    if (elPeople) elPeople.textContent = `${kpi.totalPeople}명`;
    if (elLoops) elLoops.textContent = `${kpi.circularCount}개 고리`;
    if (elCapital) elCapital.textContent = `${kpi.totalValTrillion}조 원`;
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

    startSelect.innerHTML = '';
    endSelect.innerHTML = '';

    const sortedNodes = [...nodes].sort((a, b) => a.name.localeCompare(b.name, 'ko'));

    sortedNodes.forEach(node => {
      const opt1 = document.createElement('option');
      opt1.value = node.id;
      opt1.textContent = `${node.type === 'person' ? '👤' : '🏢'} ${node.name} (${node.group || ''})`;
      startSelect.appendChild(opt1);

      const opt2 = document.createElement('option');
      opt2.value = node.id;
      opt2.textContent = `${node.type === 'person' ? '👤' : '🏢'} ${node.name} (${node.group || ''})`;
      endSelect.appendChild(opt2);
    });

    // Default pre-select: 이재용 -> 최태원 or 현대차
    startSelect.value = 'p_lee_jae_yong';
    endSelect.value = 'p_chey_tae_won';
  }

  // Search Autocomplete Handler
  handleSearchInput(query) {
    if (!query || query.trim().length === 0) {
      this.searchResultsDropdown.style.display = 'none';
      return;
    }

    const q = query.trim().toLowerCase();
    const nodes = this.app.networkData.nodes || [];
    const matches = nodes.filter(n => 
      n.name.toLowerCase().includes(q) ||
      (n.industry && n.industry.toLowerCase().includes(q)) ||
      (n.title && n.title.toLowerCase().includes(q)) ||
      (n.group && n.group.toLowerCase().includes(q))
    ).slice(0, 8);

    if (matches.length === 0) {
      this.searchResultsDropdown.innerHTML = `<div class="search-result-item" style="color: var(--text-muted);">검색 결과가 없습니다.</div>`;
      this.searchResultsDropdown.style.display = 'block';
      return;
    }

    this.searchResultsDropdown.innerHTML = matches.map(m => `
      <div class="search-result-item" data-node-id="${m.id}">
        <span style="font-size: 1rem;">${m.type === 'person' ? '👤' : m.is_holding ? '👑' : '🏢'}</span>
        <div>
          <div style="font-weight: 700;">${m.name} <span style="font-size: 0.75rem; color: var(--text-muted);">(${m.group || ''})</span></div>
          <div style="font-size: 0.75rem; color: var(--text-secondary);">${m.title || m.industry || ''}</div>
        </div>
      </div>
    `).join('');

    this.searchResultsDropdown.style.display = 'block';

    this.searchResultsDropdown.querySelectorAll('.search-result-item').forEach(item => {
      item.addEventListener('click', () => {
        const nodeId = item.getAttribute('data-node-id');
        const targetNode = nodes.find(n => n.id === nodeId);
        if (targetNode) {
          this.showInspector(targetNode);
          this.app.graphEngine.selectNode(targetNode, true);
        }
        this.searchResultsDropdown.style.display = 'none';
        this.searchInput.value = targetNode.name;
      });
    });
  }

  // Show Inspector Panel for Selected Node
  showInspector(node) {
    if (!this.inspectorDrawer) return;

    this.inspectorDrawer.classList.remove('closed');
    // Synchronize URL with active node for deep linking
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', `?node=${encodeURIComponent(node.id)}`);
    }
    const container = document.getElementById('inspector-dynamic-content');
    if (!container) return;

    const groupColor = this.app.graphEngine.getNodeColor(node);
    const links = this.app.networkData.links || [];

    // Filter connections
    const connectedLinks = links.filter(l => {
      const sId = typeof l.source === 'object' ? l.source.id : l.source;
      const tId = typeof l.target === 'object' ? l.target.id : l.target;
      return sId === node.id || tId === node.id;
    });

    const isPerson = node.type === 'person';

    container.innerHTML = `
      <div class="profile-card">
        <div class="profile-top">
          <div class="profile-avatar" style="background: ${groupColor};">
            ${isPerson ? '👤' : node.is_holding ? '👑' : '🏢'}
          </div>
          <div class="profile-title-area">
            <h2>${node.name}</h2>
            <p>${node.title || node.industry || ''}</p>
          </div>
        </div>

        <div class="profile-badge-row">
          <span class="badge badge-group" style="background: ${groupColor}22; color: ${groupColor}; border-color: ${groupColor}44;">
            ${(node.group || '').toUpperCase()}
          </span>
          ${node.is_holding ? '<span class="badge badge-holding">지주회사 (Holding)</span>' : ''}
          ${node.generation ? `<span class="badge badge-gen">${node.generation}</span>` : ''}
        </div>

        <div class="metric-grid">
          ${node.val_trillion ? `
            <div class="metric-box">
              <label>${isPerson ? '추정 주식 평가액' : '시가총액 / 기업가치'}</label>
              <value>약 ${node.val_trillion}조 원</value>
            </div>
          ` : ''}
          ${node.market_cap ? `
            <div class="metric-box">
              <label>공시 시가총액</label>
              <value>${node.market_cap}</value>
            </div>
          ` : ''}
          <div class="metric-box">
            <label>연결 네트워크 수</label>
            <value style="color: var(--accent-blue);">${connectedLinks.length}개 관계</value>
          </div>
        </div>

        <div class="profile-bio">
          ${node.desc || '등록된 상세 설명 정보가 없습니다.'}
        </div>
      </div>

      <!-- Connections Section -->
      <div>
        <div class="section-title">
          <span>🔗 연결된 지분 및 인맥 관계 (${connectedLinks.length})</span>
        </div>
        <div class="conn-list">
          ${connectedLinks.map(link => {
            const sId = typeof link.source === 'object' ? link.source.id : link.source;
            const tId = typeof link.target === 'object' ? link.target.id : link.target;
            const isSource = sId === node.id;
            const otherId = isSource ? tId : sId;
            const otherNode = this.app.networkData.nodes.find(n => n.id === otherId) || { name: otherId };

            const tagClass = link.type.includes('ownership') ? 'ownership' : link.type === 'circular' ? 'circular' : link.type === 'marriage' ? 'marriage' : 'family';
            const tagLabel = link.type === 'circular' ? '순환출자' : link.type.includes('ownership') ? (isSource ? '출자 ➔' : '피출자 ⬅') : link.type === 'marriage' ? '혼맥' : '혈연';

            return `
              <div class="conn-card" data-node-id="${otherNode.id}">
                <div class="conn-left">
                  <span class="conn-tag ${tagClass}">${tagLabel}</span>
                  <div>
                    <div class="conn-name">${otherNode.name}</div>
                    <div class="conn-sub">${link.desc || ''}</div>
                  </div>
                </div>
                <div class="conn-right">
                  <div class="conn-value">${link.label || ''}</div>
                  ${link.amount_krw ? `<div class="conn-sub">${link.amount_krw}</div>` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    // Click to navigate to other node with smooth camera autofocus
    container.querySelectorAll('.conn-card').forEach(card => {
      card.addEventListener('click', () => {
        const targetId = card.getAttribute('data-node-id');
        const targetNode = this.app.networkData.nodes.find(n => n.id === targetId);
        if (targetNode) {
          this.showInspector(targetNode);
          this.app.graphEngine.selectNode(targetNode, true);
        }
      });
    });
  }

  closeInspector() {
    if (this.inspectorDrawer) {
      this.inspectorDrawer.classList.add('closed');
    }
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }

  handleRunPathFinder() {
    const startId = document.getElementById('path-start-select')?.value;
    const endId = document.getElementById('path-end-select')?.value;
    const pathType = document.getElementById('path-type-select')?.value || 'all';

    if (!startId || !endId) return;

    const result = this.app.pathFinder.findShortestPath(startId, endId, pathType);
    const stepsContainer = document.getElementById('path-steps-container');

    if (!result || !result.found) {
      if (stepsContainer) {
        stepsContainer.innerHTML = `<span style="color: #f43f5e; font-size: 0.8rem;">${result?.error || '연결 경로를 찾을 수 없습니다.'}</span>`;
      }
      this.app.graphEngine.clearHighlight();
      return;
    }

    // Render Path Steps Breadcrumb
    if (stepsContainer) {
      stepsContainer.innerHTML = result.steps.map(step => `
        <span class="path-step-node">${step.from.name}</span>
        <span class="path-step-arrow">➔ ${step.label} ➔</span>
      `).join('') + `<span class="path-step-node" style="border-color: #34d399; color: #34d399;">${result.nodes[result.nodes.length - 1].name}</span>`;
    }

    // Highlight in graph
    this.app.graphEngine.highlightPath(result);
  }

  handleClearPath() {
    const stepsContainer = document.getElementById('path-steps-container');
    if (stepsContainer) stepsContainer.innerHTML = '';
    this.app.graphEngine.clearHighlight();
  }

  // Render Matrix Analytics View with Centrality & Capital Flow Explorer
  renderMatrixView(summaryData, networkData) {
    if (!this.matrixView) return;

    const groups = summaryData.groups || [];
    const nodes = networkData.nodes || [];
    const links = networkData.links || [];

    // Centrality stats
    const degreeStats = this.app.analyticsEngine ? this.app.analyticsEngine.calculateDegreeCentrality().slice(0, 10) : [];
    const betweennessStats = this.app.analyticsEngine ? this.app.analyticsEngine.calculateBetweennessCentrality().slice(0, 10) : [];

    // Billionaires
    const billionaires = nodes
      .filter(n => n.type === 'person' && n.val_trillion)
      .sort((a, b) => b.val_trillion - a.val_trillion);

    // Circular Loops
    const circularLinks = links.filter(l => l.type === 'circular' || l.highlight_loop);

    this.matrixView.innerHTML = `
      <div class="matrix-header">
        <div class="matrix-title">
          <h2>📊 대한민국 대기업 지배구조 & 네트워크 심층 분석 매트릭스</h2>
          <p style="color: var(--text-secondary); font-size: 0.9rem; margin-top: 4px;">
            공정거래위원회 공시대상기업집단 및 DART 공시 기준 최신 지분율·네트워크 중심성 전수 분석
          </p>
        </div>
        <button id="close-matrix-btn" class="sidebar-toggle-btn" style="padding: 8px 16px; font-size: 0.9rem;">
          ✖ 캔버스 뷰로 돌아가기
        </button>
      </div>

      <div class="matrix-grid-sections">
        <!-- 1. Group Ranking Table -->
        <div class="matrix-card" style="grid-column: span 2;">
          <h3>🏢 대한민국 20대 대기업 집단(재벌) 현황 및 지배구조 형태</h3>
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

        <!-- 2. Degree Centrality (연결도 허브) -->
        <div class="matrix-card">
          <h3>⚡ 네트워크 연결도(Degree Centrality) Top 10</h3>
          <p style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 12px;">가장 많은 지분 출자·피출자 및 혼맥 관계를 보유한 핵심 허브</p>
          <table class="data-table">
            <thead>
              <tr>
                <th>순위</th>
                <th>대상</th>
                <th>유형/그룹</th>
                <th>총 연결수</th>
                <th>출자(Out) / 피출자(In)</th>
              </tr>
            </thead>
            <tbody>
              ${degreeStats.map((item, idx) => `
                <tr>
                  <td><span class="badge" style="background: rgba(255,255,255,0.08);">${idx + 1}</span></td>
                  <td style="font-weight: 700;">${item.node.name}</td>
                  <td>${item.node.type === 'person' ? '👤 오너' : '🏢 기업'} (${item.node.group})</td>
                  <td style="color: #60a5fa; font-weight: 700;">${item.totalConnections}개</td>
                  <td style="font-size: 0.8rem; color: var(--text-secondary);">${item.ownershipOut} / ${item.ownershipIn}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <!-- 3. Betweenness Centrality (매개 중심성: 가교 역할) -->
        <div class="matrix-card">
          <h3>🌉 매개 중심성(Betweenness Centrality) Top 10</h3>
          <p style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 12px;">재계 생태계에서 서로 다른 가문과 기업을 잇는 핵심 교량 역할</p>
          <table class="data-table">
            <thead>
              <tr>
                <th>순위</th>
                <th>대상</th>
                <th>유형/그룹</th>
                <th>매개 중심 지수</th>
              </tr>
            </thead>
            <tbody>
              ${betweennessStats.map((item, idx) => `
                <tr>
                  <td><span class="badge" style="background: rgba(255,255,255,0.08);">${idx + 1}</span></td>
                  <td style="font-weight: 700;">${item.node.name}</td>
                  <td>${item.node.type === 'person' ? '👤 인물' : '👑 지주/핵심사'} (${item.node.group})</td>
                  <td style="color: #a855f7; font-weight: 700;">${item.betweenness}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <!-- 4. Top Wealth Billionaires -->
        <div class="matrix-card">
          <h3>💰 대기업 총수 및 오너 일가 추정 자산 랭킹</h3>
          <table class="data-table">
            <thead>
              <tr>
                <th>순위</th>
                <th>인물</th>
                <th>소속 / 직함</th>
                <th>추정 자산/평가액</th>
              </tr>
            </thead>
            <tbody>
              ${billionaires.map((b, idx) => `
                <tr>
                  <td><span class="badge" style="background: rgba(255,255,255,0.08);">${idx + 1}</span></td>
                  <td style="font-weight: 700;">${b.name} (${b.generation || ''})</td>
                  <td>${b.title || b.group}</td>
                  <td style="color: #34d399; font-weight: 700;">약 ${b.val_trillion}조 원</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <!-- 5. Circular Shareholdings & Special Loops -->
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
                    <td style="color: #60a5fa; font-weight: 700;">${l.label || ''}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>

        <!-- 6. Hanjin KAL Management Dispute & Hoban Group Rivalry Analysis -->
        <div class="matrix-card" style="grid-column: span 2; border-color: rgba(56, 189, 248, 0.3); background: rgba(15, 23, 42, 0.85);">
          <h3>⚔️ 한진칼·대한항공 경영권 분쟁 & 호반그룹 지분 대치 심층 분석</h3>
          <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 16px;">
            한진그룹 지주사 <strong style="color:#60a5fa;">한진칼</strong>을 둘러싼 <strong>조원태 회장 연합</strong>과 <strong>호반건설(단일 2대 주주)</strong>의 지분 분포 및 아시아나항공 메가 합병 구도
          </p>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-bottom: 16px;">
            <!-- Camp 1: Cho Won-tae -->
            <div style="background: rgba(30, 41, 59, 0.7); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 8px; padding: 16px;">
              <h4 style="color: #60a5fa; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between;">
                <span>🛡️ 조원태 회장 연합 (방어)</span>
                <span class="badge" style="background: rgba(59, 130, 246, 0.2); color: #60a5fa;">합산 약 45.3%</span>
              </h4>
              <ul style="list-style: none; padding: 0; margin: 0; font-size: 0.85rem; line-height: 1.8;">
                <li>• <strong>조원태 회장 및 일가/특수관계인</strong>: <span style="color:#34d399; font-weight:700;">19.79%</span> (조원태 5.78%, 조현민 5.73%, 이명희 등)</li>
                <li>• <strong>델타항공 (Delta Air Lines)</strong>: <span style="color:#60a5fa; font-weight:700;">14.90%</span> (글로벌 스카이팀 백기사)</li>
                <li>• <strong>KDB 한국산업은행</strong>: <span style="color:#a78bfa; font-weight:700;">10.58%</span> (아시아나 합병 지원 캐스팅보트)</li>
              </ul>
            </div>

            <!-- Camp 2: Hoban Group -->
            <div style="background: rgba(30, 41, 59, 0.7); border: 1px solid rgba(13, 148, 136, 0.4); border-radius: 8px; padding: 16px;">
              <h4 style="color: #2dd4bf; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between;">
                <span>⚡ 호반그룹 (도전자 / 잠재 경쟁)</span>
                <span class="badge" style="background: rgba(13, 148, 136, 0.2); color: #2dd4bf;">지분 17.43%</span>
              </h4>
              <ul style="list-style: none; padding: 0; margin: 0; font-size: 0.85rem; line-height: 1.8;">
                <li>• <strong>호반건설 & 계열사</strong>: <span style="color:#f59e0b; font-weight:700;">17.43%</span> (단일 최대 2대 주주)</li>
                <li>• <strong>배경</strong>: 2022년 KCGI(강성부 펀드) 지분 전량 인수 후 장내 매집 확대</li>
                <li>• <strong>보유 목적</strong>: 단순투자 ➔ 일반투자(경영권 영향 가능)로 전환, 잠재적 경영권 위협 잔존</li>
              </ul>
            </div>

            <!-- Camp 3: Past 3-Party Alliance -->
            <div style="background: rgba(30, 41, 59, 0.7); border: 1px solid rgba(244, 63, 94, 0.3); border-radius: 8px; padding: 16px;">
              <h4 style="color: #fb7185; margin-bottom: 10px;">📜 과거 3자 연합 분쟁 & 메가캐리어 합병</h4>
              <ul style="list-style: none; padding: 0; margin: 0; font-size: 0.85rem; line-height: 1.7; color: var(--text-secondary);">
                <li>• <strong>3자 연합</strong>: 조현아(전 부사장) + KCGI + 반도건설 연합으로 조원태 퇴진 요구</li>
                <li>• <strong>산업은행 개입</strong>: 아시아나항공 인수 자금으로 한진칼에 8천억 출자하며 조원태 승리</li>
                <li>• <strong>대한항공 ➔ 아시아나항공</strong>: 63.9% 지분 인수로 세계 10대 글로벌 메가캐리어 탄생</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('close-matrix-btn')?.addEventListener('click', () => {
      this.app.switchViewMode('holistic');
    });
  }
}
