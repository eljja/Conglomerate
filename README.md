# 🇰🇷 대한민국 대기업 네트워크 & 지배구조·혼맥 인터랙티브 시각화 플랫폼
> **Korean Chaebol Network & Corporate Governance / Dynastic Alliances Visualizer**

대한민국 30대 대기업 집단(재벌 및 빅테크)의 **총수 및 오너 일가 인맥, 가계도·혼맥, 순환출자 및 모회사-자회사 지분 소유 구조**를 단일 화면에서 거시적으로 탐색할 수 있는 100% 클라이언트 사이드 인터랙티브 시각화 웹 애플리케이션입니다.

---

## 🌟 핵심 기능 (Key Features)

1. **🌐 전체 통합 우주 뷰 (Holistic Universe Mode)**
   - 500여 개 이상의 인물·기업 노드와 1,000여 개의 지분/혼맥 관계를 물리 시뮬레이션(D3.js Force-Directed)으로 부드럽게 탐색.
   - 그룹별 고유 컬러 브랜딩, 줌/팬/드래그, 노드 호버 시 1·2차 연관 관계 집중 하이라이트.

2. **🔄 순환출자 & 지배구조 뷰 (Circular & Ownership Mode)**
   - **현대자동차그룹**(현대모비스 ➔ 현대차 ➔ 기아 ➔ 현대모비스), **롯데그룹** 등 대표적인 순환출자 고리를 네온 대시 애니메이션으로 시각화.
   - 기업 간 주식 보유 비율(%) 및 지배 축 표시.

3. **💍 정·재계 혼맥 & 혈연 지도 (Chaebol Dynasties & Marriage Web)**
   - **삼성가 ↔ 중앙일보(홍씨) ↔ 대상(임씨)**, **SK가 ↔ 노태우 전 대통령가**, **LG ↔ GS 창업 동업 및 분가 네트워크**, **하이브(방시혁) ↔ 넷마블(방준혁) 사촌 친척 혈맹** 등 대한민국 상위 0.001%의 거대한 혼맥도 분리 조명.

4. **🔍 6단계 인맥 최단 경로 탐색기 (6 Degrees of Separation Finder)**
   - 출발 노드(예: *이재용 회장*)와 도착 노드(예: *방시혁 의장*)를 선택하면, 최단 인맥·지분 연결 사슬(A ➔ 혈연 ➔ B ➔ 지분 ➔ C)을 BFS 알고리즘으로 자동 추적 및 그래프 애니메이션 표시.

5. **📊 데이터 매트릭스 뷰 (Analytics Data Grid)**
   - 공정거래위원회 공정자산 순위별 그룹 통계, 오너 일가 주식 평가액 랭킹, 순환출자 목록을 한눈에 볼 수 있는 대시보드.

6. **📋 우측 상세 인스펙터 (Node Detail Drawer)**
   - 인물/기업 클릭 시 프로필, 직함, 추정 자산/시가총액, 소유한 모든 지분(Out), 피소유 지분(In), 가족 관계 목록 및 즉시 탐색 연동.

---

## 🚀 GitHub Pages 배포 방법 (Deployment to GitHub Pages)

본 프로젝트는 어떠한 백엔드 로컬 서버(Node.js, Python, Flask 등)도 필요로 하지 않는 **순수 정적 웹 애플리케이션(Static Web App)**입니다.

### 1. GitHub 리포지토리 생성 및 푸시
```bash
git init
git add .
git commit -m "feat: 대한민국 대기업 네트워크 및 지배구조 시각화 웹앱 완성"
git branch -M main
git remote add origin https://github.com/{YOUR_GITHUB_USERNAME}/{YOUR_REPOSITORY_NAME}.git
git push -u origin main
```

### 2. GitHub Pages 활성화
1. GitHub 리포지토리 페이지에서 **Settings** 탭 클릭
2. 좌측 메뉴에서 **Pages** 클릭
3. **Build and deployment > Source**를 **Deploy from a branch**로 선택
4. Branch를 `main` / `/(root)`로 설정 후 **Save** 클릭
5. 1~2분 후 생성되는 `https://{YOUR_GITHUB_USERNAME}.github.io/{YOUR_REPOSITORY_NAME}/` 링크로 접속하면 즉시 서비스 이용 가능!

---

## 📁 프로젝트 파일 구조

```
├── index.html                   # 메인 SPA 웹페이지 (HTML5, D3.js v7 CDN 연동)
├── css/
│   ├── style.css                # 전체 테마(다크/라이트), 레이아웃, 캔버스 스타일
│   └── components.css           # 인스펙터 패널, 필터, 모달, 순환출자 애니메이션
├── js/
│   ├── app.js                   # 메인 애플리케이션 엔트리포인트 & 라이프사이클
│   ├── network-graph.js         # D3.js 기반 고성능 Force-Directed 그래프 렌더링 엔진
│   ├── path-finder.js           # 최단 인맥/지분 경로 탐색 알고리즘 (BFS/Dijkstra)
│   ├── filters.js               # 실시간 다차원 필터링 모듈 (그룹/노드/관계/지분율)
│   └── ui-controller.js         # 사이드 인스펙터, 검색 자동완성, 매트릭스 뷰 컨트롤러
├── data/
│   ├── chaebol_network.json     # 30대 그룹 인물, 기업, 혼맥, 순환출자, 지분율 종합 데이터셋
│   └── groups_summary.json      # 그룹별 공정자산, 랭킹, 총수 메타데이터
└── README.md                    # 프로젝트 가이드
```

---

## ⚖️ 데이터 출처 및 기준
- 공정거래위원회 지정 공시대상기업집단 현황
- 금융감독원 전자공시시스템 (DART) 정기보고서 및 최대주주등소유주식변동신고서
- 언론 보도 및 공시 기준 가계도·혼맥도 종합 분석
