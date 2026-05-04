# Database Schema

## ERD

![bike_db ERD](./bike_db_erd.png)

## 테이블 구성

### 1. bike_markers

대여소의 변하지 않는 기본 정보를 담고 있는 기준 테이블입니다.

| 컬럼명 | 설명 |
|---|---|
| station_id | 대여소 고유 번호 |
| station_name | 대여소 이름 |
| gu | 자치구 |
| address | 상세 주소 |
| stationLatitude | 위도 |
| stationLongitude | 경도 |
| lcd_count | LCD형 거치대 수 |
| qr_count | QR형 거치대 수 |

### 2. bike_usage

실제 대여 이력과 기상 관련 정보를 저장하는 테이블입니다.

...

### 3. bike_usage_heatmap_cache

히트맵과 차트 시각화를 빠르게 보여주기 위한 연월별 집계 캐시 테이블입니다.

...

## SQL 스키마 파일

실제 DB 생성 SQL은 아래 파일을 참고합니다.

`backend/database/schema.sql`