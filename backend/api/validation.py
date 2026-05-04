"""모델 검증 지표 API.

현재 프론트 화면에서는 예측 정확도 검증 페이지를 제거했지만, 발표/백업 확인용 API로 남겨둡니다.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from services.validation_service import get_validation_summary

router = APIRouter(prefix="/api/validation", tags=["validation"])


@router.get("/summary")
def validation_summary() -> dict[str, Any]:
    """학습 모델 검증 요약 지표를 반환합니다."""
    return get_validation_summary()
