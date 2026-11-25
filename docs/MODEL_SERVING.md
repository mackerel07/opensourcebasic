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

기존 labels/groups SQL을 적용한 프로젝트에서 `supabase/migrations/20261117083955_shared_inventory_without_login.sql`을 추가로 실행한다. 소유자 계정의 SQL Editor에서 전체를 한 번 실행한다.

- shared_item_groups와 shared_item_group_items는 모든 방문자가 로그인 없이 조회·등록·수정하는 공개 목록이다. 삭제 권한은 주지 않는다.
- 기본 그룹에 계산기·가위·마우스를 각각 1개로 준비한다.
- 기존 개인별 item_groups / item_group_items와 계정 정보는 그대로 비공개로 유지한다. 기존 개인 그룹은 공개하거나 옮기지 않는다.
- RLS를 유지하고 anon / authenticated에 공유 테이블의 조회·등록·수정만 허용한다. 로그인 기능이나 익명 가입 설정은 필요 없다.
- 사진 분석 API는 공유 DB에 등록된 품목인지 확인하고 반납 예정 수량은 별도로 검증한다. 비밀 모델 키는 Vercel 서버에서만 사용한다.
- 현재 연결 계정에는 이 프로젝트의 SQL 실행 권한이 없어, 소유자가 적용해야 한다. 코드 작성·배포가 SQL 적용을 의미하지 않는다.

## Vercel 환경변수

| 이름 | 값 |
| --- | --- |
| MODEL_SERVER_URL | ngrok HTTPS 주소. 마지막 / 제외 |
| MODEL_SERVER_API_KEY | 모델 서버와 동일한 비밀키 |
| NEXT_PUBLIC_SUPABASE_URL | Supabase 프로젝트 URL |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | 해당 프로젝트의 publishable key |

Preview와 Production에 필요한 값을 각각 넣고 재배포한다. MODEL_SERVER_API_KEY는 서버 코드에서만 읽는다. 브라우저는 Vercel의 서버 경로를 통해 호출한다. 기존 환경변수 값은 그대로 사용한다.

## 프론트 실제 연결

로그인·회원가입 없이 공유 그룹을 선택해 물품 수량을 수정한다. 변경은 DB에 저장되어 다른 사용자도 다시 조회하면 같은 값을 본다. 새로고침하거나 그룹을 선택하면 최신 목록을 읽는다. 실시간 구독은 사용하지 않는다.

반납 사진은 최대 1600px JPEG로 줄여 POST /api/analyze로 보낸다. API가 공유 그룹의 등록 품목과 반납 예정 수량을 확인한 뒤 비밀 키를 붙여 모델 /predict를 호출한다. 모델의 실제 counts와 위치를 표시하고 review는 직접 확인을 안내한다.

## 최종 확인과 재고 증가

프로젝트 소유자가 `supabase/migrations/20261125060936_confirm_shared_return.sql`을 SQL Editor에서 한 번 실행해야 한다. 기존 재고는 초기화하지 않는다. 이 SQL 적용 전에는 새 프론트를 운영에 배포하지 않는다.

- 최종 확인에서 모델 예상값 대신 사용자가 확인한 수량을 `confirm_shared_return`으로 보낸다. 성공한 뒤에만 완료 화면으로 이동하고 최신 공유 재고를 표시한다.
- DB가 현재 재고에 더하므로 다른 사용자의 반납으로 늘어난 수량을 덮어쓰지 않는다. 여러 품목 중 하나라도 실패하면 재고 증가와 반납 기록을 모두 롤백한다.
- 같은 요청 UUID는 한 번만 반영한다. 같은 ID로 수량을 바꾼 요청은 거절한다. UI는 중복 클릭을 막고 응답이 불분명할 때 같은 ID·수량으로 재시도한다. 새 반납을 시작하면 새 ID를 만든다.
- 확인 수량은 품목별 0~999 정수다. 실제 재고는 0~999를 허용한다. 재고 0개인 등록 품목도 반납할 수 있으며, 반납 예정 수량을 현재 재고로 제한하지 않는다. 합산 후 999개를 넘으면 전체 요청을 거절한다.
- `shared_inventory_returns`에는 요청 ID·그룹·확인 수량·시간을 남긴다. 공개 그룹 정책에 맞춰 로그인 없이 호출하며, `SECURITY INVOKER`로 기존 RLS와 테이블 권한을 유지한다. 개인 정보와 사진은 저장하지 않는다.

로컬 확인은 PGlite 0.6.0의 임시 DB에서 정상 증가, 재고 0개, 동일 요청 재전송, 다른 내용의 재전송 거절, 다중 품목 실패 시 전체 롤백, 잘못된 수량, 기록 수정·삭제 차단을 검사했다. 실제 Supabase 실행과 브라우저 저장은 소유자의 SQL 적용 후 확인한다.

```bash
npm install --prefix /tmp/return-sql-check --save-exact @electric-sql/pglite@0.6.0
NODE_PATH=/tmp/return-sql-check/node_modules node supabase/tests/confirm_shared_return.cjs
```
