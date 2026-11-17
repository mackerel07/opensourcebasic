# 공용 물품 반납 확인 학습과 평가 실행 안내

SAM2.1 Small과 DINOv2 ViT-S/14를 고정하고, 물품 특징으로 로지스틱 회귀만 학습한다. 클래스는 `calculator`, `scissors`, `mouse`, `other` 네 개다. 자동 마스크를 기본 입력으로 사용한다.

실제 데이터셋은 이 패키지에 포함되어 있지 않다. 분류기를 주지 않은 추론은 마스크와 특징만 내보내고 반드시 `review`를 반환한다. 공개 트럭 사진은 실행 확인용이며, 대상 물품 분류 성능을 증명하지 않는다.

## 1 현재 준비된 환경

- 확인한 컴퓨터: Apple M4, 메모리 16GB, macOS arm64
- Python 3.12.14
- PyTorch 2.5.1, torchvision 0.20.1
- scikit-learn 1.7.2, NumPy 1.26.4, SciPy 1.14.1
- Pillow 11.0.0, OpenCV headless 4.10.0.84, matplotlib 3.9.2
- Mac 기본 실행은 CPU다. SAM2 CUDA 확장은 설치하지 않는다. MPS를 명시하면 미지원 연산 일부는 CPU로 처리한다.
- xFormers는 설치하지 않는다. DINOv2가 일반 PyTorch attention 경로를 사용하므로 관련 경고 자체는 실패가 아니다.

저장소를 내려받은 뒤 모델을 개발할 때만 `cd model`로 이동해 설치한다. 설치 후 `.venv`와 `runtime.local.json`이 로컬에 생긴다. 실제 사진·라벨, 가중치, 가상환경, 실행 중 생기는 파일은 로컬에 보관한다.

새 컴퓨터에서는 Python 3.12를 준비한 뒤 아래 명령을 실행한다. 약 273MB의 공식 모델 가중치와 패키지를 다운로드한다. `setup.sh`는 가상환경을 만든다. 기존 가상환경이 있으면 해당 환경에서 requirements 파일의 버전을 설치하므로 새 폴더에서 시작하는 편이 분명하다.

```bash
bash setup.sh
```

Python 3.12 명령이 다른 이름이면 다음처럼 지정할 수 있다.

```bash
RETURN_CHECK_PYTHON=/path/to/python3.12 bash setup.sh
```

Mac 검증 환경의 전체 패키지는 `requirements-macos.lock.txt`에 고정했다. 다른 OS의 GPU 조합은 이번 작업에서 시험하지 않았다. CUDA 환경으로 옮길 때는 PyTorch 공식 설치 안내에 맞는 torch/torchvision 조합을 확인한다.

## 2 제공 코드

| 파일 | 역할 |
|---|---|
| `bootstrap.py` | 공식 저장소의 지정 커밋과 가중치 확보, 체크섬 확인, SAM2 설치 |
| `check_env.py` | 라이브러리 버전, MPS/CUDA, 실제 가속기 연산 확인 |
| `vision_runtime.py` | RGB 처리, 마스크 자르기, 동일한 전처리와 고정 DINOv2 실행 |
| `infer_scene.py` | 자동 마스크, 후보 정리, 특징 추출, 선택적으로 분류·집계 |
| `make_manifest.py` | 사람이 나눈 학습·검증·평가 폴더를 CSV로 정리 |
| `train_head.py` | 특징 저장, 작은 분류기 학습, 잘린 이미지의 성능 평가 |
| `scene_metrics.py` | 장면별 반납 확인 수치와 Wilson 구간 계산 |
| `test_core.py` | 데이터 누출, 판정 집계, 가상 특징 학습 실행 검사 |

[실행 검증과 예제 결과](evidence/README.md)를 확인할 수 있다.

## 3 먼저 실행 확인

패키지 폴더를 작업 디렉터리로 사용한다.

```bash
.venv/bin/python check_env.py
.venv/bin/python -m unittest -v test_core.py
.venv/bin/python infer_scene.py --image sample/truck.jpg --device auto --outdir runs/first_check
```

`auto`는 CUDA가 있으면 CUDA, 그 외에는 CPU를 사용한다. Mac의 기준 실행은 CPU이며 `--device cpu`로 명시할 수도 있다. `--device mps`도 실행했지만 공개 예제에서 CPU와 후보 마스크 개수가 달랐으므로 실험 옵션으로 남겼다. 두 장치를 섞어 한 실험의 성능 수치로 보고하지 않는다. 이전 결과를 보존하기 위해 `result.json`이 이미 있는 출력 폴더는 덮어쓰지 않는다. 다시 실행할 때 다른 폴더명을 지정한다.

생기는 결과는 다음과 같다.

