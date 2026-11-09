# 협업과 Git 사용 규칙

처음 개발하는 팀원도 이 문서의 순서대로 작업하면 된다. 한 사람이 하나의 이슈를 맡고, 별도 브랜치에서 작업한 뒤 PR로 합친다.

## 먼저 지켜야 할 프로젝트 약속

- 데이터 구조, Supabase 테이블, API 주소·요청·응답·상태값은 저장소 소유자에게 먼저 검토받는다.
- 검토 전 프론트는 화면과 임시 데이터로 작업한다. 임시 데이터 모양을 서버의 최종 명세로 간주하지 않는다.
- 실제 연결 승인은 해당 이슈에 소유자가 남긴 승인 기록으로 확인한다. 답이 없으면 승인된 것이 아니다.
- API 오류를 가짜 성공 데이터로 바꾸지 않는다. 샘플 결과에는 항상 “샘플 결과 · 실제 AI 분석 아님”을 표시한다.
- 비밀번호, 개인 토큰, `.env.local`, DB 비밀번호, Supabase secret/service_role 키를 커밋하거나 이슈에 붙이지 않는다.
- Supabase 공개용 publishable 키를 쓰더라도 실제 데이터 접근 규칙은 서버 담당자가 검토한다. 프론트에서 임의로 공개 권한을 열지 않는다.
- 다른 팀원의 파일·설정을 대규모로 바꾸거나 강제 push하지 않는다.

## 1 준비

Git, GitHub 계정, Node.js 22 LTS, VS Code를 준비한다. 저장소 접근 권한을 받은 뒤 작업한다. 처음 clone은 한 번만 한다.

```bash
git clone https://github.com/mackerel07/opensourcebasic.git
cd opensourcebasic
git status
```

이 저장소의 프론트 폴더 이름은 `frontend/`로 사용할 계획이다. 프론트 초기 세팅 이슈가 끝나기 전에는 `package.json`이나 실행 명령이 아직 없을 수 있다. 초기 세팅 완료 후에는 다음 순서로 실행한다.

```bash
cd frontend
npm ci
npm run dev
```

다음 작업을 시작할 때는 저장소 최상위 폴더로 돌아온 뒤 아래 절차를 따른다.

## 2 이슈를 먼저 고른다

1. 이슈에 선행 작업이 있는지 확인한다.
2. 이슈에 “제가 진행하겠습니다”라고 남겨 중복 작업을 피한다.
3. 모르는 요구사항은 이슈 댓글에 질문한다.
4. 한 이슈의 범위만 작업한다. 새 기능이 필요하면 따로 이슈로 나눈다.

담당자는 현재 정해져 있지 않다. 팀에서 결정한 뒤 Assign을 사용한다.

## 3 브랜치 규칙

형식은 `종류/이슈번호-짧은-영문설명`이다. 소문자 영문과 하이픈을 사용한다.

| 종류 | 용도 | 예시 |
|---|---|---|
| feat | 새 화면이나 기능 | feat/14-item-list |
| fix | 버그 수정 | fix/15-photo-preview |
| docs | 문서 | docs/14-local-setup |
| chore | 도구·설정 정리 | chore/14-front-setup |

예시 번호는 설명용이다. 실제 맡은 이슈 번호로 바꾼다.

저장소 최상위에서 다음을 실행한다. 먼저 `git status`를 보고 다른 작업이 남아 있으면 커밋 또는 팀원과 확인한 뒤 진행한다.

```bash
git switch main
git pull --ff-only origin main
git switch -c feat/14-item-list
```

`main`에는 직접 작업하지 않는다. 처음 비어 있던 저장소에 협업 문서를 만드는 초기 커밋만 예외이며, 기능 개발은 PR을 사용한다.

## 4 커밋 규칙

형식은 `종류(영역): 변경 내용 (#이슈번호)`다. 설명은 자연스러운 한국어로 작성한다.

```text
feat(frontend): 물품 목록 화면 추가 (#14)
fix(frontend): 사진 변경 시 미리보기 초기화 (#15)
docs(team): 로컬 실행 방법 정리 (#14)
test(frontend): 수량 입력 검증 추가 (#14)
chore(frontend): 개발 환경 설정 (#14)
```

- feat: 기능 추가
- fix: 버그 수정
- docs: 문서 변경
- style: 기능 변화 없는 코드 포맷 정리
- refactor: 동작을 유지하는 구조 개선
- test: 테스트 추가·수정
- chore: 패키지·설정·기타 관리

작고 설명 가능한 변경 단위로 커밋한다. “수정”, “완료”, “asdf”처럼 무엇을 했는지 알 수 없는 메시지는 피한다.

## 5 변경 확인과 push

예시는 물품 목록을 작업한 경우다. 변경 파일 경로는 실제 작업한 파일로 바꾼다.

```bash
git status
git diff
git add frontend/src/features/items
git diff --cached
git commit -m "feat(frontend): 물품 목록 화면 추가 (#14)"
git push -u origin feat/14-item-list
```

익숙하지 않을 때는 `git add .` 대신 필요한 파일만 지정해 추가한다. `git diff --cached`로 비밀값이나 다른 팀원의 변경이 섞이지 않았는지 확인한다.

커밋 대상은 소스, 문서, `package.json`, `package-lock.json`, 비밀값이 없는 `.env.example`이다. `node_modules/`, `.next/`, `.env.local`, 가상환경, 모델 가중치, 개인 촬영 사진은 제외한다.

## 6 PR 규칙

GitHub의 Compare & pull request에서 대상 브랜치를 `main`으로 선택한다. 진행 중이면 Draft PR로 올려도 된다.

- 제목: 커밋과 같은 형식. 예: `feat(frontend): 물품 목록 화면 추가 (#14)`
- 무엇을 바꿨는지와 이슈의 기본 동작을 어떻게 확인했는지 적는다. 필요하면 스크린샷을 첨부한다.
- 이슈 전체가 끝났으면 `Closes #14`, 일부만 작업했다면 `Refs #14`를 사용한다.
- 기능 PR은 다른 팀원 한 명이 변경과 기본 동작을 확인한 뒤 팀에서 정한 담당자가 Squash and merge한다.

`npm ci`는 커밋된 lockfile에 맞춰 설치한다. 패키지 추가가 필요할 때만 `npm install 패키지명`을 사용하고 package.json과 lockfile을 함께 커밋한다. npm 외의 lockfile을 혼용하지 않는다.

## 7 충돌이나 오류가 나면

- 충돌 화면을 이해하지 못하면 합치기를 멈추고 PR에 상황을 공유한다.
- 해결하려고 `git reset --hard`, `git clean -fd`, `git push --force`부터 실행하지 않는다.
- `git pull --ff-only`가 중단되면 현재 브랜치와 작업 내용을 먼저 확인한다.
- 민감한 값이 이미 올라갔다면 댓글에 다시 붙이지 말고 소유자에게 알려 키 교체와 기록 정리를 진행한다.

## 8 병합 이후

저장소 최상위에서 최신 main을 받는다. 작업 브랜치 삭제는 PR이 병합된 것을 확인한 뒤 한다.

```bash
git switch main
git pull --ff-only origin main
git branch -d feat/14-item-list
```

이 규칙은 협업 절차다. GitHub의 브랜치 보호나 자동 배포 설정을 변경했다는 뜻은 아니다.
