"""대여량 CSV 캐시/컬럼 정규화 공통 유틸.

역할
- 2023~2025 월별 대여량 CSV를 표준 컬럼으로 정규화합니다.
- 정규화된 데이터를 pickle 캐시로 저장해 히트맵과 차트가 같은 데이터를 빠르게 사용하도록 합니다.
- 기존 API 코드에서 쓰던 years/months/districts 방식과 일부 과거 코드의 year/gu 방식도 함께 지원합니다.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Iterable, Sequence
import re

import pandas as pd

from core.config import CACHE_DIR, DATA_DIR

# -----------------------------------------------------------------------------
# 기본 상수 블록
# -----------------------------------------------------------------------------
YEARS = [2023, 2024, 2025]
MONTHS = [f"{i:02d}" for i in range(1, 13)]
STANDARD_COLUMNS = [
    "year",
    "month",
    "gu",
    "station_name",
    "station_id",
    "lat",
    "lon",
    "hour",
    "rental_count",
]


# -----------------------------------------------------------------------------
# 파라미터 파싱 블록
# -----------------------------------------------------------------------------
def _split_values(value: str) -> list[str]:
    """콤마, 공백, 파이프가 섞인 문자열을 리스트로 분리합니다."""
    return [item.strip() for item in re.split(r"[,|\s]+", value) if item.strip()]


def parse_years(years: str | int | Sequence[int | str] | None) -> list[int]:
    """연도 필터를 [2023, 2024, 2025] 형태로 정리합니다."""
    if years is None or years in ("", "all", "전체", "서울시 전체"):
        return YEARS.copy()
    if isinstance(years, int):
        return [years]
    if isinstance(years, (list, tuple, set)):
        return sorted({int(str(y).strip()) for y in years if str(y).strip()})
    return sorted({int(y) for y in _split_values(str(years))})


def parse_months(months: str | int | Sequence[int | str] | None) -> list[str]:
    """월 필터를 ['01', '02'] 형태로 정리합니다."""
    if months is None or months in ("", "all", "전체", "월 전체", "전체월"):
        return MONTHS.copy()
    if isinstance(months, int):
        return [str(months).zfill(2)]
    if isinstance(months, (list, tuple, set)):
        return sorted({str(m).zfill(2) for m in months if str(m).strip()})
    return sorted({m.zfill(2) for m in _split_values(str(months))})


def parse_districts(districts: str | Sequence[str] | None) -> list[str]:
    """자치구 필터를 ['금천구', '마포구'] 형태로 정리합니다."""
    if districts is None or districts in ("", "all", "전체", "서울시 전체"):
        return []
    if isinstance(districts, (list, tuple, set)):
        return [str(g).strip() for g in districts if str(g).strip() and str(g).strip() != "서울시 전체"]
    return [g for g in re.split(r"[,|]+", str(districts)) if g.strip() and g.strip() != "서울시 전체"]


# -----------------------------------------------------------------------------
# CSV 컬럼 정규화 블록
# -----------------------------------------------------------------------------
def _first_existing_col(df: pd.DataFrame, candidates: list[str]) -> str | None:
    """후보 컬럼명 중 실제 DataFrame에 존재하는 첫 번째 컬럼명을 찾습니다."""
    lower_map = {str(col).strip().lower(): col for col in df.columns}
    for candidate in candidates:
        key = candidate.strip().lower()
        if key in lower_map:
            return lower_map[key]
    return None


def _to_number(series: pd.Series | None, default: float = 0) -> pd.Series:
    """문자열 숫자와 쉼표 숫자를 안전하게 숫자형 Series로 변환합니다."""
    if series is None:
        return pd.Series(dtype="float64")
    return pd.to_numeric(series.astype(str).str.replace(",", "", regex=False), errors="coerce").fillna(default)


def _read_csv_any_encoding(path: Path) -> pd.DataFrame:
    """한글 CSV에서 자주 쓰는 인코딩을 순서대로 시도합니다."""
    last_error: Exception | None = None
    for encoding in ("utf-8-sig", "cp949", "euc-kr", "utf-8"):
        try:
            return pd.read_csv(path, encoding=encoding)
        except Exception as exc:
            last_error = exc
    raise RuntimeError(f"CSV를 읽지 못했습니다: {path}") from last_error


def _normalize_count_csv(path: Path, year: int, month: str) -> pd.DataFrame:
    """월별 원본 CSV를 히트맵/차트 공통 표준 컬럼으로 변환합니다."""
    raw = _read_csv_any_encoding(path)
    df = raw.copy()
    df.columns = [str(col).strip() for col in df.columns]

    gu_col = _first_existing_col(df, ["gu", "자치구", "자치구명", "district", "borough", "대여소자치구"])
    station_col = _first_existing_col(df, ["stationName", "station_name", "대여소명", "대여소 이름", "name"])
    station_id_col = _first_existing_col(df, ["stationId", "station_id", "대여소ID", "대여소 아이디", "station_no", "id"])
    lat_col = _first_existing_col(df, ["stationLatitude", "station_latitude", "latitude", "lat", "위도"])
    lon_col = _first_existing_col(df, ["stationLongitude", "station_longitude", "longitude", "lng", "lon", "경도"])
    hour_col = _first_existing_col(df, ["hour", "시간", "대여시간", "hour_of_day", "시간대"])
    count_col = _first_existing_col(
        df,
        ["rental_count", "rent_count", "count", "cnt", "대여건수", "이용건수", "대여량", "use_count", "total_count", "대여횟수"],
    )

    # 대여건수 컬럼명이 명확하지 않으면 마지막 숫자 컬럼을 대여건수 후보로 사용합니다.
    if count_col is None:
        numeric_cols = [col for col in df.columns if pd.api.types.is_numeric_dtype(df[col])]
        count_col = numeric_cols[-1] if numeric_cols else None

    out = pd.DataFrame(index=df.index)
    out["year"] = int(year)
    out["month"] = str(month).zfill(2)
    out["gu"] = df[gu_col].astype(str).str.strip() if gu_col else "서울시 전체"
    out["station_name"] = df[station_col].astype(str).str.strip() if station_col else "대여소 정보 없음"
    out["station_id"] = df[station_id_col].astype(str).str.strip() if station_id_col else ""
    out["lat"] = _to_number(df[lat_col]) if lat_col else pd.NA
    out["lon"] = _to_number(df[lon_col]) if lon_col else pd.NA
    out["hour"] = _to_number(df[hour_col]).astype("Int64").clip(0, 23) if hour_col else pd.NA
    out["rental_count"] = _to_number(df[count_col]).astype(float) if count_col else 0.0

    return out[STANDARD_COLUMNS]


# -----------------------------------------------------------------------------
# 캐시 생성/로드 블록
# -----------------------------------------------------------------------------
def _candidate_csv_paths(year: int, month: str) -> list[Path]:
    """데이터 폴더 구조가 달라도 월별 CSV를 찾을 수 있도록 후보 경로를 생성합니다."""
    folders = [DATA_DIR / f"{year}_count", DATA_DIR]
    names = [
        f"base_dataset_{year}_{month}.csv",
        f"{year}_{month}.csv",
        f"rental_{year}_{month}.csv",
        f"bike_{year}_{month}.csv",
    ]
    return [folder / name for folder in folders for name in names]


@lru_cache(maxsize=1)
def load_rental_cache() -> pd.DataFrame:
    """2023~2025 월별 CSV를 한 번만 읽어 pickle 캐시로 재사용합니다."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_pkl = CACHE_DIR / "rental_counts_cache.pkl"

    if cache_pkl.exists():
        try:
            cached = pd.read_pickle(cache_pkl)
            if isinstance(cached, pd.DataFrame) and not cached.empty:
                return cached
            cache_pkl.unlink(missing_ok=True)
        except Exception as exc:
            print(f"[CACHE WARN] 기존 대여량 캐시를 읽지 못해 재생성합니다: {exc}")
            cache_pkl.unlink(missing_ok=True)

    frames: list[pd.DataFrame] = []
    for year in YEARS:
        for month in MONTHS:
            path = next((candidate for candidate in _candidate_csv_paths(year, month) if candidate.exists()), None)
            if path is None:
                continue
            try:
                frames.append(_normalize_count_csv(path, year, month))
            except Exception as exc:
                print(f"[DATA WARN] 월별 CSV 정규화 실패: {path} / {exc}")

    if not frames:
        print(f"[DATA WARN] 대여량 CSV를 찾지 못했습니다. DATA_DIR={DATA_DIR}")
        return pd.DataFrame(columns=STANDARD_COLUMNS)

    df = pd.concat(frames, ignore_index=True)
    df["rental_count"] = pd.to_numeric(df["rental_count"], errors="coerce").fillna(0)
    df["gu"] = df["gu"].replace({"nan": "서울시 전체", "None": "서울시 전체", "": "서울시 전체"}).fillna("서울시 전체")
    df["station_name"] = df["station_name"].replace({"nan": "대여소 정보 없음", "": "대여소 정보 없음"}).fillna("대여소 정보 없음")

    try:
        df.to_pickle(cache_pkl)
        print(f"[CACHE INFO] 대여량 캐시 저장 완료: {cache_pkl} / rows={len(df):,}")
    except Exception as exc:
        print(f"[CACHE WARN] 대여량 캐시 저장 실패: {exc}")

    return df


# -----------------------------------------------------------------------------
# 필터링 블록
# -----------------------------------------------------------------------------
def filter_rental_df(
    years: list[int] | int | str | None = None,
    months: list[str] | int | str | None = None,
    districts: list[str] | str | None = None,
    *,
    year: int | str | None = None,
    gu: str | None = None,
) -> pd.DataFrame:
    """연도·월·자치구 조건으로 캐시 데이터를 필터링합니다.

    years/months/districts는 새 구조용이고, year/gu는 과거 코드 호환용입니다.
    """
    df = load_rental_cache().copy()
    if df.empty:
        return df

    year_list = parse_years(year if year is not None else years)
    month_list = parse_months(months)
    district_list = parse_districts(gu if gu is not None else districts)

    if year_list:
        df = df[df["year"].isin(year_list)]
    if month_list:
        df = df[df["month"].isin(month_list)]
    if district_list:
        df = df[df["gu"].isin(district_list)]

    return df
