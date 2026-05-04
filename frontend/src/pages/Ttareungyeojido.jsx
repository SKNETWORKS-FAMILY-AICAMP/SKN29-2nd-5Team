/*
  실시간 대여소 현황 페이지

  역할
  - 기본 선택 자치구: 영등포구, 마포구
  - 백엔드 /api/realtime/bike API 호출
  - 실시간 잔여대수를 숫자 마커로 표시
*/

import React, { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, ZoomControl, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const DISTRICTS = [
  "강남구", "강동구", "강북구", "강서구", "관악구", "광진구", "구로구", "금천구", "노원구", "도봉구",
  "동대문구", "동작구", "마포구", "서대문구", "서초구", "성동구", "성북구", "송파구", "양천구",
  "영등포구", "용산구", "은평구", "종로구", "중구", "중랑구",
];

const DEFAULT_SELECTED_GU = ["영등포구", "마포구"];
const SEOUL_CENTER = [37.5665, 126.9780];

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function makeDummyExpectedCount(station) {
  // 같은 대여소는 새로고침해도 비슷한 값이 나오도록 stationId/stationNo 기반으로 고정 변동폭을 만듭니다.
  const current = toNumber(station?.parkingBikeTotCnt, 0);
  const key = String(station?.stationNo || station?.stationId || station?.stationName || "0");
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash += key.charCodeAt(i) * (i + 1);
  const delta = (hash % 7) - 3; // -3 ~ +3
  return Math.max(0, current + delta);
}

function getMarkerRisk(station) {
  const current = toNumber(station?.parkingBikeTotCnt, 0);
  const expected = toNumber(station?.expectedBikeTotCnt1h ?? station?.predictedRemaining1h, makeDummyExpectedCount(station));
  // [각주] 현재도 부족하거나 1시간 뒤 부족해질 가능성이 있으면 빨간색으로 표시합니다.
  return current <= 3 || expected <= 3 ? "risk" : "ok";
}

function createCountIcon(station) {
  const count = toNumber(station?.parkingBikeTotCnt, 0);
  const risk = getMarkerRisk(station);
  const color = risk === "risk" ? "#e51c23" : "#858585";

  return L.divIcon({
    className: "bike-count-marker-wrap",
    html: `<div class="bike-count-marker" style="background:${color};border-color:${color};">${count}</div>`,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
    popupAnchor: [0, -18],
  });
}

function FitBounds({ stations }) {
  const map = useMap();

  useEffect(() => {
    const points = stations
      .map((s) => [toNumber(s.stationLatitude, null), toNumber(s.stationLongitude, null)])
      .filter(([lat, lng]) => lat && lng && lat >= 37 && lat <= 38 && lng >= 126 && lng <= 128);

    if (points.length > 0) {
      map.fitBounds(points, { padding: [45, 45], maxZoom: 14 });
    } else {
      map.setView(SEOUL_CENTER, 10);
    }
  }, [stations, map]);

  return null;
}

export default function Ttareungyeojido() {
  const [selectedGu, setSelectedGu] = useState(DEFAULT_SELECTED_GU);
  const [search, setSearch] = useState("");
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fetchedAt, setFetchedAt] = useState("-");

  const selectedText = useMemo(() => {
    if (selectedGu.length === 0) return "선택 없음";
    if (selectedGu.length === DISTRICTS.length) return "서울시 전체";
    return selectedGu.join(", ");
  }, [selectedGu]);

  const stats = useMemo(() => {
    let ok = 0;
    let risk = 0;
    stations.forEach((s) => {
      if (getMarkerRisk(s) === "risk") risk += 1;
      else ok += 1;
    });
    return { ok, risk, total: stations.length };
  }, [stations]);

  const loadStations = async () => {
    setLoading(true);
    setError("");

    try {
      // [각주] 처음 화면에서는 영등포구, 마포구만 요청합니다.
      // 전체 서울 API는 백엔드에서 1000건씩 나누어 가져오고, 프론트는 선택 자치구만 필터 조건으로 넘깁니다.
      const params = new URLSearchParams();
      params.set("districts", selectedGu.join(","));
      params.set("limit", "10000");
      if (search.trim()) params.set("search", search.trim());

      const response = await fetch(`${API_BASE}/api/realtime/bike?${params.toString()}`);
      const text = await response.text();
      let payload = null;
      try {
        payload = JSON.parse(text);
      } catch (jsonError) {
        throw new Error(`백엔드가 JSON이 아닌 응답을 보냈습니다. 앞부분: ${text.slice(0, 120)}`);
      }

      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.detail || payload?.error || `실시간 API 호출 실패: ${response.status}`);
      }

      const rows = Array.isArray(payload?.data) ? payload.data : [];
      const normalized = rows.map((row) => ({
        ...row,
        expectedBikeTotCnt1h: row.expectedBikeTotCnt1h ?? row.predictedRemaining1h ?? makeDummyExpectedCount(row),
      }));

      setStations(normalized);
      setFetchedAt(payload?.debug?.fetched_at || new Date().toLocaleString());
    } catch (err) {
      console.error("[Ttareungyeojido] loadStations error", err);
      setStations([]);
      setError(err.message || "실시간 대여소 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleGu = (gu) => {
    setSelectedGu((prev) => (prev.includes(gu) ? prev.filter((item) => item !== gu) : [...prev, gu]));
  };

  const selectDefault = () => setSelectedGu(DEFAULT_SELECTED_GU);
  const selectAll = () => setSelectedGu(DISTRICTS);
  const clearAll = () => setSelectedGu([]);

  return (
    <div className="realtime-page">
      <aside className="realtime-sidebar">
        <div className="realtime-title-row">
          <h2>실시간 대여소 현황</h2>
          <button type="button" onClick={loadStations} disabled={loading} className="refresh-btn">
            {loading ? "조회 중" : "새로고침"}
          </button>
        </div>

        <input
          className="station-search-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") loadStations();
          }}
          placeholder="대여소명 검색 예: 삼각지, 서울역"
        />

        <section className="realtime-info-card">
          <h2>실시간 잔여대수</h2>
          <p>회색: 여유</p>
          <p>빨강: 현재 또는 1시간 뒤 부족함</p>
          <p>새로고침 기준: {fetchedAt}</p>
          <div className="realtime-badges">
            <span className="badge ok">여유 {stats.ok}</span>
            <span className="badge risk">위험 {stats.risk}</span>
            <span className="badge total">전체 {stats.total}</span>
          </div>
        </section>

        <div className="district-header">
          <h2>자치구</h2>
          <div className="district-actions">
            <button type="button" onClick={selectDefault}>기본</button>
            <button type="button" onClick={selectAll}>전체선택</button>
            <button type="button" onClick={clearAll}>전체해제</button>
          </div>
        </div>
        <p className="selected-gu-text">현재: {selectedText}</p>

        <div className="district-list">
          {DISTRICTS.map((gu) => (
            <button
              type="button"
              key={gu}
              onClick={() => toggleGu(gu)}
              className={`district-button ${selectedGu.includes(gu) ? "selected" : ""}`}
            >
              <span>{gu}</span>
              {selectedGu.includes(gu) && <b>선택</b>}
            </button>
          ))}
        </div>
      </aside>

      <main className="realtime-map-area">
        {error && <div className="map-toast error">{error}</div>}
        {!error && stations.length === 0 && !loading && <div className="map-toast">조건에 맞는 대여소가 없습니다</div>}
        {loading && <div className="map-toast">실시간 대여소 정보를 불러오는 중입니다</div>}

        <MapContainer center={SEOUL_CENTER} zoom={11} className="realtime-map" zoomControl={false}>
          <ZoomControl position="topleft" />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitBounds stations={stations} />
          {stations.map((station) => {
            const lat = toNumber(station.stationLatitude, null);
            const lng = toNumber(station.stationLongitude, null);
            if (!lat || !lng) return null;
            const expected = toNumber(station.expectedBikeTotCnt1h ?? station.predictedRemaining1h, makeDummyExpectedCount(station));
            return (
              <Marker
                key={`${station.stationId || station.stationNo}-${lat}-${lng}`}
                position={[lat, lng]}
                icon={createCountIcon({ ...station, expectedBikeTotCnt1h: expected })}
              >
                <Popup maxWidth={420}>
                  <div className="station-popup">
                    <h3>{station.stationName || "대여소명 없음"}</h3>
                    <table>
                      <tbody>
                        <tr><th>자치구</th><td>{station.gu || "매핑 없음"}</td></tr>
                        <tr><th>대여소 ID</th><td>{station.stationId || "-"}</td></tr>
                        <tr><th>대여소 이름</th><td>{station.stationName || "-"}</td></tr>
                        <tr><th>거치대개수</th><td>{toNumber(station.rackTotCnt, 0)}대</td></tr>
                        <tr><th>자전거잔여대수</th><td className="count-now">{toNumber(station.parkingBikeTotCnt, 0)}대</td></tr>
                        <tr><th>1시간 뒤 예상 잔여 대수</th><td className="count-expected">{expected}대 <small></small></td></tr>
                      </tbody>
                    </table>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </main>

      <style>{`
        .realtime-page { display: flex; height: calc(100vh - 142px); min-height: 760px; background: #eaf8f0; }
        .realtime-sidebar { width: 360px; flex: 0 0 360px; background: #0f1726; color: #fff; padding: 24px 22px; overflow-y: auto; box-sizing: border-box; }
        .realtime-title-row { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
        .realtime-title-row h1 { font-size: 34px; line-height: 1.1; margin: 0; font-weight: 900; letter-spacing: -1px; }
        .refresh-btn { border: 0; border-radius: 10px; background: #5f6368; color: #fff; font-weight: 900; padding: 16px 18px; cursor: pointer; }
        .refresh-btn:disabled { opacity: .65; cursor: wait; }
        .station-search-input { width: 100%; margin: 22px 0 18px; padding: 16px; border-radius: 9px; border: 1px solid #4b5563; background: #2d2d2d; color: #fff; font-size: 18px; box-sizing: border-box; }
        .realtime-info-card { background: #1f2937; border-radius: 10px; padding: 22px; color: #d7dde8; margin-bottom: 22px; }
        .realtime-info-card h2 { color: #c6f6d5; margin: 0 0 14px; font-size: 20px; }
        .realtime-info-card p { margin: 9px 0; font-size: 16px; line-height: 1.55; }
        .realtime-badges { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 16px; }
        .badge { border-radius: 999px; padding: 8px 14px; font-weight: 900; color: #fff; }
        .badge.ok { background: #858585; } .badge.risk { background: #e51c23; } .badge.total { background: #2d3748; }
        .district-header { display: flex; align-items: center; justify-content: space-between; border-top: 1px solid #374151; padding-top: 22px; }
        .district-header h2 { margin: 0; font-size: 24px; }
        .district-actions { display: flex; gap: 6px; }
        .district-actions button { border: 0; border-radius: 8px; padding: 10px 11px; background: #5f6368; color: #fff; font-weight: 800; cursor: pointer; }
        .selected-gu-text { color: #cbd5e1; font-weight: 700; margin: 14px 0; line-height: 1.45; }
        .district-list { display: flex; flex-direction: column; gap: 8px; padding-bottom: 24px; }
        .district-button { display: flex; justify-content: space-between; align-items: center; width: 100%; border: 1px solid #334155; background: #111827; color: #e5e7eb; border-radius: 10px; padding: 14px 16px; font-size: 19px; font-weight: 800; cursor: pointer; }
        .district-button.selected { background: #113f2d; border-color: #22c55e; color: #d9f99d; }
        .district-button b { color: #bbf7d0; font-size: 15px; }
        .realtime-map-area { flex: 1; position: relative; border-left: 70px solid #86dc95; }
        .realtime-map { width: 100%; height: 100%; }
        .map-toast { position: absolute; z-index: 900; top: 24px; left: 110px; background: #1f2937; color: #fff; border-radius: 14px; padding: 16px 24px; font-size: 18px; font-weight: 900; box-shadow: 0 12px 25px rgba(0,0,0,.22); }
        .map-toast.error { background: #fff5f5; color: #c1121f; border: 1px solid #fecaca; }
        .bike-count-marker { width: 38px; height: 38px; border-radius: 50%; border: 4px solid; box-sizing: border-box; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 17px; font-weight: 900; line-height: 1; box-shadow: 0 2px 7px rgba(0,0,0,.35); }
        .station-popup { min-width: 330px; font-family: inherit; }
        .station-popup h3 { margin: 0 0 12px; color: #138a3d; font-size: 22px; font-weight: 900; }
        .station-popup table { border-collapse: collapse; width: 100%; font-size: 15px; }
        .station-popup th, .station-popup td { border: 1px solid #d1d5db; padding: 11px 13px; text-align: left; }
        .station-popup th { background: #f3f4f6; width: 145px; color: #111827; }
        .station-popup td { color: #374151; }
        .count-now, .count-expected { color: #149447 !important; font-weight: 900; }
        .count-expected small { color: #6b7280; font-weight: 800; }
      `}</style>
    </div>
  );
}