- `overlay.jpg`: 후보 영역과 후보 번호
- `crop_000.png` 등: 영역 바깥을 회색으로 바꾼 물품 후보 이미지
- `mask_000.png` 등: 처리 이미지 좌표계의 마스크
- `candidate_features.npy`: 후보 수 × 384의 DINOv2 특징 배열
- `result.json`: 실행 장치, 설정, 후보, 집계, 처리 시간

물품 전체·일부분·배경이 함께 후보로 나올 수 있다. 후처리는 마스크 교집합을 합집합으로 나눈 IoU가 큰 후보만 중복으로 제거한다. 작은 부분이 큰 마스크에 들어 있다는 이유만으로 전체 후보를 제거하지 않는다. 실제 물품의 종류와 수량은 학습된 분류기와 반납 장면 평가로 확인한다.

## 4 학습 자료 준비

공개 데이터와 직접 찍은 사진을 모은 뒤, 먼저 원본 사진 또는 촬영 묶음별로 `train`, `val`, `test`를 나눈다. 같은 사진의 마스크·사각형 crop·회전본·연속 촬영본은 같은 묶음에 둔다. 공개 자료의 중복 이미지와 같은 제품 사진의 거의 동일한 복사본도 사람이 확인한다. 코드의 바이트 해시 검사는 파일 내용이 완전히 같은 중복만 찾는다.

훈련 이미지의 물품 마스크는 사람이 확인해 정답 품목과 맞는 것을 선택한다. `infer_scene.py`의 `crop_*.png` 중 올바른 전체 물품 영역을 골라 아래 폴더에 넣을 수 있다. 잘못된 영역은 재지정하거나 다시 준비한다. 이 수작업은 학습 자료를 만드는 과정이며, 실제 사용 때 사용자가 매번 클릭해야 한다는 뜻이 아니다.

`other`에는 책상, 책, 펜, 물품의 잘못 분리된 부분처럼 자동 마스크에서 실제로 나오는 불필요한 후보를 포함한다. 너무 다양한 미지의 물품을 적은 `other` 자료로 모두 거부할 수 있다고 가정하지 않는다. 오류 사례를 추가할 때는 학습·검증 묶음의 사례만 사용한다. 최종 평가 오류를 보고 자료나 설정을 고치면 새 최종 평가 자료가 필요하다.

다음 구조를 사용한다. `source/split/class` 순서이며 파일명은 `촬영묶음__개별이름.png`로 만든다.

```text
data/crops/
  officehome/train/calculator/product01__001.png
  officehome/train/scissors/product02__001.png
  officehome/train/mouse/product03__001.png
  officehome/train/other/book01__001.png
  local/train/calculator/sessionA__calc01.png
  local/val/calculator/sessionB__calc01.png
  local/val/scissors/sessionB__scissors01.png
  local/val/mouse/sessionB__mouse01.png
  local/val/other/sessionB__background01.png
  local/test/calculator/sessionC__calc01.png
  ...
```

같은 `source` 안에서 파일명의 `__` 앞부분이 같으면 같은 그룹이다. 따라서 `sessionA` 사진을 train과 val 양쪽에 넣으면 오류로 중단한다. 학습용 전체와 검증용 전체에 네 클래스가 각각 모두 있어야 한다. 예시는 폴더 구조 설명용이며, 실제 사진 수를 뜻하지 않는다.

최종 반납 장면에서 정답 물품 영역을 따로 잘라 분류기만 평가할 수도 있다. 이 결과와 자동 마스크를 사용하는 장면 전체 결과를 구분한다. 한 장면에서 나온 여러 crop은 독립적인 여러 장면으로 세지 않는다.

```bash
.venv/bin/python make_manifest.py --root data/crops --output manifest.csv
```

생성된 CSV를 사람이 확인한다. `manifest.example.csv`는 열과 클래스 이름을 보여 주는 양식이며, 그 이름의 실제 사진 파일은 제공하지 않는다.

## 5 특징을 한 번 추출

```bash
.venv/bin/python train_head.py extract --manifest manifest.csv --output runs/features.npz --device auto
```

모든 이미지에 같은 전처리를 사용한다.

1. EXIF 방향을 바로잡고 RGB로 읽는다.
2. 물품 전체가 잘리지 않도록 종횡비를 유지하고 회색 여백을 넣어 224 × 224로 만든다.
3. ImageNet 평균·표준편차로 정규화한다.
4. 고정 DINOv2 ViT-S/14에 넣어 384차원 특징을 저장한다.

원래 이미지가 N장이면 특징 배열은 N × 384다. SAM2와 DINOv2는 `eval`과 추론 모드로 실행하고 가중치를 갱신하지 않는다. 모델의 입력 전처리와 가중치 SHA-256도 저장하므로 학습과 추론에서 다른 가중치를 쓰면 중단한다.

