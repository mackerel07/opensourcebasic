# 공용 물품 반납 확인 웹 프로젝트

물품을 관리하고, 휴대폰 사진으로 반납 상태 확인을 돕는 팀 프로젝트입니다. SAM2와 DINOv2를 활용하는 모델 실험과 웹 화면 개발을 연결할 계획입니다.

## 팀원이 먼저 볼 곳

1. [프론트 진행표와 작업 이슈](https://github.com/mackerel07/opensourcebasic/issues/1)
2. [Git 브랜치·커밋·PR 규칙](CONTRIBUTING.md)
3. [프론트 처음 시작하기](docs/FRONTEND_START.md)
4. [데이터·API 사전 검토 절차](docs/REVIEW_GATE.md)

## 현재 상태

이 저장소에는 먼저 협업 문서와 프론트 작업 계획을 정리합니다. 웹 앱 코드는 프론트 초기 세팅 이슈에서 `frontend/`에 만듭니다. 아직 이 문서만으로 `npm run dev`를 실행할 수는 없습니다.

계획은 Vercel에서 웹 화면을 제공하고 Supabase를 데이터·사진 관리에 활용하는 것입니다. **데이터 구조와 API, 접근 권한, AI 서빙 위치는 소유자 검토 후 확정합니다.** 프론트는 승인 전 임시 데이터로 화면을 구현합니다.

임시 결과는 실제 AI 분석 결과와 구분해 표시합니다. 현재 앱·DB·API·배포가 구현됐거나 모델 성능이 검증됐다는 뜻은 아닙니다.

## 바로 시작할 작업

처음 프론트를 맡았다면 [#2 초기 세팅](https://github.com/mackerel07/opensourcebasic/issues/2)부터 읽습니다.

| 순서 | 작업 | 시작 조건 |
|---|---|---|
| 1 | [#2 초기 세팅과 공통 화면](https://github.com/mackerel07/opensourcebasic/issues/2) | 바로 시작 가능 |
| 2 | [#3 물품 관리 화면](https://github.com/mackerel07/opensourcebasic/issues/3) | 초기 세팅 후 |
| 3 | [#4 사진 촬영·선택·미리보기](https://github.com/mackerel07/opensourcebasic/issues/4) | 초기 세팅 후 임시 목록으로 진행 |
| 4 | [#5 사진 위 결과와 사용자 확인](https://github.com/mackerel07/opensourcebasic/issues/5) | 사진 미리보기와 연결 |
| 5 | [#6 실제 연결과 Vercel Preview](https://github.com/mackerel07/opensourcebasic/issues/6) | 소유자 데이터·API 검토 승인 후 |
