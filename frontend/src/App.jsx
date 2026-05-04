import { useMemo, useState } from "react";
import "./App.css";

import Home from "./pages/Home";
import HeatmapPage from "./pages/HeatmapPage";
import ChartPage from "./pages/ChartPage";
import Ttareungyeojido from "./pages/Ttareungyeojido";

// [각주] public 폴더에 있는 이미지는 import하지 않고 루트 경로로 직접 불러옵니다.
const HOME_TOP_IMAGE = "/home_top.png";

// [각주] 최종 공유용 화면은 3개 분석 페이지로만 구성합니다.
const NAV_ITEMS = [
  { key: "heatmap", label: "대여량 분포 분석" },
  { key: "chart", label: "대여량 차트 분석" },
  { key: "realtime", label: "실시간 대여소 현황" },
];

function App() {
  // [각주] 첫 진입 화면은 메인 홈 화면입니다.
  const [activePage, setActivePage] = useState("home");

  // [각주] 현재 선택된 메뉴에 따라 렌더링할 페이지를 결정합니다.
  const currentPage = useMemo(() => {
    if (activePage === "heatmap") return <HeatmapPage />;
    if (activePage === "chart") return <ChartPage />;
    if (activePage === "realtime") return <Ttareungyeojido />;

    return <Home />;
  }, [activePage]);

  return (
    <div className="app-shell">
      {/* [각주] 상단 배너는 홈 버튼 역할을 하며, public/home_top.png를 사용합니다. */}
      <header className="app-header">
        <button
          type="button"
          className="app-logo-button"
          onClick={() => setActivePage("home")}
          aria-label="홈 화면으로 이동"
          title="홈 화면으로 이동"
        >
          <img
            src={HOME_TOP_IMAGE}
            alt="SK networks x 따릉이 상단 배너"
            className="app-logo-image"
            draggable="false"
          />
        </button>
      </header>

      {/* [각주] 예측 정확도 검증 페이지를 제거했으므로 메뉴는 3개만 균등 배치합니다. */}
      <nav className="app-nav" aria-label="주요 페이지 이동">
        {NAV_ITEMS.map((item) => {
          const isActive = activePage === item.key;

          return (
            <button
              key={item.key}
              type="button"
              className={`app-nav-button ${isActive ? "active" : ""}`}
              onClick={() => setActivePage(item.key)}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* [각주] 실제 페이지가 표시되는 공통 본문 영역입니다. */}
      <main className="app-main">{currentPage}</main>
    </div>
  );
}

export default App;