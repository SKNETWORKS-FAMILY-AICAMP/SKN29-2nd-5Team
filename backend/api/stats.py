"""대여량 분포 분석 API.

히트맵 화면에서 사용하는 대여소별 대여량 좌표 데이터를 반환합니다.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query

from services.data_utils import filter_rental_df, parse_districts, parse_months, parse_years

router = APIRouter(prefix="/api", tags=["distribution"])


# -----------------------------------------------------------------------------
# 공통 응답 생성 함수
# -----------------------------------------------------------------------------
def _empty_distribution_response() -> dict[str, Any]:
    """조회 결과가 없을 때도 프론트가 깨지지 않도록 동일한 구조를 반환합니다."""
    return {
        "points": [],
        "summary": {
            "point_count": 0,
            "total_count": 0,
            "max_count": 0,
            "max_station": "-",
        },
    }


def _build_distribution_response(years: str | None, months: str | None, districts: str | None, limit: int) -> dict[str, Any]:
    """필터 조건을 실제 데이터프레임에 적용한 뒤 지도용 좌표 목록으로 변환합니다."""
    year_list = parse_years(years)
    month_list = parse_months(months)
    district_list = parse_districts(districts)

    df = filter_rental_df(year_list, month_list, district_list)
    if df.empty:
        return _empty_distribution_response()

    group_cols = ["station_id", "station_name", "gu", "lat", "lon"]
    grouped = (
        df.dropna(subset=["lat", "lon"])
        .groupby(group_cols, dropna=False, as_index=False)["rental_count"]
        .sum()
        .sort_values("rental_count", ascending=False)
        .head(limit)
    )

    if grouped.empty:
        return _empty_distribution_response()

    points = [
        {
            "station_id": str(row.station_id),
            "station_name": str(row.station_name),
            "gu": str(row.gu),
            "lat": float(row.lat),
            "lng": float(row.lon),
            "rental_count": int(row.rental_count),
        }
        for row in grouped.itertuples(index=False)
    ]

    max_row = grouped.iloc[0]
    return {
        "points": points,
        "summary": {
            "point_count": len(points),
            "total_count": int(grouped["rental_count"].sum()),
            "max_count": int(max_row["rental_count"]),
            "max_station": str(max_row["station_name"]),
        },
    }


# -----------------------------------------------------------------------------
# 실제 사용 API + 이전 코드 호환 API
# -----------------------------------------------------------------------------
@router.get("/distribution")
def distribution(
    years: str | None = Query("2025"),
    months: str | None = Query("all"),
    districts: str | None = Query("금천구"),
    limit: int = Query(6000, ge=1, le=30000),
) -> dict[str, Any]:
    """대여량 분포 지도용 API입니다. 기본값은 2025년, 전체 월, 금천구입니다."""
    return _build_distribution_response(years=years, months=months, districts=districts, limit=limit)


@router.get("/stats/heatmap")
def stats_heatmap(
    years: str | None = Query(None),
    months: str | None = Query(None),
    districts: str | None = Query(None),
    year: int | None = Query(None),
    month: str | None = Query(None),
    gu: str | None = Query(None),
    limit: int = Query(20000, ge=1, le=30000),
) -> dict[str, Any]:
    """기존 프론트 코드와 새 프론트 코드가 모두 호출할 수 있는 히트맵 호환 API입니다."""
    resolved_years = years or (str(year) if year else "2025")
    resolved_months = months or month or "all"
    resolved_districts = districts or gu or "금천구"
    return _build_distribution_response(
        years=resolved_years,
        months=resolved_months,
        districts=resolved_districts,
        limit=limit,
    )
