import React from "react";

// [각주] 메인 홈 화면은 public/home__main.png 이미지를 전체 화면 배너처럼 표시합니다.
export default function Home() {
  return (
    <section className="home-page" aria-label="프로젝트 메인 화면">
      <img
        src="/home__main.png"
        alt="SK networks x 따릉이 프로젝트 메인 화면"
        className="home-main-image"
        draggable="false"
      />
    </section>
  );
}