주의: 학습 파일이 원본 배경 포함 사진인데 실제 추론 입력만 회색 배경 마스크 이미지라면 분포가 달라질 수 있다. 먼저 같은 방식의 crop을 준비한다. 배경 제거 효과를 비교할 때는 마스크 버전과 사각형 crop 버전을 같은 자료 분할로 각각 만들고 분류기를 각각 학습한다.

## 6 작은 분류기 학습

```bash
.venv/bin/python train_head.py fit --features runs/features.npz --outdir runs/model
```

직접 촬영 검증 자료에 네 클래스가 모두 있다면, 공개 사진보다 실제 촬영 환경을 기준으로 설정을 선택하도록 다음 옵션을 쓸 수 있다.

```bash
.venv/bin/python train_head.py fit --features runs/features.npz --outdir runs/model_local --selection-source local
```

학습 설정은 다음과 같다.

- 입력: 384차원 특징, 이미지마다 L2 정규화
- 출력: 계산기·가위·마우스·기타 4종
- 분류기: scikit-learn LogisticRegression, `lbfgs`, 최대 2000회 반복
- 정규화 강도 후보: `C = 0.1, 1, 10, 100`
- 클래스 가중치: `balanced`
- 선택 기준: 검증용 Macro F1, 동점이면 더 작은 C
- 선택 후 검증 자료를 섞어 재학습하지 않음
- 최종 test 자료는 설정 선택에 사용하지 않음

이 방식은 Adam으로 큰 모델을 여러 epoch 학습하는 방식과 다르다. 작은 분류기의 계수와 절편만 최적화한다. 입력 384개, 클래스 4개이면 저장되는 계수·절편은 총 1540개다. 이것만으로 적은 자료에서 충분한 성능이 보장되는 것은 아니다.

결과는 `head.joblib`, `selection.json`이다. `selection.json`에서 각 C의 검증 점수와 자료 수를 확인한다. 검증 자료가 적으면 C 선택도 불안정할 수 있으므로 촬영 조건별 오류를 함께 본다.

## 7 잘린 물품 이미지의 성능 확인

```bash
.venv/bin/python train_head.py evaluate --features runs/features.npz --model runs/model/head.joblib --split test --outdir runs/crop_test
```

- `crop_metrics.json`: 전체 정확도, 클래스별 Precision·Recall·F1·support, 출처별 수치
- `crop_predictions.csv`: 사진마다 정답, 예측, 네 클래스 점수
- `confusion_matrix.png`: 행은 실제 종류, 열은 예측 종류

Accuracy는 맞힌 사진 수 / 전체 사진 수다. Precision은 해당 종류라고 예측한 것 중 실제로 맞은 비율이고, Recall은 실제 해당 종류 중 맞힌 비율이다. F1은 Precision과 Recall의 조화평균이다. Macro F1은 종류마다 F1을 계산해 같은 가중치로 평균한다.

예를 들어 마우스 Recall이 낮으면 실제 마우스를 다른 종류로 놓치는 문제가 있다. 마우스 Precision이 낮으면 다른 후보를 마우스로 잘못 세는 문제가 있어 누락을 반납 완료로 오판할 수 있다. 공개 사진과 직접 촬영 사진을 합친 평균만 보지 말고 `by_source`도 확인한다. 정답 샘플이 없는 클래스의 0점은 미검증과 실제 실패를 구분해 해석해야 한다.

이 수치는 올바르게 잘라 넣은 이미지의 종류 분류 성능이다. 자동 마스크가 물품을 못 찾는 오류는 여기 포함되지 않는다.

## 8 자동 반납 확인 연결

```bash
.venv/bin/python infer_scene.py --image data/scenes/scene01.jpg --classifier runs/model/head.joblib --outdir runs/scene01 --scene-id scene01 --predictions-csv runs/scenes_predictions.csv
```

입력 → SAM2 자동 마스크 → 면적·중복 후보 정리 → 마스크 밖 회색 처리 → DINOv2 특징 → 작은 분류기 → 품목별 개수 → 등록 목록 비교 순서로 처리한다. 예상 수량은 `inference_config.json`의 `expected`에서 지정한다.

`class_score_min=0.7`, `class_margin_min=0.15` 등은 시험을 시작하기 위한 임시 설정이다. 0.7이라는 수치가 정답 확률 70%를 보장하지 않는다. 검증 장면에서 확인 요청 비율과 누락 오판을 함께 확인한 뒤 정하고, 최종 평가 전에 고정한다. 면적·중복 제거도 임시 규칙이며, 작은 물품이나 겹친 물품을 지울 수 있어 검증이 필요하다.

