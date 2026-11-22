/**
 * 대한민국 대기업 네트워크 시각화 플랫폼 - 메인 애플리케이션 엔트리포인트 (v3.1.0)
 * 100% Client-Side Static & GitHub Pages Ready
 */

import { NetworkGraph } from './network-graph.js?v=3.1.0';
import { FilterManager } from './filters.js?v=3.1.0';
import { PathFinder } from './path-finder.js?v=3.1.0';
import { AnalyticsEngine } from './analytics.js?v=3.1.0';
import { UIController } from './ui-controller.js?v=3.1.0';

class ChaebolApp {
  constructor() {
    this.networkData = null;
    this.summaryData = null;
    this.currentViewMode = 'holistic';

    this.graphEngine = null;
    this.filterManager = null;
    this.pathFinder = null;
    this.analyticsEngine = null;
    this.uiController = null;
  }

  hideLoadingOverlay() {
    const overlay = document.getElementById('canvas-loading-overlay');
    if (overlay) {
      overlay.classList.add('hidden');
    }
  }

  async init() {
    try {
      await this.loadData();

      // Initialize Core Modules
      this.graphEngine = new NetworkGraph('graph-canvas-container', {
        onNodeClick: (node) => this.uiController.showInspector(node),
        onCanvasClick: () => this.uiController.closeInspector()
      });

      this.pathFinder = new PathFinder(this.networkData);
      this.analyticsEngine = new AnalyticsEngine(this.networkData.nodes, this.networkData.links);

      this.filterManager = new FilterManager(this.networkData, (filteredData, filterState) => {
        this.graphEngine.setData(filteredData, filterState.viewMode);
        this.analyticsEngine.updateData(filteredData.nodes, filteredData.links);
        this.uiController.updateKPICounters();
        this.uiController.syncFilterUI(filterState);
      });

      this.uiController = new UIController(this);

      // Populate Filters & UI
      if (this.summaryData && this.summaryData.groups) {
        this.uiController.populateGroupFilters(this.summaryData.groups);
      }

      this.uiController.populatePathOptions(this.networkData.nodes || []);
      this.uiController.updateKPICounters();
      this.bindTabNavigation();

      // Parse URL Deep Linking parameters (?node=... / ?view=... / ?search=... / ?guide=true)
      const urlParams = new URLSearchParams(window.location.search);
      const initialView = urlParams.get('view');
      const initialNodeId = urlParams.get('node');
      const initialSearch = urlParams.get('search');

      // Allow browser to paint the loading overlay cleanly before synchronous pre-warm layout
      requestAnimationFrame(() => {
        if (initialView && ['holistic', 'circular', 'dynasty', 'cluster', 'path', 'matrix'].includes(initialView)) {
          const tabBtn = document.querySelector(`.tab-btn[data-view-mode="${initialView}"]`);
          if (tabBtn) tabBtn.click();
        } else {
          const initialFiltered = this.filterManager.getFilteredData();
          this.graphEngine.setData(initialFiltered, 'holistic');
        }

        // Smoothly reveal the pre-warmed, perfectly fitted graph
        requestAnimationFrame(() => {
          this.hideLoadingOverlay();

          if (initialNodeId) {
            const targetNode = this.networkData.nodes.find(n => n.id === initialNodeId);
            if (targetNode) {
              setTimeout(() => {
                this.graphEngine.selectNode(targetNode, true, true);
              }, 120);
            }
          } else if (initialSearch && this.uiController.searchInput) {
            this.uiController.searchInput.value = initialSearch;
            this.uiController.handleSearchInput(initialSearch);
          }

          if (urlParams.get('guide') === 'true' || urlParams.get('info') === 'true') {
            document.getElementById('seo-guide-modal')?.classList.remove('closed');
          }
        });
      });

      console.log('✨ Chaebol Network Visualization Engine v3.0 Ready!');
    } catch (err) {
      console.error('Failed to initialize ChaebolApp:', err);
      this.hideLoadingOverlay();
      const container = document.getElementById('graph-canvas-container');
      if (container) {
        container.innerHTML = `
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #f43f5e; padding: 20px; text-align: center;">
            <h2 style="font-size: 1.3rem; margin-bottom: 10px;">데이터 로드 중 오류가 발생했습니다.</h2>
            <p style="color: #94a3b8; font-size: 0.9rem;">${err.message}</p>
          </div>
        `;
      }
    }
  }

  async loadData() {
    // Use versioned query string so repeat visits leverage browser cache instead of forcing fresh download every load!
    const v = '3.0.0';
    const [networkRes, summaryRes] = await Promise.all([
      fetch(`./data/chaebol_network.json?v=${v}`),
      fetch(`./data/groups_summary.json?v=${v}`)
    ]);

    if (!networkRes.ok || !summaryRes.ok) {
      throw new Error(`HTTP Error: Network status ${networkRes.status}, Summary status ${summaryRes.status}`);
    }

    this.networkData = await networkRes.json();
    this.summaryData = await summaryRes.json();
  }

  bindTabNavigation() {
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        const mode = tab.getAttribute('data-view-mode');
        this.switchViewMode(mode);
      });
    });
  }

  switchViewMode(mode) {
    this.currentViewMode = mode;
    const matrixContainer = document.getElementById('matrix-view-container');
    const canvasStage = document.getElementById('canvas-stage');
    const legendBar = document.getElementById('graph-legend-bar');
    const pathBanner = document.getElementById('path-finder-banner');

    if (mode === 'matrix') {
      if (matrixContainer) matrixContainer.style.display = 'block';
      if (canvasStage) canvasStage.style.display = 'none';
      this.uiController.closeInspector();
      this.uiController.renderMatrixView(this.summaryData, this.networkData);
    } else {
      if (matrixContainer) matrixContainer.style.display = 'none';
      if (canvasStage) canvasStage.style.display = 'block';
      if (legendBar) legendBar.style.display = 'flex';

      if (mode === 'path') {
        if (pathBanner) pathBanner.style.display = 'flex';
      } else {
        if (pathBanner) pathBanner.style.display = 'none';
      }

      this.filterManager.setViewMode(mode);
    }
  }
}

// Bootstrap application on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  const app = new ChaebolApp();
  window.app = app;
  app.init();
});
