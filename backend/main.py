"""FastAPI 서버 시작 파일.

이 파일은 서버 실행, CORS 설정, 라우터 등록만 담당합니다.
실제 데이터 조회/가공 로직은 api/와 services/ 폴더로 분리해서 main.py가 비대해지는 것을 막습니다.
"""

from __future__ import annotations

import importlib
import os
import traceback
from datetime import datetime
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# -----------------------------------------------------------------------------
# 환경변수 및 기본 경로 설정
# -----------------------------------------------------------------------------
# backend/.env 파일을 먼저 읽어서 DB 계정, 서울시 API 키, 데이터 경로를 사용할 수 있게 합니다.
load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "backend_data"

APP_VERSION = os.getenv("APP_VERSION", "2026-05-refactor-step1")

# React 개발 서버와 preview 서버에서 백엔드 API를 호출할 수 있도록 허용합니다.
ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

# -----------------------------------------------------------------------------
# FastAPI 앱 생성 및 공통 미들웨어 설정
# -----------------------------------------------------------------------------
app = FastAPI(
    title="Ttareungyi Demand Forecast API",
    version=APP_VERSION,
    description="따릉이 대여량 분포, 차트 분석, 실시간 대여소 현황 API",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1):(3000|4173|5173|8000)",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------------------------------------------------------
# 에러 로그 공통 처리
# -----------------------------------------------------------------------------
# 개발 중 오류가 발생하면 VSCode 터미널에 파일명/라인/함수 흐름이 보이도록 traceback을 출력합니다.
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    print("\n" + "=" * 90)
    print(f"[ERROR][{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {request.method} {request.url.path}")
    traceback.print_exception(type(exc), exc, exc.__traceback__)
    print("=" * 90 + "\n")

    return JSONResponse(
        status_code=500,
        content={
            "ok": False,
            "error": "서버 처리 중 오류가 발생했습니다. VSCode 터미널의 [ERROR] 로그를 확인해 주세요.",
            "detail": str(exc),
            "path": request.url.path,
        },
    )

# -----------------------------------------------------------------------------
# 라우터 등록
# -----------------------------------------------------------------------------
# main.py가 모든 코드를 직접 들고 있지 않도록 api 폴더의 router만 불러와 등록합니다.
# 특정 router import가 실패해도 서버 자체는 뜨게 하고, 실패 원인은 터미널에 출력합니다.
ROUTER_MODULES = [
    "api.stats",
    "api.chart",
    "api.realtime",
    "api.predict",
    "api.validation",
]

LOADED_ROUTERS: list[str] = []
FAILED_ROUTERS: dict[str, str] = {}

for module_name in ROUTER_MODULES:
    try:
        module = importlib.import_module(module_name)
        router = getattr(module, "router")
        app.include_router(router)
        LOADED_ROUTERS.append(module_name)
        print(f"[INFO] router loaded: {module_name}")
    except Exception as exc:  # pragma: no cover - 개발 편의용 로그입니다.
        FAILED_ROUTERS[module_name] = str(exc)
        print(f"[ERROR] router load failed: {module_name}")
        traceback.print_exception(type(exc), exc, exc.__traceback__)

# -----------------------------------------------------------------------------
# 기본 점검 API
# -----------------------------------------------------------------------------
@app.get("/")
def root() -> dict[str, Any]:
    """브라우저에서 http://127.0.0.1:8000 접속 시 서버 상태를 확인합니다."""
    return {
        "ok": True,
        "message": "Ttareungyi backend is running",
        "version": APP_VERSION,
        "loaded_routers": LOADED_ROUTERS,
        "failed_routers": FAILED_ROUTERS,
    }


@app.get("/api/health")
def health() -> dict[str, Any]:
    """프론트엔드 상태 확인 API입니다."""
    return {
        "ok": True,
        "base_dir": str(BASE_DIR),
        "data_dir": str(DATA_DIR),
        "data_dir_exists": DATA_DIR.exists(),
        "loaded_routers": LOADED_ROUTERS,
        "failed_routers": FAILED_ROUTERS,
    }
