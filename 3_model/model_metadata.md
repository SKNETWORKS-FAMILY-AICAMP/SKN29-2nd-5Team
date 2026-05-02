# 📦 산출물 3: 모델 메타데이터

## 모델 메타데이터

### 기본 정보
| 항목 | 내용 |
|------|------|
| 모델명 | XGBoost Regressor |
| 버전 | v1.0.0 |
| 저장일 | 2026-05-02 |
| 작성자 | 프로젝트 5 팀 |
| 파일명 | xgboost_tuned_v1.pkl |

### 학습 환경
| 항목 | 버전 |
|------|------|
| Python | 3.13.5 |
| scikit-learn | 1.8.0 |
| xgboost | 3.1.3 |
| pandas | 2.2.3 |
| numpy | 2.3.5 |
| joblib | 1.5.3 |

### 모델 성능 (최종)
| 지표 | 값 |
|------|-----|
| MAE | 0.945732 |
| RMSE | 1.608567 |
| WAPE | 0.598406 |
| R2 | 0.717098 |

> 위 성능은 Test 2025 데이터 기준 최종 평가 결과이다. 본 프로젝트는 대여량 예측 회귀 문제이므로 분류 지표인 Accuracy, Precision, Recall, F1-Score, ROC-AUC 대신 MAE, RMSE, WAPE, R2를 최종 성능 지표로 사용하였다.

### 하이퍼파라미터
| 파라미터 | 값 |
|---------|-----|
| objective | count:poisson |
| eval_metric | rmse |
| learning_rate | 0.03 |
| max_depth | 10 |
| min_child_weight | 30 |
| subsample | 0.8 |
| colsample_bytree | 0.8 |
| reg_alpha | 0.3 |
| reg_lambda | 2.0 |
| gamma | 0.1 |
| tree_method | hist |
| random_state | 42 |
| n_estimators | 3000 |
| n_jobs | -1 |

### 입력 데이터 스펙
- 입력 특성 수: 28개
- 타겟 변수: `rental_count`
- 필수 전처리: 모델 학습 시 사용한 컬럼명과 컬럼 순서를 동일하게 유지해야 한다.
- 특성 순서: 아래 28개 컬럼 순서 기준

| 순서 | 특성명 | 설명 |
|------|--------|------|
| 1 | station_id | 대여소 ID |
| 2 | latitude | 대여소 위도 |
| 3 | longitude | 대여소 경도 |
| 4 | rack_count | 거치대 수 |
| 5 | station_age_days | 대여소 운영일수 |
| 6 | month | 월 |
| 7 | day | 일 |
| 8 | hour | 시간대 |
| 9 | dayofweek | 요일 |
| 10 | is_day_off | 쉬는 날 여부 |
| 11 | hour_sin | 시간 주기성 sin 변환 |
| 12 | hour_cos | 시간 주기성 cos 변환 |
| 13 | temperature | 기온 |
| 14 | humidity | 습도 |
| 15 | wind_speed | 풍속 |
| 16 | precipitation | 강수량 |
| 17 | lag_1 | 1시간 전 대여량 |
| 18 | lag_2 | 2시간 전 대여량 |
| 19 | lag_3 | 3시간 전 대여량 |
| 20 | lag_24 | 24시간 전 대여량 |
| 21 | lag_48 | 48시간 전 대여량 |
| 22 | lag_168 | 168시간 전 대여량 |
| 23 | rolling_mean_3 | 직전 3시간 평균 대여량 |
| 24 | rolling_mean_6 | 직전 6시간 평균 대여량 |
| 25 | rolling_mean_24 | 직전 24시간 평균 대여량 |
| 26 | rolling_std_24 | 직전 24시간 대여량 표준편차 |
| 27 | diff_1 | lag_1 - lag_2 |
| 28 | diff_24 | lag_1 - lag_24 |

### 예측값 해석
| 출력값 | 의미 |
|--------|------|
| `model.predict(X)` | 입력된 대여소와 시간 조건에 대한 예상 대여량 |
| 0 이상 실수값 | 해당 시간대에 예측되는 대여 건수 |
| 반올림값 | 서비스 화면에서 보여줄 예상 대여 대수 |

예측 결과는 따릉이 대여량을 의미한다. 모델 예측값은 실수 형태로 반환되므로 서비스 화면에서는 소수점 둘째 자리까지 표시하거나, 운영 판단 목적에서는 반올림하여 정수 대수로 표시할 수 있다. 대여량은 음수가 될 수 없으므로 예측 후처리 단계에서 0보다 작은 값은 0으로 보정한다.

### 모델 로드 및 예측 예시
```python
import joblib
import pandas as pd

# 모델 패키지 로드
model_package = joblib.load("xgboost_tuned_v1.pkl")

# pkl 내부 구성 요소 사용
model = model_package["model"]
feature_cols = model_package["feature_cols"]

# 신규 예측 데이터 예시
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

# 학습 당시 컬럼 순서와 동일하게 정렬
X = new_data[feature_cols]

# 예측 수행
prediction = model.predict(X)[0]
prediction = max(0, float(prediction))

print(f"예상 대여량: {prediction:.2f}건")
print(f"화면 표시용 예상 대여량: {round(prediction)}대")
```

### 재현 방법
1. `data/processed/` 경로에 전처리 완료 데이터 준비
2. 학습 데이터는 2023년, 검증 데이터는 2024년, 테스트 데이터는 2025년 기준으로 구성
3. 최종 Feature 28개를 동일한 컬럼명과 순서로 준비
4. XGBoost Regressor 학습 코드 실행
5. 검증 데이터와 테스트 데이터에 대해 MAE, RMSE, WAPE, R2 평가
6. 최종 모델을 `xgboost_tuned_v1.pkl`로 저장
7. 백엔드에서는 `joblib.load()`로 pkl 파일을 불러와 예측 API에서 사용

### 알려진 한계점
- 모델은 학습 당시 사용한 28개 Feature가 모두 준비되어야 정상적으로 예측할 수 있다.
- `lag`, `rolling`, `diff` 계열 Feature는 사용자가 직접 입력하는 값이 아니라, 대여 이력 데이터베이스를 기반으로 백엔드에서 생성해야 한다.
- 날씨 데이터가 누락되면 예측 정확도가 낮아질 수 있으므로 예측 시점의 기온, 습도, 풍속, 강수량 확보가 필요하다.
- 신규 대여소의 경우 과거 대여 이력이 부족하여 lag 및 rolling Feature의 신뢰도가 낮을 수 있다.
- 시간 흐름에 따라 이용 패턴이 변할 수 있으므로 정기적인 재학습이 필요하다.
- 본 모델은 특정 대여소와 특정 시간대의 예상 대여량을 예측하는 용도이며, 실시간 재배치 최적화나 자전거 부족 위험 판단은 별도의 운영 로직과 함께 적용해야 한다.
