"""DB 연결 공통 유틸.

역할
- SQLAlchemy engine을 필요할 때만 생성합니다.
- DB 연결 실패가 서버 전체 장애로 번지지 않도록 DataFrame 빈 값으로 안전하게 반환합니다.
- 예전 코드에서 사용하던 execute_df 이름도 호환용으로 유지합니다.
"""
from __future__ import annotations

from functools import lru_cache
from typing import Any

import pandas as pd

from core.config import DATABASE_URL


# -----------------------------------------------------------------------------
# Engine 생성 블록
# -----------------------------------------------------------------------------
# SQLAlchemy는 DB를 실제로 쓸 때만 import합니다.
# 이렇게 해야 DB 패키지가 없거나 DATABASE_URL이 없어도 CSV 기반 화면은 계속 실행됩니다.
@lru_cache(maxsize=1)
def get_engine():
    """DATABASE_URL 기준으로 SQLAlchemy engine을 1회 생성해 재사용합니다."""
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL 환경변수가 비어 있습니다. DB 기능은 건너뜁니다.")

    try:
        from sqlalchemy import create_engine  # type: ignore
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "sqlalchemy 또는 DB 드라이버가 설치되어 있지 않습니다. "
            "pip install sqlalchemy pymysql 후 다시 실행해 주세요."
        ) from exc

    return create_engine(DATABASE_URL, pool_pre_ping=True)


# -----------------------------------------------------------------------------
# SQL 조회 블록
# -----------------------------------------------------------------------------
# read_sql_df는 실시간 지도 자치구 매핑처럼 DB가 있으면 쓰고, 실패하면 빈 DF로 넘깁니다.
def read_sql_df(query: str, params: dict[str, Any] | None = None) -> pd.DataFrame:
    """SQL SELECT 결과를 DataFrame으로 반환합니다. 실패하면 빈 DataFrame을 반환합니다."""
    try:
        engine = get_engine()
        with engine.connect() as conn:
            return pd.read_sql(query, conn, params=params or {})
    except Exception as exc:
        print(f"[DB WARN] SQL 조회 실패: {exc}")
        return pd.DataFrame()


# -----------------------------------------------------------------------------
# 이전 코드 호환 블록
# -----------------------------------------------------------------------------
# 과거 main.py에서 execute_df(...) 이름을 사용했기 때문에 리팩토링 중에도 깨지지 않게 별칭을 둡니다.
def execute_df(query: str, params: dict[str, Any] | None = None) -> pd.DataFrame:
    """기존 코드 호환용 별칭입니다. 내부적으로 read_sql_df를 사용합니다."""
    return read_sql_df(query=query, params=params)


def db_available() -> bool:
    """DB 접속 설정이 존재하는지 간단히 확인합니다."""
    return bool(DATABASE_URL)
