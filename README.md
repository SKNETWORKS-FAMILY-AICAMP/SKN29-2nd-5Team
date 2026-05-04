# 서울시 공공자전거 따릉이 대여량 예측

대여소별·시간대별 따릉이 대여량을 예측하여 자전거 재배치와 운영 의사결정을 지원하기 위한 회귀 예측 프로젝트이다.  
본 저장소는 산출물 작성 가이드 형식에 맞춰 데이터 전처리 결과서, 모델 학습 결과서, 학습된 모델 메타데이터를 포함한다.

---

## 산출물 전체 구조

```text
SKN29-2nd-5Team/
├── README.md                   
├── .env                
├── .gitignore                  
│
├── backend/                    
│   ├── main.py
│   ├── requirements.txt
│   ├── api/                    
│   │   ├── __init__.py
│   │   ├── chart.py
│   │   ├── predict.py
│   │   ├── realtime.py
│   │   └── stats.py
│   ├── core/                   
│   │   ├── __init__.py
│   │   ├── config.py
│   │   └── database.py
│   └── services/              
│       ├── __init__.py
│       ├── chart_service.py
│       ├── data_utils.py
│       ├── realtime_service.py
│       └── validation_service.py
│
├── frontend/                  
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── public/                
│   │   ├── home__main.png
│   │   └── home_top.png
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── App.css
│       ├── index.css
│       ├── api/               
│       │   └── client.js
│       └── pages/             
│           ├── Home.jsx
│           ├── HeatmapPage.jsx
│           ├── ChartPage.jsx
│           └── Ttareungyeojido.jsx
│
├── models/                    
│   ├── best_model.zip         
│   ├── xgboost_tuned_v1.pkl    
│   ├── lgbm_v1.pkl            
│   └── model_metadata.md   
│
├── data/                    
│   ├── raw/                
│   │   ├── bike_history/     
│   │   ├── holiday/           
│   │   ├── station/         
│   │   └── weather/          
│   └── processed/            
│       ├── train_2023_parts/
│       ├── valid_2024_parts/
│       ├── test_2025_parts/
│       └── bike_final_28features.parquet 
│
├── notebooks/                
│   ├── 01_preprocessing_pipeline.ipynb
│   └── 02_modeling_evaluation.ipynb
│
└── docs/                   
    ├── database/             
    │   ├── bike_db.png       
    │   ├── bike_db.sql       
    │   └── bike_db.md          
    ├── 1_data_preprocessing_report.md  
    └── 2_model_training_report.md      
```

---

## 1. 프로젝트 개요

| 항목 | 내용 |
|------|------|
| 문제 유형 | 회귀 |
| 예측 대상 | 대여소별 시간 단위 대여량 `rental_count` |
| 활용 방안 | 특정 대여소, 날짜, 시간 조건의 예상 대여량을 예측하여 운영 의사결정에 활용 |
| 성공 기준 | 최종 모델이 Baseline 대비 MAE, RMSE, WAPE는 낮고 R2는 높을 것 |

따릉이 대여 수요는 시간대, 요일, 계절, 날씨, 대여소 위치에 따라 크게 달라진다. 본 프로젝트는 공개 데이터를 기반으로 대여소별·시간대별 미래 대여량을 예측할 수 있는 학습 데이터셋과 모델을 구축하였다.

---

## 2. 데이터셋 소개

| 데이터 구분 | 원천 파일 | 기간 또는 범위 | 주요 역할 |
|---|---|---|---|
| 따릉이 대여 이력 | `data/raw/bike_history/{year}/bike_history_YYYY_MM.parquet` | 2023년 ~ 2025년, 월별 parquet 36개 | 대여소·날짜·시간 단위 `rental_count` 생성 |
| 대여소 정보 | `data/raw/station/station_master.csv`, `station_info.xlsx` | 대여소 마스터 3,417건 | 위도, 경도, 주소, 대여소 속성 결합 |
| 날씨 정보 | `data/raw/weather/{year}/asos_seoul_108_*.csv` | 2018-12-25 ~ 2026-03-31 | 기온, 습도, 풍속, 강수량 결합 |
| 공휴일 정보 | `data/raw/holiday/holiday_2019_2026.csv` | 2019년 ~ 2026년, 150건 | 공휴일 여부와 주말 여부를 결합해 `is_day_off` 생성 |

