"""프로젝트 공통 설정 파일.

역할
- 프로젝트 기준 경로를 한 곳에서 계산합니다.
- backend_data, cache, models 폴더 위치를 환경변수와 기본 경로 기준으로 찾습니다.
- 서울 열린데이터 API 키와 DB 접속 주소를 한 곳에서 관리합니다.
"""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

# -----------------------------------------------------------------------------
# .env 로드 블록
# -----------------------------------------------------------------------------
# backend/.env에 작성한 DATA_DIR, CACHE_DIR, DATABASE_URL, SEOUL_OPENAPI_KEY 등을
# 파이썬 코드에서 os.getenv(...)로 읽을 수 있게 합니다.
load_dotenv()

# -----------------------------------------------------------------------------
# 프로젝트 경로 블록
# -----------------------------------------------------------------------------
# config.py 위치가 backend/core/config.py이므로 parents[1]은 backend 폴더입니다.
BASE_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = BASE_DIR.parent


def _optional_path(value: str | None) -> Path | None:
    """환경변수 문자열이 비어 있으면 None, 값이 있으면 Path로 변환합니다."""
    if not value or not str(value).strip():
        return None
    return Path(str(value).strip()).expanduser()


def _first_existing_path(candidates: list[Path | None], default: Path) -> Path:
    """후보 경로 중 실제 존재하는 첫 번째 경로를 사용하고, 없으면 기본 경로를 반환합니다."""
    for candidate in candidates:
        if candidate and candidate.exists():
            return candidate
    return default


# -----------------------------------------------------------------------------
# 데이터 폴더 탐색 블록
# -----------------------------------------------------------------------------
# 기존 프로젝트마다 데이터 위치가 조금 달랐기 때문에 여러 후보를 순서대로 확인합니다.
DATA_DIR = _first_existing_path(
    [
        _optional_path(os.getenv("DATA_DIR")),
        BASE_DIR / "backend_data",
        PROJECT_DIR / "backend_data",
        PROJECT_DIR / "data",
    ],
    BASE_DIR / "backend_data",
)

# -----------------------------------------------------------------------------
# 캐시/모델 폴더 블록
# -----------------------------------------------------------------------------
# 히트맵과 차트는 같은 CSV 캐시를 쓰므로 cache 폴더 후보를 넓게 잡습니다.
CACHE_DIR = _first_existing_path(
    [
        _optional_path(os.getenv("CACHE_DIR")),
        DATA_DIR / "_cache",
        DATA_DIR / "cache",
        BASE_DIR / "_cache",
    ],
    DATA_DIR / "_cache",
)

MODEL_DIR = _first_existing_path(
    [
        _optional_path(os.getenv("MODEL_DIR")),
        DATA_DIR / "models",
        DATA_DIR,
    ],
    DATA_DIR,
)

# 캐시 폴더는 없으면 생성해도 안전합니다. 데이터 원본 폴더는 임의 생성하지 않습니다.
CACHE_DIR.mkdir(parents=True, exist_ok=True)

# -----------------------------------------------------------------------------
# 외부 API / DB 설정 블록
# -----------------------------------------------------------------------------
# 예전 코드에서 키 이름이 섞였을 수 있어 여러 환경변수명을 함께 지원합니다.
SEOUL_OPENAPI_KEY = (
    os.getenv("SEOUL_OPENAPI_KEY")
    or os.getenv("SEOUL_API_KEY")
    or os.getenv("SEOUL_BIKE_API_KEY")
    or ""
).strip()
SEOUL_BIKE_API_KEY = SEOUL_OPENAPI_KEY
SEOUL_BIKE_URL = "http://openapi.seoul.go.kr:8088/{key}/json/bikeList/{start}/{end}/"

# SQL DB를 쓰는 경우 .env에 DATABASE_URL을 지정합니다.
# 예: mysql+pymysql://user:password@localhost:3306/dbname?charset=utf8mb4
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()

# -----------------------------------------------------------------------------
# 개발 로그 설정 블록
# -----------------------------------------------------------------------------
# VSCode 터미널에서 어느 영역이 문제인지 확인하기 위한 간단한 로그 기준입니다.
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
