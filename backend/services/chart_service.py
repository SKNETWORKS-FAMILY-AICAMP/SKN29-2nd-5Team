"""대여량 차트 집계 서비스.

역할
- 히트맵과 같은 대여량 캐시를 사용해 차트용 데이터만 재집계합니다.
- 프로젝트 목표인 수요 패턴 확인, 피크 시간 파악, 재배치 우선순위 판단에 맞는 지표를 반환합니다.
- 프론트엔드가 바로 사용할 수 있도록 rows/annual/monthly/top5 형태를 함께 제공합니다.
"""
from __future__ import annotations

from typing import Any

import pandas as pd

from services.data_utils import MONTHS, filter_rental_df, load_rental_cache, parse_months, parse_years


# -----------------------------------------------------------------------------
# 응답 변환 블록
# -----------------------------------------------------------------------------
def _records(df: pd.DataFrame, cols: list[str]) -> list[dict[str, Any]]:
    """DataFrame 일부 컬럼을 JSON 직렬화 가능한 dict list로 변환합니다."""
    if df.empty:
        return []
    valid_cols = [col for col in cols if col in df.columns]
    return df[valid_cols].to_dict(orient="records")


def _chart_rows(df: pd.DataFrame, label_col: str, value_col: str = "rental_count", top: int | None = None) -> list[dict[str, Any]]:
    """차트 컴포넌트에서 공통으로 쓰는 label/rental_count 구조를 만듭니다."""
    if df.empty or label_col not in df.columns or value_col not in df.columns:
        return []
    ordered = df.sort_values(value_col, ascending=False if top else True)
    if top:
        ordered = ordered.head(top)
    return [
        {"label": str(row[label_col]), "rental_count": int(round(float(row[value_col])))}
        for _, row in ordered.iterrows()
    ]


def _empty_dashboard(message: str = "대여량 캐시 데이터를 찾지 못했습니다.") -> dict[str, Any]:
    """데이터가 없을 때도 프론트가 깨지지 않도록 동일한 응답 구조를 반환합니다."""
    return {
        "ok": False,
        "message": message,
        "summary": {"total": 0, "station_count": 0, "peak_hour": "-", "peak_gu": "-"},
        "annual": [],
        "monthly": [],
        "station_top5": [],
        "gu_top5": [],
        "hour_top5": [],
        "rows": [],
    }


# -----------------------------------------------------------------------------
# 집계 블록
# -----------------------------------------------------------------------------
def build_chart_dashboard(
    years: list[int] | int | str | None = None,
    months: list[str] | str | None = None,
    gu: str = "서울시 전체",
    mode: str = "station_top5",
) -> dict[str, Any]:
    """차트 페이지에서 한 번에 쓰는 운영 지표와 차트 데이터를 생성합니다."""
    all_df = load_rental_cache()
    if all_df.empty:
        return _empty_dashboard("2023~2025 월별 CSV 캐시 데이터를 찾지 못했습니다.")

    year_list = parse_years(years)
    month_list = parse_months(months or MONTHS)
    district_list = [] if not gu or gu == "서울시 전체" else [gu]
    filtered = filter_rental_df(years=year_list, months=month_list, districts=district_list)

    if filtered.empty:
        result = _empty_dashboard("선택한 조건에 맞는 차트 데이터가 없습니다.")
        result["ok"] = True
        result["filters"] = {"years": year_list, "months": month_list, "gu": gu}
        return result

    annual = (
        filtered.groupby("year", as_index=False)["rental_count"].sum().sort_values("year")
    )
    annual["label"] = annual["year"].astype(str) + "년"
    annual["rental_count"] = annual["rental_count"].round().astype(int)

    monthly = (
        filtered.groupby("month", as_index=False)["rental_count"].sum().sort_values("month")
    )
    monthly["label"] = monthly["month"].astype(str).str.zfill(2) + "월"
    monthly["rental_count"] = monthly["rental_count"].round().astype(int)

    station_top5 = (
        filtered.groupby(["station_name", "gu"], as_index=False)["rental_count"].sum()
        .sort_values("rental_count", ascending=False)
        .head(5)
    )
    station_top5["label"] = station_top5["station_name"]
    station_top5["rental_count"] = station_top5["rental_count"].round().astype(int)

    gu_top5 = (
        filtered.groupby("gu", as_index=False)["rental_count"].sum()
        .sort_values("rental_count", ascending=False)
        .head(5)
    )
    gu_top5["label"] = gu_top5["gu"]
    gu_top5["rental_count"] = gu_top5["rental_count"].round().astype(int)

    if "hour" in filtered.columns and filtered["hour"].notna().any():
        hour_top5 = (
            filtered.dropna(subset=["hour"])
            .groupby("hour", as_index=False)["rental_count"].sum()
            .sort_values("rental_count", ascending=False)
            .head(5)
        )
        hour_top5["label"] = hour_top5["hour"].astype(int).map(lambda hour: f"{hour:02d}시")
        hour_top5["rental_count"] = hour_top5["rental_count"].round().astype(int)
    else:
        hour_top5 = pd.DataFrame(columns=["hour", "label", "rental_count"])

    mode_map = {
        "annual": _chart_rows(annual, "label"),
        "yearly": _chart_rows(annual, "label"),
        "monthly": _chart_rows(monthly, "label"),
        "month": _chart_rows(monthly, "label"),
        "station_top5": _chart_rows(station_top5, "label", top=5),
        "gu_top5": _chart_rows(gu_top5, "label", top=5),
        "district_top5": _chart_rows(gu_top5, "label", top=5),
        "hour_top5": _chart_rows(hour_top5, "label", top=5),
        "hourly": _chart_rows(hour_top5, "label", top=5),
    }

    total = int(round(float(filtered["rental_count"].sum())))
    station_count = int(filtered["station_name"].nunique())
    peak_hour = str(hour_top5.iloc[0]["label"]) if not hour_top5.empty else "-"
    peak_gu = str(gu_top5.iloc[0]["gu"]) if not gu_top5.empty else "-"

    return {
        "ok": True,
        "filters": {"years": year_list, "months": month_list, "gu": gu, "mode": mode},
        "summary": {"total": total, "station_count": station_count, "peak_hour": peak_hour, "peak_gu": peak_gu},
        "annual": _records(annual, ["year", "label", "rental_count"]),
        "monthly": _records(monthly, ["month", "label", "rental_count"]),
        "station_top5": _records(station_top5, ["station_name", "gu", "label", "rental_count"]),
        "gu_top5": _records(gu_top5, ["gu", "label", "rental_count"]),
        "hour_top5": _records(hour_top5, ["hour", "label", "rental_count"]),
        "rows": mode_map.get(mode, mode_map["station_top5"]),
    }
