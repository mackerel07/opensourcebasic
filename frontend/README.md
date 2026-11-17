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
| `/return` | 반납할 물품·수량 선택 → 사진 촬영·선택과 미리보기 → 샘플 분석 결과 수정 → 최종 확인 |

## 실제 모델 연결

- 반납 사진은 브라우저에서 축소한 뒤 /api/analyze → ngrok 모델 서버로 전송합니다.
- 모델 서버 주소와 키는 MODEL_SERVER_URL, MODEL_SERVER_API_KEY 서버 환경변수로 읽습니다.
- 계산기·가위·마우스를 지원합니다. review 결과에서는 사진을 보고 수량을 직접 확인합니다.
- 물품 목록은 로그인한 사용자의 Supabase 그룹에 저장됩니다. 로그인 → 그룹 만들기 → 기본 세 품목 저장으로 시작합니다.
- 회원가입 후 이메일 인증이 필요합니다. 사진 분석 API는 사용자 JWT와 그룹별 등록 수량을 확인합니다.

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
