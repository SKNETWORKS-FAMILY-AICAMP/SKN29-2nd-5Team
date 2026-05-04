"""수요 예측 API.

프론트에서 대여소 정보와 날씨 정보를 보내면 학습 모델을 이용해 예상 대여량을 반환합니다.
"""

from __future__ import annotations

import datetime as dt
import math
import os
import pickle
from functools import lru_cache
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from core.config import settings

router = APIRouter(prefix="/api", tags=["predict"])


# -----------------------------------------------------------------------------
# 요청 데이터 형식
# -----------------------------------------------------------------------------
class PredictionRequest(BaseModel):
    """프론트엔드가 예측 요청 시 보내야 하는 값입니다."""

    station_id: int
    latitude: float
    longitude: float
    rack_count: int
    temperature: float = 0
    humidity: float = 0
    wind_speed: float = 0
    precipitation: float = 0


# -----------------------------------------------------------------------------
# 모델 로딩 캐시
# -----------------------------------------------------------------------------
@lru_cache(maxsize=1)
def load_ml_model() -> dict[str, Any]:
    """pkl 모델은 무거우므로 서버 실행 중 1회만 메모리에 올려 재사용합니다."""
    model_path = Path(getattr(settings, "DATA_DIR", "backend_data")) / "lgbm_v1.pkl"
    fallback_path = Path(os.getenv("LGBM_MODEL_PATH", "")) if os.getenv("LGBM_MODEL_PATH") else None

    if not model_path.exists() and fallback_path and fallback_path.exists():
        model_path = fallback_path

    if not model_path.exists():
        raise FileNotFoundError(f"머신러닝 모델 파일을 찾을 수 없습니다: {model_path}")

    with model_path.open("rb") as file:
        bundle = pickle.load(file)

    if not isinstance(bundle, dict) or "model" not in bundle or "feature_cols" not in bundle:
        raise ValueError("모델 pkl은 {'model': 모델, 'feature_cols': 컬럼목록} 구조여야 합니다.")

    return bundle


def _build_feature_row(request: PredictionRequest, feature_cols: list[str]) -> pd.DataFrame:
    """현재 시간과 요청값을 모델 feature 컬럼 순서에 맞는 1행 DataFrame으로 만듭니다."""
    now = dt.datetime.now()
    hour_sin = math.sin(2 * math.pi * now.hour / 24.0)
    hour_cos = math.cos(2 * math.pi * now.hour / 24.0)

    values: dict[str, Any] = {
        "station_id": request.station_id,
        "latitude": request.latitude,
        "longitude": request.longitude,
        "rack_count": request.rack_count,
        "station_age_days": 1000,
        "month": now.month,
        "day": now.day,
        "hour": now.hour,
        "dayofweek": now.weekday(),
        "is_day_off": 1 if now.weekday() >= 5 else 0,
        "hour_sin": hour_sin,
        "hour_cos": hour_cos,
        "temperature": request.temperature,
        "humidity": request.humidity,
        "wind_speed": request.wind_speed,
        "precipitation": request.precipitation,
        "lag_1": 0,
        "lag_2": 0,
        "lag_3": 0,
        "lag_24": 0,
        "lag_48": 0,
        "lag_168": 0,
        "rolling_mean_3": 0,
        "rolling_mean_6": 0,
        "rolling_mean_24": 0,
        "rolling_std_24": 0,
        "diff_1": 0,
        "diff_24": 0,
    }

    row = {column: values.get(column, 0) for column in feature_cols}
    return pd.DataFrame([row])


# -----------------------------------------------------------------------------
# 예측 API
# -----------------------------------------------------------------------------
@router.post("/predict-demand")
def predict_station_demand(request: PredictionRequest) -> dict[str, Any]:
    """대여소 단위 예상 대여량을 반환합니다."""
    try:
        bundle = load_ml_model()
        model = bundle["model"]
        feature_cols = list(bundle["feature_cols"])
        input_df = _build_feature_row(request, feature_cols)
        prediction = float(model.predict(input_df)[0])

        return {
            "ok": True,
            "station_id": request.station_id,
            "predicted_demand": max(0, round(prediction, 2)),
            "message": "예측이 완료되었습니다.",
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"예측 처리 실패: {exc}") from exc
