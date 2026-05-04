"""실시간 대여소 현황 API.

서울시 실시간 따릉이 API와 bike_markers 기준 자치구 매핑은 services.realtime_service에서 처리합니다.
이 파일은 프론트엔드에서 쓰는 주소와 파라미터를 정리하는 역할만 합니다.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Query

from services.realtime_service import get_realtime_stations

router = APIRouter(tags=["realtime"])


# -----------------------------------------------------------------------------
# 응답 정규화 유틸
# -----------------------------------------------------------------------------
def _call_realtime_service(districts: str | None, search: str | None, limit: int) -> Any:
    """서비스 함수의 파라미터명이 조금 달라도 최대한 호환되도록 단계적으로 호출합니다."""
    try:
        return get_realtime_stations(districts=districts, search=search, limit=limit)
    except TypeError:
        try:
            return get_realtime_stations(gu=districts, keyword=search, limit=limit)
        except TypeError:
            return get_realtime_stations(gu=districts, keyword=search)


def _normalize_payload(raw: Any, limit: int) -> dict[str, Any]:
    """서비스가 list를 반환하든 dict를 반환하든 프론트가 기대하는 {ok, data, debug} 구조로 맞춥니다."""
    if isinstance(raw, dict):
        data = raw.get("data") or raw.get("stations") or raw.get("rows") or []
        debug = raw.get("debug") or {}
        ok = raw.get("ok", True)
    else:
        data = raw if isinstance(raw, list) else []
        debug = {}
        ok = True

    if limit > 0:
        data = data[:limit]

    debug.setdefault("fetched_at", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    debug.setdefault("count", len(data))

    return {"ok": ok, "data": data, "debug": debug}


# -----------------------------------------------------------------------------
# 현재 프론트에서 사용하는 실시간 API
# -----------------------------------------------------------------------------
@router.get("/api/realtime/bike")
def realtime_bike(
    districts: str | None = Query("영등포구,마포구"),
    search: str | None = Query(""),
    limit: int = Query(10000, ge=1, le=30000),
) -> dict[str, Any]:
    """실시간 대여소 지도용 API입니다. 기본값은 영등포구, 마포구입니다."""
    raw = _call_realtime_service(districts=districts, search=search, limit=limit)
    return _normalize_payload(raw, limit=limit)


# -----------------------------------------------------------------------------
# 예전 주소 호환 API
# -----------------------------------------------------------------------------
@router.get("/api/realtime/stations")
def realtime_stations(
    gu: str | None = Query("중구"),
    q: str | None = Query(None),
    limit: int = Query(10000, ge=1, le=30000),
) -> dict[str, Any]:
    """예전 /api/realtime/stations 주소를 유지합니다."""
    raw = _call_realtime_service(districts=gu, search=q, limit=limit)
    return _normalize_payload(raw, limit=limit)
