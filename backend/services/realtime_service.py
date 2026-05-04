"""실시간 따릉이 API + 자치구 매핑 서비스.

역할
- 서울 열린데이터 bikeList를 1000건씩 반복 호출해 전체 대여소를 가져옵니다.
- 실시간 API의 stationLatitude/stationLongitude와 DB bike_markers의 좌표를 기준으로 자치구를 매핑합니다.
- 프론트 숫자 마커에 필요한 실시간 잔여대수와 1시간 뒤 예상 잔여대수 더미값을 함께 제공합니다.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

import pandas as pd
import requests

from core.config import SEOUL_BIKE_API_KEY, SEOUL_BIKE_URL
from core.database import read_sql_df


# -----------------------------------------------------------------------------
# 숫자/문자 정규화 블록
# -----------------------------------------------------------------------------
def _to_int(value: Any, default: int = 0) -> int:
    """API에서 문자열로 오는 숫자를 int로 변환합니다."""
    try:
        return int(float(value))
    except Exception:
        return default


def _to_float(value: Any) -> float | None:
    """API에서 문자열로 오는 좌표를 float로 변환합니다."""
    try:
        return float(value)
    except Exception:
        return None


def _normalize_station_id(value: Any) -> str:
    """ST- 접두어 유무가 달라도 비교할 수 있도록 대여소 ID를 정리합니다."""
    text = str(value or "").strip()
    return text.replace("ST-", "").replace("st-", "")


def _split_districts(gu: str | list[str] | None) -> list[str]:
    """자치구 파라미터를 리스트로 정리합니다."""
    if not gu or gu in ("all", "전체", "서울시 전체"):
        return []
    if isinstance(gu, list):
        return [item.strip() for item in gu if item.strip()]
    return [item.strip() for item in str(gu).split(",") if item.strip()]


# -----------------------------------------------------------------------------
# 서울 실시간 API 호출 블록
# -----------------------------------------------------------------------------
def _fetch_realtime_rows() -> list[dict[str, Any]]:
    """서울 열린데이터 bikeList를 1000건씩 끝까지 호출합니다."""
    if not SEOUL_BIKE_API_KEY:
        print("[REALTIME WARN] SEOUL_OPENAPI_KEY 또는 SEOUL_BIKE_API_KEY가 없어 실시간 API 호출을 건너뜁니다.")
        return []

    rows: list[dict[str, Any]] = []
    start = 1
    page_size = 1000
    total_count: int | None = None

    while True:
        end = start + page_size - 1
        url = SEOUL_BIKE_URL.format(key=SEOUL_BIKE_API_KEY, start=start, end=end)

        try:
            response = requests.get(url, timeout=12)
            response.raise_for_status()
            payload = response.json()
        except Exception as exc:
            print(f"[REALTIME WARN] 서울 실시간 API 호출 실패: {start}-{end} / {exc}")
            break

        root = payload.get("rentBikeStatus") or payload.get("bikeList") or {}
        if total_count is None:
            total_count = _to_int(root.get("list_total_count"), 0)

        page_rows = root.get("row") or []
        if not page_rows:
            break

        rows.extend(page_rows)
        print(f"[REALTIME INFO] 실시간 API 수신: {start}-{end} / 누적 {len(rows):,}건")

        if total_count and len(rows) >= total_count:
            break
        if len(page_rows) < page_size:
            break
        start += page_size

    return rows


# -----------------------------------------------------------------------------
# DB 자치구 매핑 블록
# -----------------------------------------------------------------------------
def _load_marker_mapping() -> pd.DataFrame:
    """bike_markers 테이블에서 좌표 기준 자치구 매핑 정보를 가져옵니다."""
    query = """
        SELECT
            stationId,
            stationName,
            stationLatitude,
            stationLongitude,
            gu
        FROM bike_markers
    """
    df = read_sql_df(query)
    if df.empty:
        return pd.DataFrame(columns=["stationId", "stationName", "stationLatitude", "stationLongitude", "gu", "lat_key", "lng_key"])

    df = df.copy()
    df["lat_key"] = pd.to_numeric(df["stationLatitude"], errors="coerce").round(6)
    df["lng_key"] = pd.to_numeric(df["stationLongitude"], errors="coerce").round(6)
    df["station_id_key"] = df["stationId"].map(_normalize_station_id)
    return df.dropna(subset=["lat_key", "lng_key"])


# -----------------------------------------------------------------------------
# 1시간 뒤 예상 잔여대수 더미 블록
# -----------------------------------------------------------------------------
def _dummy_expected_after_1h(station_id: str, current: int, rack: int) -> int:
    """발표용 더미 예측값입니다. 같은 대여소는 비슷한 결과가 나오도록 ID 기반 변동폭을 만듭니다."""
    key = station_id or "0"
    hash_value = sum((idx + 1) * ord(char) for idx, char in enumerate(key))
    delta = (hash_value % 7) - 3

    # 거치대가 적고 현재 잔여가 적은 대여소는 부족 위험을 더 보수적으로 표시합니다.
    if current <= 3:
        delta -= 1
    elif rack >= 20 and current >= 8:
        delta += 1

    return max(0, current + delta)


def _risk_level(current: int, rack: int, predicted: int) -> tuple[str, str]:
    """마커 색상 판단용 위험도를 계산합니다."""
    rack_base = max(rack, 1)
    predicted_ratio = predicted / rack_base

    if current <= 3 or predicted <= 3 or predicted_ratio <= 0.15:
        return "risk", "부족 위험"
    if current >= 8 and predicted_ratio >= 0.35:
        return "safe", "여유"
    return "normal", "보통"


# -----------------------------------------------------------------------------
# 실시간 행 정규화 블록
# -----------------------------------------------------------------------------
def _rows_to_dataframe(rows: list[dict[str, Any]]) -> pd.DataFrame:
    """서울 API 원본 row를 프론트에서 쓰는 표준 컬럼으로 정리합니다."""
    normalized: list[dict[str, Any]] = []

    for row in rows:
        lat = _to_float(row.get("stationLatitude"))
        lng = _to_float(row.get("stationLongitude"))
        if lat is None or lng is None:
            continue

        station_id = str(row.get("stationId") or row.get("stationNo") or "").strip()
        station_name = str(row.get("stationName") or "").strip()
        rack = _to_int(row.get("rackTotCnt"), 0)
        current = _to_int(row.get("parkingBikeTotCnt"), 0)
        expected = _dummy_expected_after_1h(station_id=station_id, current=current, rack=rack)
        risk, risk_text = _risk_level(current=current, rack=rack, predicted=expected)

        normalized.append(
            {
                "stationId": station_id,
                "stationNo": station_id,
                "station_id": station_id,
                "station_id_key": _normalize_station_id(station_id),
                "stationName": station_name,
                "station_name": station_name,
                "rackTotCnt": rack,
                "parkingBikeTotCnt": current,
                "shared": _to_int(row.get("shared"), 0),
                "stationLatitude": lat,
                "stationLongitude": lng,
                "lat": lat,
                "lng": lng,
                "lat_key": round(lat, 6),
                "lng_key": round(lng, 6),
                "expectedBikeTotCnt1h": expected,
                "predicted_after_1h": expected,
                "risk_level": risk,
                "risk_text": risk_text,
            }
        )

    return pd.DataFrame(normalized)


# -----------------------------------------------------------------------------
# 외부 공개 함수 블록
# -----------------------------------------------------------------------------
def get_realtime_stations(gu: str | list[str] | None = "중구", keyword: str | None = None, limit: int | None = None) -> dict[str, Any]:
    """실시간 대여소 목록을 자치구/검색어 기준으로 반환합니다."""
    raw_rows = _fetch_realtime_rows()
    realtime_df = _rows_to_dataframe(raw_rows)
    marker_df = _load_marker_mapping()
    district_list = _split_districts(gu)

    if realtime_df.empty:
        return {
            "ok": True,
            "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "gu": gu,
            "districts": district_list,
            "stations": [],
            "data": [],
            "counts": {"safe": 0, "normal": 0, "risk": 0},
            "debug": {"api_rows": len(raw_rows), "mapped_rows": 0},
        }

    if not marker_df.empty:
        merged = realtime_df.merge(
            marker_df[["lat_key", "lng_key", "gu"]],
            on=["lat_key", "lng_key"],
            how="left",
        )
        merged["gu"] = merged["gu"].fillna("")
    else:
        merged = realtime_df.copy()
        merged["gu"] = ""

    if district_list:
        merged = merged[merged["gu"].isin(district_list)]

    if keyword:
        keyword_text = str(keyword).strip()
        if keyword_text:
            merged = merged[merged["stationName"].astype(str).str.contains(keyword_text, case=False, na=False)]

    if limit:
        merged = merged.head(max(int(limit), 0))

    drop_cols = [col for col in ["lat_key", "lng_key", "station_id_key"] if col in merged.columns]
    records = merged.drop(columns=drop_cols).to_dict("records")

    counts = {"safe": 0, "normal": 0, "risk": 0}
    for item in records:
        level = item.get("risk_level", "normal")
        counts[level] = counts.get(level, 0) + 1

    now_text = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    return {
        "ok": True,
        "updated_at": now_text,
        "gu": gu,
        "districts": district_list,
        "stations": records,
        "data": records,
        "counts": counts,
        "debug": {
            "fetched_at": now_text,
            "api_rows": len(raw_rows),
            "normalized_rows": len(realtime_df),
            "mapped_rows": int(merged["gu"].astype(bool).sum()) if "gu" in merged.columns else 0,
            "returned_rows": len(records),
        },
    }
