# frontend

공용 물품 반납 확인 웹의 화면입니다. Next.js(App Router)와 TypeScript로 만들었습니다.

## 실행 방법

Node.js 22 LTS가 필요합니다. 저장소 최상위 폴더에서 실행합니다.

```bash
cd frontend
npm ci
npm run dev
```

브라우저에서 http://localhost:3000 을 엽니다.

같은 Wi-Fi의 휴대폰에서 보려면 `npm run dev -- -H 0.0.0.0`으로 실행한 뒤, 휴대폰 브라우저에서 `http://컴퓨터IP:3000`을 엽니다.

## 그 밖의 명령

| 명령 | 하는 일 |
| --- | --- |
| `npm run lint` | 코드 규칙 검사 |
| `npm run build` | 배포용 빌드가 되는지 확인 |

## 화면

| 주소 | 화면 |
| --- | --- |
| `/` | 시작 화면. 물품 관리와 반납 확인으로 이동 |
| `/items` | 물품 이름·수량 목록, 등록·수정 |
| `/return` | 반납할 물품·수량 선택 → 사진 촬영·선택과 미리보기 → 모델 분석 결과 수정 → 최종 확인 |

## 실제 모델 연결

- 반납 사진은 브라우저에서 축소한 뒤 /api/analyze → ngrok 모델 서버로 전송합니다.
- 모델 서버 주소와 키는 MODEL_SERVER_URL, MODEL_SERVER_API_KEY 서버 환경변수로 읽습니다.
- 계산기·가위·마우스를 지원합니다. review 결과에서는 사진을 보고 수량을 직접 확인합니다.
- 로그인 없이 모든 방문자가 같은 Supabase 공유 그룹·수량을 조회·수정합니다. 개인별 계정 데이터는 공개하지 않습니다.
- 추가 SQL `supabase/migrations/20261117083955_shared_inventory_without_login.sql`을 프로젝트 소유자가 한 번 실행해야 합니다. 기존 Vercel 환경변수는 그대로 사용합니다.
- 분석 API는 공유 그룹의 등록 품목·수량을 조회·검증합니다. 모델 키는 서버에서만 사용합니다.

## 폴더 구조

```text
src/
  app/                 화면(주소별 페이지)
    page.tsx           시작 화면
    items/page.tsx     물품 관리
    return/page.tsx    반납 확인
  features/items/      물품 관리 기능(임시 데이터, 목록·입력 폼)
  features/return/     반납 확인 기능(단계 진행, 사진 미리보기, 샘플 결과)
```
