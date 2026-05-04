/*
  [React 진입 블록]
  Vite가 index.html의 #root에 React 앱을 연결하는 시작 파일입니다.
*/
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

/*
  [전역 스타일 블록]
  전체 페이지 공통 폰트, 스크롤, 기본 여백을 index.css에서 관리합니다.
*/
import "./index.css";

/*
  [앱 컴포넌트 블록]
  상단 배너, 메뉴, 각 페이지 전환은 App.jsx에서 담당합니다.
*/
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);