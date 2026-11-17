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

## 임시 데이터

- 물품 데이터는 `src/features/items/itemStore.ts`의 샘플로 시작하고, 이 브라우저의 localStorage에만 저장됩니다. 서버로 보내지 않습니다.
- 물품 목록 아래 **샘플 데이터로 되돌리기**로 처음 상태로 돌아갈 수 있습니다.
- 반납 확인 결과는 `src/features/return/sampleAnalysis.ts`가 만든 **샘플**입니다. 화면에 “샘플 결과 · 실제 AI 분석 아님”이 표시되고, 사진은 서버로 보내지 않습니다. 누락 표시를 볼 수 있게 마지막 물품은 1개 적게 찾은 것으로 나옵니다.
- 사진 단계의 **화면 확인용: 분석 실패 상황 보기**를 켜면 실패 화면을 확인할 수 있습니다.
- 임시 데이터 모양은 화면 확인용이며 DB·API 명세가 아닙니다. 실제 연결은 [사전 검토](../docs/REVIEW_GATE.md) 승인 후 진행합니다.

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
