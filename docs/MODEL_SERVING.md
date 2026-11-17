# 모델 서버와 DB 연결

## 모델 서버

`model/`에서 실행한다. 기존 모델 설치와 학습된 head.joblib이 필요하다.

```bash
.venv/bin/python -m pip install -r requirements-server.txt
cp .env.server.example .env.server.local
# .env.server.local에 API 키와 runtime.local.json, head.joblib의 절대 경로 입력
bash serve.sh
```

다른 터미널에서 `ngrok http http://127.0.0.1:8000`을 실행한다. 표시된 HTTPS 주소를 Vercel의 MODEL_SERVER_URL에 넣는다. 서버와 ngrok을 실행한 컴퓨터가 켜져 있어야 한다.

- `GET /health`는 상태를 반환한다.
- `POST /predict`에 `X-Model-API-Key` 헤더와 multipart 필드 `file`, `expected`를 보낸다.
- `expected` 예시는 `{"calculator":1,"scissors":1,"mouse":1}`이다. 각 수량은 0~999 정수다.
- 응답에는 `status`, `counts`, `expected`, `candidates`, `processing_size_hw`, `overlay_data_url`이 있다. 상자 좌표는 processing_size_hw 기준이다.
- 이미지는 4 MiB·2500만 화소까지 받는다. 추론은 한 번에 하나씩, 최대 120초다. 처리 중 추가 요청은 503으로 응답한다.
- 현재 초기 분류기는 review를 많이 반환한다. 프론트에서 review를 사용자 확인 단계로 연결한다.

## Supabase 마이그레이션

`supabase/migrations/*_return_inventory_labels_groups.sql`을 사용할 프로젝트에서 적용한다.

- inventory_labels에 모델 클래스 코드 4개와 한글 이름을 저장한다.
- item_groups는 로그인한 사용자별 물품 그룹이다.
- item_group_items에는 그룹의 등록 품목과 예상 수량을 저장한다. other은 반납 예정 품목에서 제외한다.
- RLS로 그룹과 그룹 품목을 소유자에게만 허용한다. DB 그룹 접근에는 기존 사용자 세션이 필요하다. 비회원 목록은 브라우저에 별도로 저장한다.
- 조회한 그룹 품목을 expected로 변환한다. 빠진 세 품목의 수량은 0으로 채운다.
- 모델 연결 주소와 API 키는 Vercel 환경변수로 관리한다.

Supabase 프로젝트 sxawnuwifpzvwfjrhaiv에 소유자가 SQL을 적용했다. publishable key로 라벨 4개 조회를 확인했다.

## Vercel 환경변수

| 이름 | 값 |
| --- | --- |
| MODEL_SERVER_URL | ngrok HTTPS 주소. 마지막 / 제외 |
| MODEL_SERVER_API_KEY | 모델 서버와 동일한 비밀키 |
| NEXT_PUBLIC_SUPABASE_URL | Supabase 프로젝트 URL |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | 해당 프로젝트의 publishable key |

Preview와 Production에 필요한 값을 각각 넣고 재배포한다. MODEL_SERVER_API_KEY는 서버 코드에서만 읽는다. 브라우저는 Vercel의 서버 경로를 통해 호출한다. DB 그룹을 지정한 사진 분석 요청은 Supabase 사용자 JWT를 검증한다. 비회원은 브라우저의 품목·수량으로 분석을 요청한다. 비밀 모델 키는 서버에서만 사용한다.

`frontend/.env.example`은 공유용 양식이다. 이 컴퓨터의 `frontend/.env.vercel.local`에는 실제 터널 주소와 모델 API 키가 들어 있다. Supabase 값은 프로젝트 확인 후 채운다. 개인 설정 파일은 Git에서 제외된다.

로그인·회원가입 UI를 제거했다. 처음 접속하면 기본 그룹과 계산기·가위·마우스를 각각 1개로 준비한다. 비회원 그룹·수량은 이 브라우저의 localStorage에 저장된다. 사이트 데이터 삭제 시 사라지며 다른 기기와 공유되지 않는다.

## 프론트 실제 연결

반납 화면은 사진을 최대 1600px JPEG로 줄여 같은 사이트의 POST /api/analyze로 보낸다. Vercel이 비밀 API 키를 붙여 모델의 /predict를 호출한다. 계산기·가위·마우스의 한글 이름과 클래스 코드를 매핑하며 모델의 실제 counts와 위치를 화면에 표시한다. review는 사용자 확인 안내로 표시한다.

기존 로그인 세션이 남아 있으면 item_groups와 item_group_items의 DB 목록을 유지한다. 세션이 없으면 비회원 브라우저 목록을 사용한다. 새 그룹 생성과 물품 수량 수정이 가능하며, 그룹 전환 시 반납 화면을 초기화한다. DB 그룹을 지정한 요청은 사용자 JWT와 소유권·등록 수량을 확인한다. 비회원 요청도 종류 중복, 수량 1~999, 이미지 크기 제한을 적용한다. 추가 SQL이나 RLS 완화는 없다.

최종 반납 확인 수량은 현재 화면에 유지한다. 별도의 반납 이력 저장 테이블은 이번 마이그레이션 범위에 포함되지 않는다.
