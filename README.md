# 🇰🇷 대한민국 대기업 네트워크 & 지배구조·혼맥 인터랙티브 시각화 플랫폼 (v2.1)
> **Korean Chaebol Network & Corporate Governance / Dynastic Alliances Visualizer**

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Live%20Demo-success?style=for-the-badge&logo=github)](https://eljja.github.io/Conglomerate/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)
[![D3.js](https://img.shields.io/badge/D3.js-v7-orange.svg?style=for-the-badge&logo=d3.js)](https://d3js.org/)

대한민국 30대 대기업 집단(삼성, SK, 현대차, LG, 롯데, 한화, 신세계, CJ, 빅테크 등)의 **총수 및 오너 일가 인맥, 가계도·혼맥, 순환출자 고리, 모회사-자회사 소유 지분율**을 거시적으로 탐색할 수 있는 **100% 클라이언트 사이드 인터랙티브 시각화 웹 플랫폼**입니다.

👉 **실시간 라이브 데모**: [https://eljja.github.io/Conglomerate/](https://eljja.github.io/Conglomerate/)

---

## 🌟 핵심 기능 (Key Features)

### 1. 📏 직관적인 시각 계층 구조 (Visual Hierarchy)
- **원의 면적 = 자산/시가총액/재산 규모 비례 ($A \propto \text{Value}$)**
  - 수학적 제곱근 스케일($r \propto \sqrt{\text{Value}}$)을 적용하여 `삼성전자 (약 450조 원)`, `SK하이닉스 (140조)`, `LG에너지솔루션 (90조)`, `이재용 (약 14조)`, `서정진 (11조)` 등의 크기가 한눈에 직관적으로 비교됩니다.
  - 최상위 지주사(`삼성물산`, `SK(주)`, `(주)LG`, `현대모비스`)에는 **황금빛 외곽 링과 왕관 엠블럼**이 부여됩니다.
- **선 굵기 = 지분율(%) 비례 매핑**:
  - $1\% \sim 5\%$ 소수 지분부터 $50\% \sim 80\%+$ 과반 지배 지분까지 선 굵기가 2배 강화되어 지배력의 강도를 즉각 파악할 수 있습니다.
  - 모든 화살표 끝단은 선 굵기에 비례하면서도 노드 경계면에 밀착하는 고대비 마커로 방향성을 명확히 표시합니다.

### 2. 🗺️ 실시간 미니맵 네비게이터 (Minimap)
- 화면 좌측 하단에 전체 그래프를 조감하는 실시간 미니맵 캔버스를 렌더링하고, 현재 뷰포트 영역(파란 박스)을 실시간으로 표시하여 광활한 우주에서도 위치를 놓치지 않습니다.

### 3. 📈 상단 거시 KPI 라이브 틱커 바
- `분석 대기업: 20개 그룹` | `추적 법인: 65개사` | `총수 및 오너: 55명` | `순환출자: 3개 고리` | `네트워크 총 자산: 약 2,450조 원`을 실시간 집계하여 헤더 하단에 표시합니다.

### 4. 🔬 심층 네트워크 분석 엔진 ([`js/analytics.js`](./js/analytics.js))
- **⚡ 연결도 중심성 (Degree Centrality) Top 10**:
  - 가장 많은 출자/피출자 및 혼맥 관계를 거느린 재계 핵심 허브 순위 산출.
- **🌉 매개 중심성 (Betweenness Centrality) Top 10 (Brandes Algorithm)**:
  - 서로 다른 기업 집단과 가문을 이어주는 핵심 가교(Bridge) 인물 및 지주사 순위 산출.

### 5. 🔍 다중 모드 6단계 인맥 최단 경로 탐색기 (Path Finder)
- 출발 노드(예: *이재용 회장*)와 도착 노드(예: *방시혁 의장*)를 선택하고 `[전체 관계]`, `[소유 지분만]`, `[혼맥/혈연만]` 필터를 적용하여 최단 연결 사슬을 BFS 알고리즘으로 자동 추적 및 그래프 애니메이션으로 표시합니다.

### 6. 🔄 대표 순환출자 & 지배구조 뷰
- **현대자동차그룹**(현대모비스 ➔ 현대차 ➔ 기아 ➔ 현대모비스), **롯데그룹**(광윤사 ➔ 일본 롯데홀딩스 ➔ 호텔롯데 ➔ 롯데지주) 등의 핵심 순환출자 고리를 네온 점선 흐름 애니메이션으로 집중 조명합니다.

### 7. 💍 정·재계 혼맥 & 혈연 지도 (Dynastic Marriage Web)
- **삼성가 ↔ 중앙일보(홍씨) ↔ 대상(임씨)**, **SK가 ↔ 노태우 전 대통령가**, **LG ↔ GS 57년 동업 및 분가**, **하이브(방시혁) ↔ 넷마블(방준혁) 사촌 친척 혈맹** 등 대한민국 상위 0.001%의 거대한 혼맥도를 분리 조명합니다.

### 8. ⚔️ 한진칼·대한항공 경영권 분쟁 & 호반그룹 대치 분석 (Hanjin KAL Dispute)
- **조원태 회장 연합(우호 합산 ~45.3%) vs 호반그룹(단일 2대 주주 17.43%)**:
  - 지주사 **한진칼**을 둘러싼 **조원태 회장 일가(19.79%) + 델타항공(14.90%, 백기사) + 산업은행(10.58%)** vs **호반건설(17.43%, KCGI 지분 인수 후 잠재 경영권 위협)**의 팽팽한 지분 대치 구도를 완벽 시각화.
  - **대한항공 ➔ 아시아나항공 63.9% 인수**를 통한 글로벌 메가캐리어 출범 지배구조 전수 수록.

---

## 📁 프로젝트 파일 구조

```
├── index.html                   # 메인 SPA 웹페이지 (HTML5, D3.js v7 CDN, Google SEO 연동)
├── favicon.svg                  # 벡터 SVG 파비콘
├── sitemap.xml                  # Google Search Console 사이트맵
├── robots.txt                   # 검색엔진 크롤러 색인 가이드
├── css/
│   ├── style.css                # 테마(다크/라이트), 레이아웃, KPI 바, 미니맵, 툴팁
│   └── components.css           # 인스펙터 패널, 필터, 모달, 순환출자 애니메이션
├── js/
│   ├── app.js                   # 메인 애플리케이션 부트스트랩 & 캐시 버스터
│   ├── network-graph.js         # D3.js Force-Directed 그래프, 미니맵, 비례 면적/선굵기
│   ├── analytics.js             # Degree & Betweenness Centrality 중심성 분석 엔진
│   ├── path-finder.js           # 다중 모드 최단 인맥/지분 경로 탐색기 (BFS)
│   ├── filters.js               # 실시간 다차원 필터 매니저 (그룹/노드/관계/지분율)
│   └── ui-controller.js         # 사이드 인스펙터, 검색 자동완성, 매트릭스 대시보드
├── data/
│   ├── chaebol_network.json     # 30대 그룹 정밀 지분율 및 혼맥 종합 데이터셋 (DART 최신화)
│   └── groups_summary.json      # 그룹별 공정자산, 랭킹, 총수 메타데이터
└── README.md                    # 프로젝트 문서
```

---

## 🚀 로컬 실행 및 배포 가이드

본 프로젝트는 어떠한 백엔드 로컬 서버(Node.js, Python, Flask 등)도 필요로 하지 않는 **순수 정적 웹 애플리케이션(Static Web App)**입니다.

### 1. 로컬에서 브라우저로 바로 열기
별도의 빌드나 서버 실행 없이 `index.html` 파일을 더블 클릭하거나 Live Server 등으로 열면 즉시 실행됩니다.

### 2. GitHub Pages 배포
이미 리포지토리에 푸시하면 GitHub Actions가 자동으로 빌드하여 **`https://{username}.github.io/{repo}/`** 에 실시간 배포됩니다.

---

## ⚖️ 데이터 출처 및 공시 기준
- **공정거래위원회** 지정 공시대상기업집단 및 상호출자제한기업집단 현황
- **금융감독원 전자공시시스템 (DART)** 사업보고서 및 최대주주등소유주식변동신고서
- 언론 보도 및 공시 기준 가계도·혼맥도 전수 분석

---

## 📄 License
This project is licensed under the MIT License.