최종 학습 데이터는 원본 개별 대여 기록을 대여소·날짜·시간 단위로 집계한 회귀 예측 데이터셋이다.

| 구분 | 기간 | 행 수 | 타겟 합계 | 평균 대여량 | 0 대여량 비율 |
|------|------|------:|------:|------:|------:|
| Train | 2023년 | 23,459,991 | 44,282,784 | 1.888 | 0.451 |
| Validation | 2024년 | 23,818,357 | 43,494,512 | 1.826 | 0.455 |
| Test | 2025년 | 22,977,771 | 36,314,496 | 1.580 | 0.485 |

---

## 3. 전처리 요약

원본 대여 이력은 개별 자전거 대여 및 반납 기록 단위이므로, 모델 학습을 위해 대여소·날짜·시간 단위로 재집계하였다.

주요 전처리 내용:

- `대여일시`, `대여대여소ID`를 기준으로 대여량 집계
- 대여가 없는 시간대도 `rental_count = 0`으로 포함
- 대여소 정보, 날씨 정보, 공휴일 정보를 외부 변수로 결합
- 미매칭 대여소 58개 제거
- 반납일시, 반납대여소, 이용시간, 이용거리 등 예측 시점 이후에 알 수 있는 정보 제거
- 시간 주기성, lag, rolling, diff 계열 파생 변수 생성
- 트리 기반 회귀 모델을 사용하므로 별도 스케일링은 적용하지 않음

최종 입력 피처는 28개이며, 타겟 변수는 `rental_count`이다.

| 피처 그룹 | 최종 입력 특성 |
|-----------|----------------|
| 대여소 정보 | `station_id`, `latitude`, `longitude`, `rack_count`, `station_age_days` |
| 시간 정보 | `month`, `day`, `hour`, `dayofweek`, `hour_sin`, `hour_cos` |
| 쉬는 날 정보 | `is_day_off` |
| 날씨 정보 | `temperature`, `humidity`, `wind_speed`, `precipitation` |
| 과거 대여량 Lag | `lag_1`, `lag_2`, `lag_3`, `lag_24`, `lag_48`, `lag_168` |
| 이동 평균 | `rolling_mean_3`, `rolling_mean_6`, `rolling_mean_24` |
| 변동성 | `rolling_std_24` |
| 변화량 | `diff_1`, `diff_24` |

저장 파일:

| 구분 | 저장 위치 |
|------|----------|
| Train 데이터 | `data/processed/train_2023_parts/train_2023_part_*.parquet` |
| Validation 데이터 | `data/processed/valid_2024_parts/valid_2024_part_*.parquet` |
| Test 데이터 | `data/processed/test_2025_parts/test_2025_part_*.parquet` |

---

## 4. 모델링 전략

평가 지표는 회귀 문제에 맞춰 MAE, RMSE, WAPE, R2를 사용하였다.

| 지표 | 사용 목적 |
|------|-----------|
| MAE | 평균적으로 몇 대 정도 예측이 틀리는지 확인 |
| RMSE | 큰 예측 오차를 더 민감하게 확인 |
| WAPE | 전체 실제 대여량 대비 오차 비율 확인 |
| R2 | 실제 대여량 변동 설명력 확인 |

후보 모델:

| 모델 | 선정 이유 |
|------|-----------|
| Baseline | 평균 및 과거 동일 시간대 기반 기준 성능 확인 |
| XGBoost | 정형 데이터와 비선형 관계 학습에 강하며 Poisson 목적 함수 적용 가능 |
| LightGBM | 대용량 정형 데이터 학습 속도가 빠른 부스팅 계열 모델 |
| GRU | 직전 24시간 흐름을 sequence로 학습하는 시계열 대안 모델 |

---