- `complete`: 받아들인 후보들의 수량이 등록 목록과 일치하고 확인 사유가 없음
- `missing`: 확인 사유 없이 목록보다 부족함. 화면에는 누락 의심으로 표시하는 것이 적절함
- `review`: 낮은 점수·점수 차이, 중복 개수, 후보 수 제한, 분류기 부재 등 확인 필요

모든 물품을 찾았다는 보증은 없다. `other`가 미지의 물체를 항상 거부하지도 않는다. 자동 예측 결과를 저장한 뒤 사용자가 수정한 결과는 별도 기록으로 관리한다. 이 패키지는 CLI 실험 코드이며 웹 UI·SQLite 기록 기능은 아직 포함하지 않는다.

## 9 장면 전체 성능 계산

각 장면의 실제 수량과 대여 목록을 `scenes_truth.csv`에 적는다. `scenes_truth.example.csv` 형식을 따른다. 실제 시스템의 예측은 앞 단계의 `--predictions-csv`로 기록한다.

```bash
.venv/bin/python scene_metrics.py --truth scenes_truth.csv --predictions runs/scenes_predictions.csv --output runs/scene_metrics.json
```

| 지표 | 계산과 해석 |
|---|---|
| 누락인데 완료로 판정한 비율 | 실제 누락 장면 중 `complete`로 출력한 장면 / 실제 누락 장면 |
| 명시적인 누락 탐지율 | 실제 누락 장면 중 `missing` 출력 / 실제 누락 장면 |
| 확인 요청 비율 | `review` 장면 / 전체 장면 |
| 전체 수량 일치율 | 세 품목의 실제 개수를 모두 맞힌 장면 / 전체 장면 |
| 엄격한 자동 성공률 | 수량과 완료·누락 상태가 모두 맞은 장면 / 전체 장면. review와 error는 실패로 계산 |
| 자동 결정 비율 | complete 또는 missing을 낸 장면 / 전체 장면 |
| 수량 MAE | 품목별 절대 수량 오차의 평균 |
| 처리 시간 | 장면별 추론 시간의 중앙값·95백분위·최대값 |

정답과 예측의 장면 목록이 다르면 중단한다. 실행에 실패한 장면을 목록에서 빼면 안 된다. 실패한 장면은 같은 scene_id에 `status=error`, 수량 0, 실제로 소요된 시간으로 추가한다. error는 엄격한 자동 성공률에 성공으로 포함되지 않는다. `review`나 `error`가 행동을 유도한 비율은 누락을 직접 맞힌 비율과 별도로 기록한다.

Wilson 95% 구간도 계산하지만 서로 비슷한 연속 사진을 독립 표본으로 보면 불확실성을 과소평가한다. 12장 반납 장면은 기능 시연에 가까운 초기 실험이다. 한 장의 오류가 전체 비율을 약 8.3%p 바꾼다. 실제 누락 장면이 9장이면 한 번의 완료 오판이 11.1%다. 분자·분모를 함께 보고한다.

이 평가 스크립트는 개수와 상태를 평가한다. 마스크 IoU나 물체별 검출 AP를 계산하지 않는다. 분할 성능을 수치로 주장하려면 사람이 만든 정답 마스크가 별도로 필요하다. SAM2의 `predicted_iou`는 모델 내부의 품질 추정치이며, 정답 마스크와 비교한 실제 IoU가 아니다.

시간에는 마스크 생성, crop, 특징 추출, 분류·집계가 포함된다. 모델 로딩과 이미지 읽기, 출력 파일 저장은 제외하고 `model_load_ms`를 따로 기록한다. 사용자 클릭·수정·저장까지 포함한 업무 시간은 별도 측정한다. 첫 실행과 이후 실행은 구분하고 여러 장면에서 반복 측정한다.

## 10 참고 원문

- SAM2 설치와 선택적 CUDA 확장: https://github.com/facebookresearch/sam2/blob/main/INSTALL.md
- SAM2 자동 마스크 코드: https://github.com/facebookresearch/sam2/blob/main/sam2/automatic_mask_generator.py
- DINOv2 사전학습 특징: https://github.com/facebookresearch/dinov2
- 로지스틱 회귀: https://scikit-learn.org/1.7/modules/generated/sklearn.linear_model.LogisticRegression.html
- 분류 보고서: https://scikit-learn.org/1.7/modules/generated/sklearn.metrics.classification_report.html
- 혼동행렬: https://scikit-learn.org/1.7/modules/generated/sklearn.metrics.confusion_matrix.html
- PyTorch 버전 조합: https://pytorch.org/get-started/previous-versions/

원본 모델 코드·가중치와 데이터셋의 이용 조건은 각각 확인해야 한다. 설치 스크립트는 모델 코드와 가중치를 공식 주소에서 가져오며 데이터셋을 재배포하지 않는다.
