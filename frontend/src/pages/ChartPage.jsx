/*
  [대여량 차트 분석 페이지]
  히트맵에서 사용 중인 /api/stats/heatmap 데이터를 그대로 가져와 프론트에서 차트용으로 집계합니다.
  연도별 전체 이용 건수 탭은 제거하고, 운영 목적에 맞는 3개 차트만 남깁니다.
*/
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { apiGet } from "../api/client";

const YEARS = ["2023", "2024", "2025"];
const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));

const DISTRICTS = [
  "서울시 전체",
  "강남구", "강동구", "강북구", "강서구", "관악구",
  "광진구", "구로구", "금천구", "노원구", "도봉구",
  "동대문구", "동작구", "마포구", "서대문구", "서초구",
  "성동구", "성북구", "송파구", "양천구", "영등포구",
  "용산구", "은평구", "종로구", "중구", "중랑구",
];

const CHARTS = [
  {
    key: "station",
    label: "대여소 Top5",
    title: "대여소 Top5",
    desc: "선택 조건에서 대여량이 많은 대여소를 확인합니다.",
  },
  {
    key: "district",
    label: "자치구 Top5",
    title: "자치구 Top5",
    desc: "수요가 많이 집중되는 자치구를 확인합니다.",
  },
  {
    key: "month",
    label: "월별 흐름",
    title: "월별 흐름",
    desc: "계절성과 월별 수요 변화를 확인합니다.",
  },
];

const DEFAULT_FILTERS = {
  years: [...YEARS],
  months: [...MONTHS],
  district: "서울시 전체",
};

const BAR_COLORS = ["#16a34a", "#0ea5e9", "#f97316", "#8b5cf6", "#ef4444"];
const LINE_COLOR = "#0ea5e9";

/*
  [값 변환 블록]
  API 응답 컬럼명이 달라도 같은 방식으로 차트에 넣을 수 있도록 안전하게 변환합니다.
*/
function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatNumber(value) {
  return toNumber(value).toLocaleString("ko-KR");
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

function normalizeHeatmapRow(row) {
  const stationName = String(
    pick(row, ["station_name", "stationName", "name", "station", "대여소명"], "대여소명 없음")
  );
  const stationId = String(
    pick(row, ["station_id", "stationId", "stationNo", "대여소ID"], "")
  );
  const district = String(pick(row, ["gu", "district", "자치구"], "-"));
  const year = String(pick(row, ["year", "yyyy", "연도"], ""));
  const monthRaw = String(pick(row, ["month", "mm", "월"], ""));
  const month = monthRaw ? monthRaw.padStart(2, "0") : "";
  const count = toNumber(
    pick(row, ["rental_count", "usage_count", "count", "cnt", "total", "rental", "대여건수"], 0)
  );

  return {
    ...row,
    stationName,
    stationId,
    district,
    year,
    month,
    count,
  };
}

/*
  [집계 블록]
  히트맵 데이터는 대여소 단위로 들어오기 때문에 차트 목적별로 다시 합산합니다.
*/
function groupSum(rows, getKey) {
  const map = new Map();

  rows.forEach((row) => {
    const key = String(getKey(row) || "").trim();

    if (!key || key === "-" || key === "대여소명 없음") return;

    map.set(key, (map.get(key) || 0) + toNumber(row.count));
  });

  return [...map.entries()].map(([name, value]) => ({
    name,
    value,
  }));
}

function topN(items, n = 5) {
  return [...items]
    .filter((item) => toNumber(item.value) > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, n);
}

/*
  [차트 보조 컴포넌트 블록]
  Tooltip, 빈 차트, 필터 버튼을 재사용합니다.
*/
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  return (
    <div style={styles.tooltip}>
      <strong>{label}</strong>
      <p>{formatNumber(payload[0].value)}건</p>
    </div>
  );
}

function EmptyChart({ loading }) {
  return (
    <div style={styles.emptyBox}>
      {loading ? "차트 데이터를 준비하고 있습니다." : "조건에 맞는 차트 데이터가 없습니다."}
    </div>
  );
}