## 5. 모델 성능 결과

### Baseline 성능, Test 기준

| 모델 | MAE | RMSE | WAPE | R2 |
|------|------:|------:|------:|------:|
| 대여소·시간대·휴일 여부 평균 | 1.2635 | 2.1827 | 0.7995 | 0.4791 |
| 대여소·시간대·요일 평균 | 1.2817 | 2.2268 | 0.8110 | 0.4579 |
| 전체 평균 | 1.8894 | 3.0398 | 1.1955 | -0.0103 |

### 최종 모델 비교, Test 기준

| 모델 | MAE | RMSE | WAPE | R2 |
|------|------:|------:|------:|------:|
| Baseline 최우수 모델 | 1.2635 | 2.1827 | 0.7995 | 0.4791 |
| XGBoost 기본 모델 | 0.9503 | 1.6152 | 0.6013 | 0.7148 |
| XGBoost 튜닝 후보 1 | **0.9457** | **1.6086** | **0.5984** | **0.7171** |
| XGBoost 튜닝 후보 2 | 0.9480 | 1.6091 | 0.5998 | 0.7169 |
| XGBoost 튜닝 후보 3 | 0.9486 | 1.6103 | 0.6003 | 0.7165 |
| LightGBM | 0.9484 | 1.6125 | 0.6001 | 0.7157 |
| GRU | 0.9678 | 1.7021 | 0.6114 | 0.6839 |

최종 선정 모델은 **XGBoost 튜닝 모델**이다. Test 기준 모든 핵심 지표에서 가장 우수했고, Baseline 최우수 모델 대비 MAE 약 25.2%, RMSE 약 26.3%, WAPE 약 25.2%를 개선하였다.

---

## 6. 최종 모델 메타데이터

| 항목 | 내용 |
|------|------|
| 모델명 | XGBoost Regressor |
| 버전 | v1.0.0 |
| 저장일 | 2026-05-02 |
| 작성자 | 프로젝트 5 팀 |
| 모델 파일 | `3_model/best_model.zip` 내부 `xgboost_tuned_v1.pkl` |
| 입력 특성 수 | 28개 |
| 타겟 변수 | `rental_count` |

학습 환경:

| 항목 | 버전 |
|------|------|
| Python | 3.13.5 |
| scikit-learn | 1.8.0 |
| xgboost | 3.1.3 |
| pandas | 2.2.3 |
| numpy | 2.3.5 |

최종 하이퍼파라미터:

| 파라미터 | 값 |
|---------|-----|
| objective | `count:poisson` |
| eval_metric | `rmse` |
| learning_rate | 0.03 |
| max_depth | 10 |
| min_child_weight | 30 |
| subsample | 0.8 |
| colsample_bytree | 0.8 |
| reg_alpha | 0.3 |
| reg_lambda | 2.0 |
| gamma | 0.1 |
| n_estimators | 3000 |
| random_state | 42 |

---

## 7. 모델 해석

최종 XGBoost 모델에서 중요한 변수는 대부분 과거 대여량과 시간 패턴 관련 변수였다.

| 순위 | 특성명 | 중요도 | 해석 |
|------|--------|------:|------|
| 1 | `lag_1` | 0.5212 | 직전 1시간 대여량이 현재 수요 예측에 가장 큰 영향을 미침 |
| 2 | `lag_168` | 0.1458 | 일주일 전 같은 시간대 패턴 반영 |
| 3 | `rolling_mean_3` | 0.1089 | 최근 3시간 평균 수요 흐름 반영 |
| 4 | `lag_24` | 0.0765 | 하루 전 같은 시간대 수요 반영 |
| 5 | `precipitation` | 0.0254 | 강수량에 따른 자전거 이용 변화 반영 |

대여량이 증가할 가능성이 높은 조건은 직전 수요가 높고, 하루 전·일주일 전 같은 시간대 수요가 높으며, 비가 적고, 출퇴근 등 특정 시간대 패턴이 뚜렷한 경우로 해석할 수 있다.

---

## 8. 모델 로드 및 예측 예시

