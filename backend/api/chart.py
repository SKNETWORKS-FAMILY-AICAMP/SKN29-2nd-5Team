"""대여량 차트 분석 API.

히트맵과 같은 캐시/집계 데이터를 사용하되, 차트 목적에 맞게 Top5·월별·시간대별로 재집계합니다.
"""

from __future__ import annotations

from typing import Any

import pandas as pd
from fastapi import APIRouter, Query

from services.data_utils import filter_rental_df, parse_districts, parse_months, parse_years

router = APIRouter(tags=["chart"])


# -----------------------------------------------------------------------------
# 차트 응답 변환 유틸
# -----------------------------------------------------------------------------
def _rows_from_grouped(df: pd.DataFrame, label_col: str, value_col: str = "rental_count", top: int | None = None) -> list[dict[str, Any]]:
    """DataFrame 집계 결과를 React 차트가 바로 그릴 수 있는 rows 배열로 바꿉니다."""
    if df.empty or label_col not in df.columns or value_col not in df.columns:
        return []

    rows = df.sort_values(value_col, ascending=False if top else True)
    if top:
        rows = rows.head(top)

    return [
        {
            "label": str(row[label_col]),
            "rental_count": int(row[value_col]),
        }
        for _, row in rows.iterrows()
    ]


def _empty_response(mode: str, years: list[int], months: list[str], district: str | None) -> dict[str, Any]:
    """데이터가 비었을 때도 프론트 차트가 에러 없이 빈 화면을 보여주도록 합니다."""
    return {
        "ok": True,
        "rows": [],
        "yearly": [],
        "summary": {"total_count": 0, "row_count": 0},
        "meta": {"mode": mode, "years": years, "months": months, "district": district},
    }


def _filtered_df(years: str | None, months: str | None, district: str | None) -> tuple[pd.DataFrame, list[int], list[str], list[str]]:
    """문자열 필터 값을 정리하고 services.data_utils의 캐시 데이터 조회 함수를 호출합니다."""
    year_list = parse_years(years)
    month_list = parse_months(months)
    district_list = [] if not district or district == "서울시 전체" else parse_districts(district)
    df = filter_rental_df(year_list, month_list, district_list)
    return df, year_list, month_list, district_list


def _build_chart_rows(df: pd.DataFrame, mode: str) -> list[dict[str, Any]]:
    """운영 목적별 차트 탭에 맞춰 데이터를 재집계합니다."""
    if df.empty:
        return []

    if mode in {"gu_top5", "district_top5"}:
        grouped = df.groupby("gu", as_index=False)["rental_count"].sum().rename(columns={"gu": "label"})
        return _rows_from_grouped(grouped, "label", top=5)

    if mode in {"hourly", "hour"}:
        if "hour" not in df.columns or df["hour"].isna().all():
            return [{"label": f"{hour:02d}시", "rental_count": 0} for hour in range(24)]
        grouped = df.dropna(subset=["hour"]).groupby("hour", as_index=False)["rental_count"].sum().sort_values("hour")
        grouped["label"] = grouped["hour"].astype(int).map(lambda value: f"{value:02d}시")
        return _rows_from_grouped(grouped, "label")

    if mode in {"monthly", "month"}:
        grouped = df.groupby("month", as_index=False)["rental_count"].sum().sort_values("month")
        grouped["label"] = grouped["month"].astype(str).str.zfill(2) + "월"
        return _rows_from_grouped(grouped, "label")

    # 기본값은 대여소 Top5입니다.
    grouped = df.groupby("station_name", as_index=False)["rental_count"].sum().rename(columns={"station_name": "label"})
    return _rows_from_grouped(grouped, "label", top=5)


def _build_chart_response(mode: str, years: str | None, months: str | None, district: str | None) -> dict[str, Any]:
    """필터링, 집계, 요약값 생성을 한 번에 처리합니다."""
    df, year_list, month_list, district_list = _filtered_df(years, months, district)
    if df.empty:
        return _empty_response(mode, year_list, month_list, district)

    yearly_df = df.groupby("year", as_index=False)["rental_count"].sum().sort_values("year")
    yearly_df["label"] = yearly_df["year"].astype(str) + "년"

    rows = _build_chart_rows(df, mode)
    return {
        "ok": True,
        "rows": rows,
        "yearly": _rows_from_grouped(yearly_df, "label"),
        "summary": {
            "total_count": int(df["rental_count"].sum()),
            "row_count": len(rows),
        },
        "meta": {
            "mode": mode,
            "years": year_list,
            "months": month_list,
            "district": district or "서울시 전체",
            "districts": district_list,
        },
    }


# -----------------------------------------------------------------------------
# 현재 차트 페이지용 API
# -----------------------------------------------------------------------------
@router.get("/api/chart/summary")
def chart_summary(
    mode: str = Query("station_top5"),
    years: str | None = Query("all"),
    months: str | None = Query("all"),
    district: str | None = Query("서울시 전체"),
) -> dict[str, Any]:
    """대여소 Top5, 자치구 Top5, 월별 흐름, 시간대별 흐름 차트 API입니다."""
    return _build_chart_response(mode=mode, years=years, months=months, district=district)


@router.get("/api/chart/cache-dashboard")
def chart_cache_dashboard(
    years: str | None = Query("2023,2024,2025"),
    months: str | None = Query("all"),
    district: str | None = Query("서울시 전체"),
    chart_type: str = Query("station_top5"),
) -> dict[str, Any]:
    """이전 차트 페이지에서 사용하던 cache-dashboard 주소를 유지하는 호환 API입니다."""
    return _build_chart_response(mode=chart_type, years=years, months=months, district=district)


# -----------------------------------------------------------------------------
# 예전 ChartPage 코드 호환 API
# -----------------------------------------------------------------------------
@router.get("/api/stats/chart-summary")
@router.get("/api/chart-summary")
def legacy_chart_summary(
    mode: str = Query("year"),
    years: str | None = Query("2023,2024,2025"),
) -> dict[str, Any]:
    """예전 주소를 쓰는 코드가 남아 있어도 월별/연도별 요약이 동작하도록 둡니다."""
    chart_mode = "monthly" if mode == "month" else "yearly"
    if chart_mode == "yearly":
        df, year_list, month_list, _ = _filtered_df(years, "all", "서울시 전체")
        if df.empty:
            return _empty_response(chart_mode, year_list, month_list, "서울시 전체")
        grouped = df.groupby("year", as_index=False)["rental_count"].sum().sort_values("year")
        grouped["label"] = grouped["year"].astype(str) + "년"
        rows = _rows_from_grouped(grouped, "label")
        return {"ok": True, "rows": rows, "data": rows, "meta": {"mode": mode}}

    result = _build_chart_response(mode="monthly", years=years, months="all", district="서울시 전체")
    return {"ok": True, "rows": result["rows"], "data": result["rows"], "meta": result["meta"]}


@router.get("/api/stats/chart-top5")
@router.get("/api/chart-top5")
def legacy_chart_top5(
    target: str = Query("station"),
    year: str | None = Query("2025"),
    months: str | None = Query("all"),
    district: str | None = Query("서울시 전체"),
) -> dict[str, Any]:
    """예전 Top5 API 주소를 새 chart summary 구조로 연결합니다."""
    mode = "gu_top5" if target in {"gu", "district"} else "station_top5"
    result = _build_chart_response(mode=mode, years=year, months=months, district=district)
    return {"ok": True, "rows": result["rows"], "data": result["rows"], "meta": result["meta"]}
