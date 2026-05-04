/*
  [대여량 분포 분석 페이지]
  htm.jsx와 HeatmapPage.jsx가 같은 역할을 하던 구조를 HeatmapPage.jsx 하나로 정리합니다.
  기본 조건은 2025년, 1월~12월 전체, 금천구입니다.
*/
import { useEffect, useMemo, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

import { apiGet } from "../api/client";

const YEARS = ["2023", "2024", "2025"];
const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));

const DISTRICTS = [
  "강남구", "강동구", "강북구", "강서구", "관악구",
  "광진구", "구로구", "금천구", "노원구", "도봉구",
  "동대문구", "동작구", "마포구", "서대문구", "서초구",
  "성동구", "성북구", "송파구", "양천구", "영등포구",
  "용산구", "은평구", "종로구", "중구", "중랑구",
];

const DEFAULT_FILTERS = {
  years: ["2025"],
  months: [...MONTHS],
  districts: ["금천구"],
};

const SEOUL_CENTER = [37.5665, 126.978];

/*
  [데이터 정규화 블록]
  백엔드 응답 컬럼명이 조금 달라도 지도에서 사용할 수 있도록 표준 컬럼으로 변환합니다.
*/
function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function pick(row, keys, fallback = "") {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return fallback;
}

function normalizeRow(row) {
  const lat = toNumber(
    pick(row, ["latitude", "lat", "station_latitude", "stationLatitude"], 0)
  );
  const lon = toNumber(
    pick(row, ["longitude", "lon", "lng", "station_longitude", "stationLongitude"], 0)
  );
  const count = toNumber(
    pick(row, ["rental_count", "usage_count", "count", "cnt", "total", "rental", "대여건수"], 0)
  );

  return {
    ...row,
    lat,
    lon,
    count,
    stationName: String(
      pick(row, ["station_name", "stationName", "name", "station", "대여소명"], "대여소명 없음")
    ),
    district: String(pick(row, ["gu", "district", "자치구"], "-")),
  };
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

/*
  [지도 위치 자동 조정 블록]
  선택한 자치구가 1개일 때는 해당 자치구가 잘 보이도록 한 단계 더 확대합니다.
*/
function FitToMarkers({ rows, selectedDistricts }) {
  const map = useMap();

  useEffect(() => {
    const points = rows
      .filter((row) => row.lat && row.lon)
      .map((row) => [row.lat, row.lon]);

    if (!points.length) {
      map.setView(SEOUL_CENTER, 11);
      return;
    }

    const isSingleDistrict = selectedDistricts.length === 1;

    map.fitBounds(points, {
      padding: [24, 24],
      maxZoom: isSingleDistrict ? 15 : 12,
      animate: true,
    });

    if (isSingleDistrict) {
      window.setTimeout(() => {
        map.setZoom(Math.min(map.getZoom() + 1, 16), { animate: true });
      }, 220);
    }
  }, [map, rows, selectedDistricts]);

  return null;
}

/*
  [필터 버튼 블록]
  연도, 월, 자치구 선택 버튼의 공통 UI입니다.
*/
function FilterButton({ active, children, onClick }) {
  return (
    <button
      type="button"
      className={`hm-filter-button ${active ? "active" : ""}`}
      onClick={onClick}
    >
      <span>{children}</span>
      <strong>{active ? "선택" : ""}</strong>
    </button>
  );
}

export default function HeatmapPage() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const normalizedRows = useMemo(() => {
    return rows.map(normalizeRow).filter((row) => row.lat && row.lon);
  }, [rows]);

  const maxCount = useMemo(() => {
    return Math.max(1, ...normalizedRows.map((row) => row.count));
  }, [normalizedRows]);

  const summary = useMemo(() => {
    const total = normalizedRows.reduce((sum, row) => sum + row.count, 0);
    const maxRow = normalizedRows.reduce(
      (best, row) => (row.count > (best?.count || 0) ? row : best),
      null
    );

    return {
      markerCount: normalizedRows.length,
      total,
      maxCount: maxRow?.count || 0,
      maxStation: maxRow?.stationName || "-",
      years:
        filters.years.length === YEARS.length
          ? "연도 전체"
          : `${filters.years.join(", ")}년`,
      months:
        filters.months.length === MONTHS.length
          ? "월 전체"
          : `${filters.months.join(", ")}월`,
      districts:
        filters.districts.length === DISTRICTS.length
          ? "서울시 전체"
          : filters.districts.join(", "),
    };
  }, [filters, normalizedRows]);

  /*
    [필터 변경 블록]
    기존 기능을 유지하면서 선택/해제만 단순하게 관리합니다.
  */
  const toggleValue = (key, value) => {
    setFilters((prev) => {
      const exists = prev[key].includes(value);
      const nextValues = exists
        ? prev[key].filter((item) => item !== value)
        : [...prev[key], value];

      return {
        ...prev,
        [key]: nextValues,
      };
    });
  };

  const toggleAll = (key, allValues) => {
    setFilters((prev) => ({
      ...prev,
      [key]: prev[key].length === allValues.length ? [] : [...allValues],
    }));
  };

  /*
    [데이터 조회 블록]
    히트맵에서 이미 빠르게 작동하던 /api/stats/heatmap API를 그대로 사용합니다.
  */
  const loadHeatmap = async () => {
    if (!filters.years.length || !filters.months.length || !filters.districts.length) {
      setRows([]);
      setError("연도, 월, 자치구를 최소 1개 이상 선택해 주세요.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const data = await apiGet("/api/stats/heatmap", {
        years: filters.years,
        months: filters.months,
        districts: filters.districts,
        limit: 20000,
      });

      const nextRows = Array.isArray(data?.rows)
        ? data.rows
        : Array.isArray(data?.data)
          ? data.data
          : [];

      setRows(nextRows);
    } catch (err) {
      console.error("[HeatmapPage] 대여량 분포 데이터 조회 실패", err);
      setError(err.message || "대여량 분포 데이터를 불러오지 못했습니다.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHeatmap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="hm-page">
      <aside className="hm-sidebar">
        <div className="hm-sidebar-title-row">
          <div>
            <p className="hm-eyebrow">DISTRIBUTION</p>
            <h1>분포 조건 설정</h1>
          </div>

          <button
            type="button"
            className="hm-apply-button"
            onClick={loadHeatmap}
            disabled={loading}
          >
            {loading ? "조회 중" : "적용"}
          </button>
        </div>

        <p className="hm-guide">
          조건을 선택하신 뒤 적용을 누르시면 대여량 분포가 지도에 표시됩니다.
        </p>

        <section className="hm-filter-section">
          <div className="hm-section-title">
            <h2>연도별</h2>
            <button type="button" onClick={() => toggleAll("years", YEARS)}>
              {filters.years.length === YEARS.length ? "전체해제" : "전체선택"}
            </button>
          </div>

          <div className="hm-filter-list compact">
            {YEARS.map((year) => (
              <FilterButton
                key={year}
                active={filters.years.includes(year)}
                onClick={() => toggleValue("years", year)}
              >
                {year}년
              </FilterButton>
            ))}
          </div>
        </section>

        <section className="hm-filter-section">
          <div className="hm-section-title">
            <h2>월별</h2>
            <button type="button" onClick={() => toggleAll("months", MONTHS)}>
              {filters.months.length === MONTHS.length ? "전체해제" : "전체선택"}
            </button>
          </div>

          <div className="hm-filter-list scrollable">
            {MONTHS.map((month) => (
              <FilterButton
                key={month}
                active={filters.months.includes(month)}
                onClick={() => toggleValue("months", month)}
              >
                {month}월
              </FilterButton>
            ))}
          </div>
        </section>

        <section className="hm-filter-section grow">
          <div className="hm-section-title">
            <h2>자치구 선택</h2>
            <button type="button" onClick={() => toggleAll("districts", DISTRICTS)}>
              {filters.districts.length === DISTRICTS.length ? "전체해제" : "전체선택"}
            </button>
          </div>

          <div className="hm-filter-list scrollable districts">
            {DISTRICTS.map((district) => (
              <FilterButton
                key={district}
                active={filters.districts.includes(district)}
                onClick={() => toggleValue("districts", district)}
              >
                {district}
              </FilterButton>
            ))}
          </div>
        </section>
      </aside>

      <section className="hm-map-wrap">
        <MapContainer center={SEOUL_CENTER} zoom={11} className="hm-map" preferCanvas>
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <FitToMarkers rows={normalizedRows} selectedDistricts={filters.districts} />

          {normalizedRows.map((row, index) => {
            const ratio = Math.max(0.18, Math.min(1, row.count / maxCount));
            const radius = 5 + ratio * 18;
            const color = ratio > 0.68 ? "#dc2626" : ratio > 0.36 ? "#f97316" : "#f59e0b";

            return (
              <CircleMarker
                key={`${row.station_id || row.stationId || row.stationName}-${index}`}
                center={[row.lat, row.lon]}
                radius={radius}
                pathOptions={{
                  color,
                  fillColor: color,
                  fillOpacity: 0.55,
                  opacity: 0.85,
                  weight: 1,
                }}
              >
                <Tooltip direction="top" offset={[0, -6]} opacity={0.95}>
                  {row.stationName}
                </Tooltip>

                <Popup>
                  <div className="hm-popup">
                    <strong>{row.stationName}</strong>
                    <p>자치구: {row.district}</p>
                    <p>이용건수: {formatNumber(row.count)}건</p>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>

        <div className="hm-map-summary">
          <strong>대여량 분포 요약</strong>
          <span>
            {summary.districts} · {summary.years} · {summary.months}
          </span>
          <span>
            표시 지점 {formatNumber(summary.markerCount)}개 / 총 이용건수{" "}
            {formatNumber(summary.total)}건
          </span>
          <span>
            최대 이용건수 {formatNumber(summary.maxCount)}건 · {summary.maxStation}
          </span>
          {error ? <em>{error}</em> : null}
        </div>
      </section>

      <style>{`
        .hm-page {
          min-width: 1280px;
          min-height: calc(100vh - 164px);
          display: grid;
          grid-template-columns: 320px minmax(960px, 1fr);
          background: #d7f2dc;
        }

        .hm-sidebar {
          min-height: 100%;
          padding: 18px 16px;
          background: #0f172a;
          color: #e5edf2;
          overflow: auto;
        }

        .hm-sidebar-title-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .hm-eyebrow {
          margin: 0 0 4px;
          color: #86efac;
          font-size: 13px;
          font-weight: 900;
          letter-spacing: 0.08em;
        }

        .hm-sidebar h1 {
          margin: 0;
          font-size: 28px;
          line-height: 1.15;
          font-weight: 900;
          letter-spacing: -0.04em;
        }

        .hm-apply-button,
        .hm-section-title button {
          border: 0;
          border-radius: 10px;
          background: #22c55e;
          color: white;
          font-weight: 900;
          cursor: pointer;
        }

        .hm-apply-button {
          min-width: 70px;
          padding: 14px 12px;
          font-size: 16px;
        }

        .hm-apply-button:disabled {
          background: #64748b;
          cursor: wait;
        }

        .hm-guide {
          margin: 16px 0 12px;
          padding: 14px;
          border-radius: 14px;
          background: rgba(20, 83, 45, 0.5);
          color: #bbf7d0;
          font-size: 15px;
          font-weight: 700;
          line-height: 1.6;
        }

        .hm-filter-section {
          border-top: 1px solid rgba(148, 163, 184, 0.35);
          padding-top: 14px;
          margin-top: 14px;
        }

        .hm-section-title {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
        }

        .hm-section-title h2 {
          margin: 0;
          font-size: 17px;
          font-weight: 900;
          color: #e5edf2;
        }

        .hm-section-title button {
          padding: 8px 10px;
          font-size: 13px;
        }

        .hm-filter-list {
          display: grid;
          gap: 8px;
        }

        .hm-filter-list.scrollable {
          max-height: 190px;
          overflow: auto;
          padding-right: 4px;
        }

        .hm-filter-list.districts {
          max-height: 310px;
        }

        .hm-filter-button {
          width: 100%;
          min-height: 42px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border: 1px solid #334155;
          border-radius: 10px;
          padding: 8px 12px;
          background: #111827;
          color: #dbe5ec;
          font-size: 16px;
          font-weight: 800;
          cursor: pointer;
        }

        .hm-filter-button.active {
          border-color: #22c55e;
          background: #123f2c;
          color: #d9f99d;
        }

        .hm-filter-button strong {
          color: #86efac;
          font-size: 13px;
        }

        .hm-map-wrap {
          position: relative;
          min-height: calc(100vh - 164px);
          padding-left: 28px;
          background: #86d995;
        }

        .hm-map {
          width: 100%;
          height: 100%;
          min-height: calc(100vh - 164px);
        }

        .hm-map-summary {
          position: absolute;
          top: 16px;
          left: 52px;
          z-index: 500;
          max-width: 520px;
          display: grid;
          gap: 4px;
          padding: 14px 18px;
          border-radius: 16px;
          background: rgba(15, 23, 42, 0.88);
          color: #f8fafc;
          box-shadow: 0 12px 28px rgba(15, 23, 42, 0.22);
          backdrop-filter: blur(6px);
          pointer-events: none;
        }

        .hm-map-summary strong {
          color: #fef3c7;
          font-size: 18px;
          font-weight: 900;
        }

        .hm-map-summary span {
          font-size: 14px;
          font-weight: 800;
          line-height: 1.45;
        }

        .hm-map-summary em {
          color: #fecaca;
          font-style: normal;
          font-weight: 900;
        }

        .hm-popup strong {
          color: #14532d;
          font-size: 15px;
        }

        .hm-popup p {
          margin: 4px 0 0;
          color: #1f2937;
          font-weight: 700;
        }
      `}</style>
    </div>
  );
}