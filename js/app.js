/**
 * 대한민국 대기업 네트워크 시각화 플랫폼 - 메인 애플리케이션 엔트리포인트
 * 100% Static & GitHub Pages Ready
 */

import { NetworkGraphEngine } from './network-graph.js';
import { FilterManager } from './filters.js';
import { PathFinder } from './path-finder.js';
import { UIController } from './ui-controller.js';

class ChaebolApp {
  constructor() {
    this.networkData = null;
    this.summaryData = null;
    this.currentViewMode = 'holistic';

    this.graphEngine = null;
    this.filterManager = null;
    this.pathFinder = null;
    this.uiController = null;
  }

  async init() {
    try {
      console.log('🚀 Loading Chaebol Network Data...');
      await this.loadData();

      // Initialize Core Modules
      this.graphEngine = new NetworkGraphEngine('#graph-canvas-container', (node) => {
        this.uiController.showInspector(node);
      });

      this.pathFinder = new PathFinder(this.networkData);

      this.filterManager = new FilterManager(this.networkData, (filteredData, filterState) => {
        this.graphEngine.setData(filteredData, filterState.viewMode);
      });

      this.uiController = new UIController(this);

      // Populate Filters & UI
      if (this.summaryData && this.summaryData.groups) {
        this.graphEngine.setGroupColors(this.summaryData.groups);
        this.uiController.populateGroupFilters(this.summaryData.groups);
      }

      this.uiController.populatePathOptions(this.networkData.nodes || []);
      this.bindTabNavigation();

      // Initial Graph Render
      const initialFiltered = this.filterManager.getFilteredData();
      this.graphEngine.setData(initialFiltered, 'holistic');

      console.log('✨ Chaebol Network Visualization Engine Ready!');
    } catch (err) {
      console.error('Failed to initialize ChaebolApp:', err);
      document.getElementById('graph-canvas-container').innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #f43f5e; padding: 20px; text-align: center;">
          <h2 style="font-size: 1.3rem; margin-bottom: 10px;">데이터 로드 중 오류가 발생했습니다.</h2>
          <p style="color: #94a3b8; font-size: 0.9rem;">${err.message}</p>
        </div>
      `;
    }
  }

  async loadData() {
    // Load static JSON files (relative paths for GitHub Pages support)
    const [networkRes, summaryRes] = await Promise.all([
      fetch('./data/chaebol_network.json'),
      fetch('./data/groups_summary.json')
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
    const canvasContainer = document.getElementById('graph-canvas-container');
    const legendBar = document.getElementById('graph-legend-bar');
    const pathBanner = document.getElementById('path-finder-banner');

    if (mode === 'matrix') {
      if (matrixContainer) matrixContainer.style.display = 'block';
      if (canvasContainer) canvasContainer.style.display = 'none';
      if (legendBar) legendBar.style.display = 'none';
      if (pathBanner) pathBanner.style.display = 'none';
      this.uiController.renderMatrixView(this.summaryData, this.networkData);
    } else {
      if (matrixContainer) matrixContainer.style.display = 'none';
      if (canvasContainer) canvasContainer.style.display = 'block';
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