`best_model.zip` 압축을 해제하면 `xgboost_tuned_v1.pkl`을 사용할 수 있다. pkl 파일은 `pickle`로 직렬화된 객체이며, 내부에 `model`과 `feature_cols`를 포함한다.

```python
import pickle
import pandas as pd

with open("3_model/xgboost_tuned_v1.pkl", "rb") as f:
    model_package = pickle.load(f)

model = model_package["model"]
feature_cols = model_package["feature_cols"]

new_data = pd.DataFrame([
    {
        "station_id": 101,
        "latitude": 37.55,
        "longitude": 126.98,
        "rack_count": 15,
        "station_age_days": 1000,
        "month": 5,
        "day": 3,
        "hour": 18,
        "dayofweek": 5,
        "is_day_off": 1,
        "hour_sin": -1.0,
        "hour_cos": 0.0,
        "temperature": 20.0,
        "humidity": 60.0,
        "wind_speed": 2.0,
        "precipitation": 0.0,
        "lag_1": 5,
        "lag_2": 4,
        "lag_3": 4,
        "lag_24": 6,
        "lag_48": 5,
        "lag_168": 7,
        "rolling_mean_3": 4.33,
        "rolling_mean_6": 4.80,
        "rolling_mean_24": 5.20,
        "rolling_std_24": 2.10,
        "diff_1": 1,
        "diff_24": -1
    }
])

X = new_data[feature_cols]
prediction = max(0, float(model.predict(X)[0]))

print(f"예상 대여량: {prediction:.2f}건")
print(f"화면 표시용 예상 대여량: {round(prediction)}대")
```

---

## 9. 재현 방법

1. `data/raw/`에 대여 이력, 대여소, 날씨, 공휴일 데이터를 준비한다.
2. `notebooks/01_preprocessing_pipeline.ipynb`를 실행하여 전처리 데이터를 생성한다.
3. 생성된 parquet part 파일을 `data/processed/` 하위에 저장한다.
4. 2023년은 Train, 2024년은 Validation, 2025년은 Test로 사용한다.
5. `notebooks/02_modeling_evaluation.ipynb` 또는 동일한 학습 코드를 실행한다.
6. XGBoost Regressor를 학습하고 Validation/Test 기준 MAE, RMSE, WAPE, R2를 평가한다.
7. 최종 모델을 `xgboost_tuned_v1.pkl`로 저장하고 `3_model/best_model.zip`에 패키징한다.

---

## 10. 한계점 및 향후 개선 방향

한계점:

- 대여소 마스터와 매칭되지 않는 일부 대여소 58개를 제거하였다.
- 날씨 데이터는 서울 관측 지점 기준이므로 개별 대여소 주변의 미세한 날씨 차이를 완전히 반영하지 못한다.
- `rental_count = 0`인 시간대가 많아 낮은 수요 구간의 예측 난이도가 높다.
- lag, rolling, diff 계열 피처는 운영 환경에서 과거 대여 이력 DB를 기반으로 실시간 생성되어야 한다.
- 실시간 자전거 보유량, 거치 가능 수, 재배치 이력, 고장/수리 정보 등 운영 데이터는 충분히 반영하지 못하였다.

향후 개선 방향:

- 2026년 이후 최신 데이터 구조를 정리하여 정기 재학습 수행
- 실시간 재고, 재배치, 고장/수리, 민원 데이터 등 운영 변수 추가
- 대여소 단위의 더 세밀한 날씨·지역 이벤트 데이터 결합
- SHAP 분석을 추가하여 변수 영향 방향과 개별 예측 근거 강화

---

## 참고 산출물

| 파일 | 설명 |
|------|------|
| `1_data_preprocessing_report.md` | 데이터셋 소개, EDA, 전처리, 데이터 분리 결과 |
| `2_model_training_report.md` | 모델링 전략, 후보 모델 성능, 최종 모델 선정 |
| `3_model/model_metadata.md` | 최종 모델 환경, 하이퍼파라미터, 입력 스펙, 예측 예시 |