function FilterButton({ active, children, onClick }) {
  return (
    <button
      type="button"
      style={{
        ...styles.filterButton,
        ...(active ? styles.filterButtonActive : {}),
      }}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export default function ChartPage() {
  /*
    [상태 관리 블록]
    기본 차트는 대여소 Top5입니다. 제거한 연도별 탭 상태가 남아도 자동으로 대여소 Top5로 보정합니다.
  */
  const [activeChart, setActiveChart] = useState("station");
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const requestCache = useRef(new Map());

  const validChartKeys = useMemo(() => CHARTS.map((chart) => chart.key), []);
  const activeKey = validChartKeys.includes(activeChart) ? activeChart : "station";

  const activeMeta = useMemo(() => {
    return CHARTS.find((item) => item.key === activeKey) || CHARTS[0];
  }, [activeKey]);

  useEffect(() => {
    if (activeChart !== activeKey) {
      setActiveChart(activeKey);
    }
  }, [activeChart, activeKey]);

  const selectedDistricts = useMemo(() => {
    if (filters.district === "서울시 전체") {
      return DISTRICTS.filter((district) => district !== "서울시 전체");
    }

    return [filters.district];
  }, [filters.district]);

  const filterLabel = useMemo(() => {
    const yearLabel =
      filters.years.length === YEARS.length
        ? "2023, 2024, 2025년"
        : `${filters.years.join(", ")}년`;

    const monthLabel =
      filters.months.length === MONTHS.length
        ? "1월~12월 전체"
        : `${filters.months.map((month) => `${Number(month)}월`).join(", ")}`;

    return `${yearLabel} · ${monthLabel} · ${filters.district}`;
  }, [filters]);

  const totalCount = useMemo(() => {
    return chartData.reduce((sum, row) => sum + toNumber(row.value), 0);
  }, [chartData]);

  /*
    [필터 변경 블록]
    체크/해제 즉시 차트가 바뀌도록 별도 조회 버튼 없이 상태만 변경합니다.
  */
  const toggleYear = (year) => {
    setFilters((prev) => {
      const next = prev.years.includes(year)
        ? prev.years.filter((item) => item !== year)
        : [...prev.years, year];

      return {
        ...prev,
        years: next.sort(),
      };
    });
  };

  const toggleMonth = (month) => {
    setFilters((prev) => {
      const next = prev.months.includes(month)
        ? prev.months.filter((item) => item !== month)
        : [...prev.months, month];

      return {
        ...prev,
        months: next.sort(),
      };
    });
  };

  const toggleAllYears = () => {
    setFilters((prev) => ({
      ...prev,
      years: prev.years.length === YEARS.length ? [] : [...YEARS],
    }));
  };

  const toggleAllMonths = () => {
    setFilters((prev) => ({
      ...prev,
      months: prev.months.length === MONTHS.length ? [] : [...MONTHS],
    }));
  };

  /*
    [히트맵 캐시 조회 블록]
    SQL을 프론트에서 직접 조회하지 않고, 이미 빠르게 동작하는 히트맵 API를 사용합니다.
    같은 조건은 브라우저 메모리 캐시에 저장해서 반복 클릭 시 더 빠르게 보여줍니다.
  */
  async function fetchHeatmapRows({ years, months, districts }) {
    const safeYears = years?.length ? years : [];
    const safeMonths = months?.length ? months : [];
    const safeDistricts = districts?.length ? districts : [];

    if (!safeYears.length || !safeMonths.length || !safeDistricts.length) {
      return [];
    }

    const cacheKey = JSON.stringify({
      years: safeYears,
      months: safeMonths,
      districts: safeDistricts,
    });

    if (requestCache.current.has(cacheKey)) {
      return requestCache.current.get(cacheKey);
    }

    const data = await apiGet("/api/stats/heatmap", {
      years: safeYears,
      months: safeMonths,
      districts: safeDistricts,
      limit: 100000,
    });

    const rows = (
      Array.isArray(data?.rows)
        ? data.rows
        : Array.isArray(data?.data)
          ? data.data
          : []
    ).map(normalizeHeatmapRow);

    requestCache.current.set(cacheKey, rows);

    return rows;
  }

  /*
    [차트 데이터 생성 블록]
    대여소 Top5, 자치구 Top5, 월별 흐름을 각각 목적에 맞게 계산합니다.
  */
  async function buildStationTop5() {
    const rows = await fetchHeatmapRows({
      years: filters.years,
      months: filters.months,
      districts: selectedDistricts,
    });

    return topN(groupSum(rows, (row) => row.stationName), 5);
  }

  async function buildDistrictTop5() {
    const rows = await fetchHeatmapRows({
      years: filters.years,
      months: filters.months,
      districts: selectedDistricts,
    });

    return topN(groupSum(rows, (row) => row.district), 5);
  }

  async function buildMonthChart() {
    const result = [];

    for (const month of filters.months) {
      const rows = await fetchHeatmapRows({
        years: filters.years,
        months: [month],
        districts: selectedDistricts,
      });

      result.push({
        name: `${Number(month)}월`,
        value: rows.reduce((sum, row) => sum + toNumber(row.count), 0),
      });
    }

    return result.sort(
      (a, b) => Number(a.name.replace("월", "")) - Number(b.name.replace("월", ""))
    );
  }

  async function loadChart() {
    if (!filters.years.length || !filters.months.length || !selectedDistricts.length) {
      setChartData([]);
      setError("연도와 월을 최소 1개 이상 선택해 주세요.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      let nextData = [];

      if (activeKey === "station") {
        nextData = await buildStationTop5();
      }

      if (activeKey === "district") {
        nextData = await buildDistrictTop5();
      }

      if (activeKey === "month") {
        nextData = await buildMonthChart();
      }

      setChartData(nextData.filter((item) => toNumber(item.value) > 0));
    } catch (err) {
      console.error("[ChartPage] 차트 데이터 생성 실패", err);
      setError(err.message || "차트 데이터를 불러오지 못했습니다.");
      setChartData([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadChart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, filters]);

  /*
    [차트 렌더링 블록]
    Top5는 막대그래프, 월별 흐름은 꺾은선 그래프로 보여줍니다.
  */
  const renderChart = () => {
    if (!chartData.length) {
      return <EmptyChart loading={loading} />;
    }

    if (activeKey === "station" || activeKey === "district") {
      return (
        <ResponsiveContainer width="100%" height={460}>
          <BarChart
            data={chartData}
            margin={{ top: 24, right: 30, left: 24, bottom: 86 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#d9e8e2" />
            <XAxis
              dataKey="name"
              interval={0}
              angle={-12}
              textAnchor="end"
              height={96}
              tick={{ fontSize: 13, fill: "#334155", fontWeight: 800 }}
            />
            <YAxis
              tickFormatter={formatNumber}
              tick={{ fontSize: 13, fill: "#334155", fontWeight: 800 }}
              width={94}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar
              dataKey="value"
              radius={[14, 14, 0, 0]}
              barSize={activeKey === "district" ? 96 : 82}
            >
              {chartData.map((_, index) => (
                <Cell key={`cell-${index}`} fill={BAR_COLORS[index % BAR_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      );
    }

    return (
      <ResponsiveContainer width="100%" height={460}>
        <LineChart
          data={chartData}
          margin={{ top: 24, right: 30, left: 24, bottom: 34 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#d9e8e2" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 13, fill: "#334155", fontWeight: 800 }}
          />
          <YAxis
            tickFormatter={formatNumber}
            tick={{ fontSize: 13, fill: "#334155", fontWeight: 800 }}
            width={94}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="value"
            stroke={LINE_COLOR}
            strokeWidth={4}
            dot={{
              r: 5,
              strokeWidth: 3,
              fill: "#ffffff",
              stroke: LINE_COLOR,
            }}
            activeDot={{ r: 8 }}
          />
        </LineChart>
      </ResponsiveContainer>
    );
  };

  return (
    <div style={styles.page}>
      <aside style={styles.sidebar}>
        <p style={styles.eyebrow}>CHART ANALYSIS</p>
        <h1 style={styles.sidebarTitle}>대여량 차트 조건</h1>

        <div style={styles.divider} />

        <h2 style={styles.sectionTitle}>분석 기준</h2>
        <div style={styles.chartButtonGroup}>
          {CHARTS.map((chart) => (
            <button
              key={chart.key}
              type="button"
              style={{
                ...styles.chartButton,
                ...(activeKey === chart.key ? styles.chartButtonActive : {}),
              }}
              onClick={() => setActiveChart(chart.key)}
            >
              {chart.label}
            </button>
          ))}
        </div>

        <div style={styles.divider} />

        <h2 style={styles.sectionTitle}>운영 필터</h2>

        <div style={styles.filterHeader}>
          <strong>연도</strong>
          <button type="button" style={styles.miniButton} onClick={toggleAllYears}>
            {filters.years.length === YEARS.length ? "전체해제" : "전체선택"}
          </button>
        </div>

        <div style={styles.grid3}>
          {YEARS.map((year) => (
            <FilterButton
              key={year}
              active={filters.years.includes(year)}
              onClick={() => toggleYear(year)}
            >
              {year}
            </FilterButton>
          ))}
        </div>

        <div style={styles.filterHeader}>
          <strong>월</strong>
          <button type="button" style={styles.miniButton} onClick={toggleAllMonths}>
            {filters.months.length === MONTHS.length ? "전체해제" : "전체선택"}
          </button>
        </div>

        <div style={styles.grid3}>
          {MONTHS.map((month) => (
            <FilterButton
              key={month}
              active={filters.months.includes(month)}
              onClick={() => toggleMonth(month)}
            >
              {month}월
            </FilterButton>
          ))}
        </div>

        <label style={styles.selectLabel}>자치구</label>
        <select
          style={styles.select}
          value={filters.district}
          onChange={(event) =>
            setFilters((prev) => ({
              ...prev,
              district: event.target.value,
            }))
          }
        >
          {DISTRICTS.map((district) => (
            <option key={district} value={district}>
              {district}
            </option>
          ))}
        </select>
      </aside>

      <main style={styles.main}>
        <p style={styles.mainEyebrow}>따릉이 이용 패턴 비교</p>
        <h1 style={styles.mainTitle}>대여량 차트 분석</h1>
        <p style={styles.summaryText}>{filterLabel}</p>

        {error ? <div style={styles.errorBox}>{error}</div> : null}
        {loading ? <div style={styles.loadingBox}>차트 데이터를 불러오는 중입니다.</div> : null}

        <section style={styles.chartCard}>
          <div style={styles.chartCardHeader}>
            <div>
              <h2 style={styles.chartTitle}>{activeMeta.title}</h2>
              <p style={styles.chartDesc}>{activeMeta.desc}</p>
            </div>

            <strong style={styles.chartCount}>
              총 {formatNumber(totalCount)}건 · {chartData.length}개 항목
            </strong>
          </div>

          <div style={styles.chartCanvas}>{renderChart()}</div>
        </section>
      </main>
    </div>
  );
}

const styles = {
  page: {
    display: "grid",
    gridTemplateColumns: "280px minmax(900px, 1fr)",
    minWidth: 1180,
    minHeight: "calc(100vh - 164px)",
    background: "#eaf8f1",
    color: "#061529",
  },

  sidebar: {
    background: "#0f1b2f",
    color: "#ffffff",
    padding: "24px 18px 36px",
    borderRight: "7px solid #7ee09c",
    overflowY: "auto",
  },

  eyebrow: {
    margin: 0,
    color: "#74f2a7",
    fontSize: 13,
    fontWeight: 900,
    letterSpacing: 1.5,
  },

  sidebarTitle: {
    margin: "8px 0 0",
    fontSize: 29,
    lineHeight: 1.15,
  },

  divider: {
    height: 1,
    background: "rgba(255,255,255,0.18)",
    margin: "24px 0",
  },

  sectionTitle: {
    margin: "0 0 12px",
    fontSize: 18,
  },

  chartButtonGroup: {
    display: "grid",
    gap: 10,
  },

  chartButton: {
    width: "100%",
    minHeight: 48,
    borderRadius: 10,
    border: "1px solid #52627a",
    background: "#13233a",
    color: "#ffffff",
    fontSize: 14,
    fontWeight: 900,
    textAlign: "left",
    padding: "0 14px",
    cursor: "pointer",
  },

  chartButtonActive: {
    background: "#16a34a",
    borderColor: "#20d46b",
    boxShadow: "0 8px 18px rgba(22,163,74,0.25)",
  },

  filterHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    margin: "18px 0 9px",
    fontSize: 14,
  },

  miniButton: {
    border: 0,
    borderRadius: 9,
    background: "#20d46b",
    color: "#ffffff",
    fontWeight: 900,
    padding: "8px 10px",
    cursor: "pointer",
  },

  grid3: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 9,
  },

  filterButton: {
    border: "1px solid #38516d",
    background: "#13233a",
    color: "#ffffff",
    borderRadius: 9,
    padding: "10px 0",
    fontWeight: 900,
    cursor: "pointer",
  },

  filterButtonActive: {
    background: "#16a34a",
    borderColor: "#19c764",
  },

  selectLabel: {
    display: "block",
    margin: "18px 0 8px",
    fontWeight: 900,
    fontSize: 14,
  },

  select: {
    width: "100%",
    height: 44,
    borderRadius: 10,
    border: "1px solid #38516d",
    background: "#13233a",
    color: "#ffffff",
    padding: "0 12px",
    fontWeight: 900,
  },

  main: {
    padding: "34px 32px 56px",
    overflow: "auto",
  },

  mainEyebrow: {
    margin: 0,
    color: "#10b981",
    fontWeight: 900,
    fontSize: 13,
  },

  mainTitle: {
    margin: "8px 0 12px",
    fontSize: 36,
    letterSpacing: -1.2,
  },

  summaryText: {
    margin: "0 0 18px",
    fontSize: 15,
    fontWeight: 900,
    color: "#1e293b",
  },

  errorBox: {
    background: "#fff1f2",
    border: "1px solid #fecdd3",
    color: "#be123c",
    padding: 14,
    borderRadius: 10,
    marginBottom: 16,
    fontWeight: 900,
  },

  loadingBox: {
    background: "#ecfeff",
    border: "1px solid #a5f3fc",
    color: "#155e75",
    padding: 14,
    borderRadius: 10,
    marginBottom: 16,
    fontWeight: 900,
  },

  chartCard: {
    background: "#ffffff",
    borderRadius: 18,
    padding: 22,
    boxShadow: "0 12px 28px rgba(15,23,42,0.08)",
  },

  chartCardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 20,
    marginBottom: 14,
  },

  chartTitle: {
    margin: 0,
    color: "#047857",
    fontSize: 28,
  },

  chartDesc: {
    margin: "8px 0 0",
    color: "#334155",
    fontWeight: 800,
  },

  chartCount: {
    color: "#0f172a",
    fontSize: 15,
    whiteSpace: "nowrap",
  },

  chartCanvas: {
    background: "#f8fafc",
    borderRadius: 14,
    padding: "18px 16px 8px",
    minHeight: 520,
  },

  emptyBox: {
    height: 460,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#334155",
    fontWeight: 900,
    fontSize: 16,
  },

  tooltip: {
    background: "#ffffff",
    border: "1px solid #cbd5e1",
    borderRadius: 10,
    padding: "10px 12px",
    boxShadow: "0 8px 20px rgba(15,23,42,0.14)",
  },
};