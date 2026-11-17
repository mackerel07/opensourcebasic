# dataset-v1 초기 학습 계획

2026-11-17 기준으로 작성했다. 목적은 등록한 계산기·가위·마우스 사진으로 고정 DINOv2 특징을 추출하고 작은 분류기를 학습하는 것이다.

## 현재 확인한 자료

[dataset-v1 릴리스](https://github.com/mackerel07/opensourcebasic/releases/tag/dataset-v1)에 학습 완료 모델 대신 단독 사진 31장과 반납 평가 사진 12장이 올라왔다. ZIP SHA-256은 `9184722b771df5129e8619d5ab68739a6f4d8724bd43595a3047b2f5d13693a0`이다.

| 품목 | 단독 사진 | 임시 학습 | 임시 검증 |
| --- | ---: | ---: | ---: |
| 계산기 | 10 | 01~08, 8장 | 09~10, 2장 |
| 가위 | 8 | 01~05, 5장 | 06~08, 3장 |
| 마우스 | 13 | 01~10, 10장 | 11~13, 3장 |

촬영 회차 표기는 미확인이다. 사진의 EXIF 촬영 시각과 배경을 참고해 가까운 시각의 사진을 묶는 임시 분할을 사용한다. 이 분할은 소유자가 직접 지정한 것으로 확정하지 않는다. 같은 실물·촬영일이 양쪽에 남을 수 있어 이 점수는 탐색용이다. 촬영자에게 회차를 확인한 뒤 정식 분할을 확정한다. 반납 평가 12장은 학습, 마스크 선택, 설정 탐색에 사용하지 않는다.

## 원본 배치와 후보 생성

릴리스 ZIP을 `model/data/dataset_v1/`에 풀어 그 아래에 `single/`과 `return_eval/`을 둔다. 공개 ZIP의 외부 폴더 이름은 `오소기_데이터셋`이다. 실행 폴더를 맞춘 뒤 아래처럼 단독 사진의 후보를 만든다. 이미 결과가 있는 폴더는 덮어쓰지 않으므로 재실행은 별도 실험 폴더에서 한다.

```bash
cd model
for image in data/dataset_v1/single/*/*.jpg; do
  stem="$(basename "$image" .jpg)"
  .venv/bin/python infer_scene.py --image "$image" --device cpu --outdir "runs/dataset_v1/preparation/$stem"
done
```

각 `crop_번호.png`와 원본을 대조한다. 최종 선택은 `dataset_v1_selection.csv`에 기록한다. 표에는 선택한 후보 번호와 원본·crop SHA-256을 저장한다. `stage_selected_crops.py`로 이 값과 분할을 검사하고 학습 폴더에 복사한다. 후보 번호는 사용한 SAM2 가중치·장치·설정에 종속되므로 재생성한 후보를 다시 확인한다.

## 수동 보완 기록

현재 자동 후보에서는 가위 8장 모두에서 전체 영역을 확보하지 못했고, `mouse_02`도 전체 후보가 부족했다. 9장의 학습·검증 사진에 한해 원본을 보고 박스와 양성 점 2개를 지정해 SAM2 후보를 다시 만들었다. 후보 3개를 비교해 각 사진의 `1001`번을 선택했다. 이 과정은 정답 crop 준비이며 자동 물품 탐지 성능 평가와 분리한다.

`dataset_v1_prompts.json`에 1024px 기준 박스·점 좌표를 남겼다. 아래 명령으로 9장의 보완 후보를 별도 폴더에 만들고, `prompted/*/crop_100*.png`와 `mask_100*.png`를 대응하는 `preparation/사진명/` 폴더로 복사한다. 이미 같은 이름의 후보가 있으면 새 준비 폴더를 사용한다.

```bash
.venv/bin/python make_prompted_candidates.py --dataset-root data/dataset_v1 --annotations dataset_v1_prompts.json --outdir runs/dataset_v1/prompted
for folder in runs/dataset_v1/prompted/*; do
  stem="$(basename "$folder")"
  cp "$folder"/crop_100*.png "$folder"/mask_100*.png "runs/dataset_v1/preparation/$stem/"
done
```

## 실행 순서

1. ZIP 해시와 사진 읽기, 품목별 장수, 중복 파일을 확인한다. 단독 사진의 라벨과 촬영 시각을 기록한다.
2. 단독 사진에 SAM2.1 Small 자동 마스크를 적용한다. 물품 전체와 배경이 함께 후보로 나오므로 원본과 후보를 대조해 물품 전체 후보를 사람이 선택한다. 전체 후보가 없으면 해당 사진은 보류하거나 수동 영역 지정으로 보완하고 기록한다.
3. `other`에는 단독 사진에서 명확하게 물품이 없는 배경 후보만 넣는다. 실제 선택은 학습 16개, 검증 3개로, 총 19개다. 물품 일부나 그림자가 물품 후보와 혼동되지 않는지 확인한다. 현재 배경 위주의 other이므로 펜·스테이플러 등 미등록 실물에 대한 일반화는 별도 검증이 필요하다.
4. 같은 원본의 물품·배경 crop과 향후 회전본은 모두 같은 분할에 둔다. 최종 반납 사진의 crop을 other로 가져오지 않는다.
5. DINOv2 ViT-S/14 가중치를 고정한다. RGB 변환, 물품 밖 회색 처리, 종횡비를 유지한 224×224 여백, ImageNet 정규화를 동일하게 적용해 후보당 384차원 특징을 저장한다.
6. L2 정규화 뒤 scikit-learn 로지스틱 회귀만 학습한다. `lbfgs`, `class_weight=balanced`, `max_iter=2000`, `random_state=42`를 사용한다.
7. `C=0.1, 1, 10, 100`을 학습용에서 각각 적합하고 검증 Macro F1이 가장 높은 모델을 선택한다. 동점이면 작은 C를 선택한다. 검증 자료로 재학습하지 않는다.
8. 학습과 검증의 정확도·Macro F1·품목별 F1·표본수·혼동행렬을 비교한다. 클래스별 표본수가 적으므로 정답 개수와 전체 개수를 함께 기록한다. 학습 점수만 높고 검증 점수가 낮으면 새 촬영 회차와 어려운 사례를 보강한다.

## 환경과 기존 명령

검증된 Mac CPU 환경은 Python 3.12.14, torch 2.5.1, torchvision 0.20.1, scikit-learn 1.7.2, NumPy 1.26.4다. 설치는 모델 담당자가 저장소의 `model/`에서 수행한다.

```bash
cd model
bash setup.sh
.venv/bin/python -m pip check
```

사람이 확인한 crop은 `data/crops/dataset_v1/train/품목/회차__파일.png`와 `data/crops/dataset_v1/val/품목/회차__파일.png`에 둔다. 클래스는 `calculator`, `scissors`, `mouse`, `other`다. 아래 명령은 이 자료 준비가 끝난 뒤 순서대로 실행한다.

```bash
.venv/bin/python stage_selected_crops.py --dataset-root data/dataset_v1 --prepared runs/dataset_v1/preparation --selection dataset_v1_selection.csv --output data/crops
.venv/bin/python make_manifest.py --root data/crops --output data/manifest.csv
.venv/bin/python train_head.py extract --manifest data/manifest.csv --output runs/dataset_v1/features.npz --device cpu
.venv/bin/python train_head.py fit --features runs/dataset_v1/features.npz --outdir runs/dataset_v1/model
.venv/bin/python train_head.py evaluate --features runs/dataset_v1/features.npz --model runs/dataset_v1/model/head.joblib --split val --outdir runs/dataset_v1/val
```

## 반납 장면 평가

촬영 회차와 분할을 확인하고 후보 선택·학습·판정 기준을 고정한 뒤 보관한 12장으로 1회 평가한다. 현재 `class_score_min=0.7`, `class_margin_min=0.15`는 초기 설정이며 정답 확률로 해석하지 않는다. 이 값을 조정하려면 별도 개발용 반납 장면을 준비한다.

정답표를 `scenes_truth.csv`로 옮기고 각 사진을 `infer_scene.py --classifier ... --scene-id ... --predictions-csv ...`로 실행한 뒤 `scene_metrics.py`로 집계한다. 평가 보고서에는 아래를 남긴다.

- 품목별 예측 개수와 정답 개수, 세 품목 전체 수량 일치 건수
- 실제 누락 장면 중 완료로 판정한 건수와 분모
- 명시적 누락 판단, 확인 요청, 실행 실패를 각각 구분한 건수
- 한 물품을 여러 번 세기, 붙은 두 물품을 하나로 세기, 미등록 물품 오인식 사례
- 장면별 CPU 처리 시간과 모델 로드 시간을 구분한 기록

실패한 장면도 전체 분모에 포함한다. 12장의 결과는 초기 실험이며 일반적인 서비스 정확도로 확대 해석하지 않는다. 최종 평가 오류를 보고 학습 자료나 설정을 고치면 새로운 평가 자료가 필요하다.

## 저장할 결과

원본 사진, crop, 가중치, 가상환경, 학습된 `head.joblib`은 로컬에서 관리한다. 저장소에는 이 계획과 데이터 해시, 분할·선택 근거, 학습 설정, 집계 결과를 남긴다. 원본 사진과 로컬 절대 경로가 담긴 결과 파일을 공개 저장소에 추가하기 전에 내용을 확인한다.

[로지스틱 회귀 공식 문서](https://scikit-learn.org/1.7/modules/generated/sklearn.linear_model.LogisticRegression.html) · [촬영 묶음을 분리하는 평가 원칙](https://scikit-learn.org/1.7/modules/cross_validation.html#cross-validation-iterators-for-grouped-data)

## 이번 실행 결과

[초기 학습 결과와 남은 문제](TRAIN_RESULT.md)를 함께 본다. 현재 저장한 분류기는 검증 argmax 11/11이지만 기존 점수·점수 차이 기준으로 자동 확정된 crop은 0/11이다. 정식 반납 평가는 보류했다.
