# 메모

PC와 Android 휴대폰에서 같은 메모를 보고 쓰는 개인용 메모 웹페이지입니다.

- 달력 / 리스트 보기 (날짜별로 메모 제목 표시)
- 제목 + 본문, 제목·본문 검색
- 저장: Supabase (무료) · 배포: GitHub Pages
- 백업: 메모가 바뀔 때마다 `giho_memo_backup.txt`로 자동 백업, 수동 백업 버튼
- 로그인 대신 **비밀 키**: 기기마다 처음 한 번만 입력하면 그 브라우저에 저장됩니다

## 파일 구성

| 파일 | 역할 |
|---|---|
| `index.html`, `style.css`, `app.js` | 웹페이지 |
| `config.js` | Supabase 주소와 공개 키 (직접 채움) |
| `supabase.sql` | DB 테이블, 함수, 비밀 키 설정 |
| `manifest.json`, `icon.svg` | 휴대폰 홈 화면에 추가할 때 쓰는 앱 정보와 아이콘 |

## 미리 보기 (설정 없이)

`index.html`을 더블클릭해서 열면 **로컬 모드**로 동작합니다. 이 모드에서는 동기화 없이 그 브라우저에만 저장돼요.

---

## 1. Supabase 설정

1. <https://supabase.com>에 가입한 뒤 **New project**를 만듭니다. Region은 `Northeast Asia (Seoul)`을 추천합니다.
2. 왼쪽 메뉴에서 **SQL Editor** → **New query**를 엽니다.
3. `supabase.sql` 내용을 전부 붙여넣습니다.
4. 맨 아래 `new_key text := 'CHANGE-ME';`의 `CHANGE-ME`를 **나만의 비밀 키**로 바꿉니다.
   - 16자 이상으로 정하고, 추측하기 어려운 문장을 추천합니다. 예: `파란우산-37-월요일-라면`
   - 바꾼 키는 SQL Editor에서만 입력하세요. `supabase.sql` 파일에는 저장하지 마세요. 이 파일은 GitHub에 공개됩니다.
5. **Run**을 누릅니다. `Success`가 나오면 완료입니다.
6. **Project Settings → API** (또는 **API Keys**) 화면에서 두 값을 복사해 `config.js`에 넣습니다.
   - `Project URL` → `SUPABASE_URL`
   - `anon public` 키 또는 `publishable` 키 → `SUPABASE_ANON_KEY`
   - `service_role` / `secret` 키는 **절대 넣지 마세요.**

> 비밀 키를 바꾸고 싶으면 4~5번만 다시 하면 됩니다. 그러면 모든 기기에서 새 키를 다시 입력하라는 화면이 나옵니다.

## 2. GitHub Pages로 배포

1. GitHub에서 새 저장소를 만듭니다. 예: `memo`
2. 이 폴더의 파일을 올립니다.
   ```bash
   git init
   git add .
   git commit -m "메모 앱"
   git branch -M main
   git remote add origin https://github.com/<아이디>/memo.git
   git push -u origin main
   ```
3. 저장소의 **Settings → Pages**에서 Source를 `Deploy from a branch`, Branch를 `main` / `/ (root)`로 선택하고 **Save**를 누릅니다.
4. 1~2분 뒤 `https://<아이디>.github.io/memo/`로 접속할 수 있습니다.

> GitHub Pages를 무료로 쓰려면 저장소가 **Public**이어야 합니다. 그래도 공개되는 것은 코드뿐이고, 메모는 비밀 키가 없으면 볼 수 없습니다.

## 3. 사용하기

- **PC**: 위 주소로 접속한 뒤 비밀 키를 한 번 입력합니다.
- **Android**: Chrome으로 접속해 비밀 키를 입력한 뒤, 메뉴(⋮)에서 **홈 화면에 추가**를 누르면 앱처럼 쓸 수 있습니다.
- 다른 사람과 같이 쓰는 PC라면 다 쓴 뒤 오른쪽 위 **잠금**을 눌러 그 기기에 저장된 키를 지우세요.
- 단축키(PC): `/`는 검색, `Ctrl+S`는 저장, `Esc`는 닫기입니다.
- 다른 기기에서 고친 내용은 앱 화면으로 돌아오면 자동으로 다시 불러옵니다.

## 4. 백업 (giho_memo_backup.txt)

GitHub나 Supabase에 문제가 생겨도 메모를 잃지 않도록, 모든 메모를 텍스트 파일 `giho_memo_backup.txt` 하나로 저장합니다.

- **자동 백업**: 메모를 추가·수정·삭제할 때마다 실행됩니다. 기기마다 오른쪽 위 **백업** 메뉴에서 끌 수 있어요.
- **수동 백업**: **백업** 메뉴에서 **지금 백업**을 누릅니다.

| 기기 | 저장 위치 | 동작 |
|---|---|---|
| PC (Chrome / Edge) | 처음 한 번 고른 폴더 (기본으로 다운로드 폴더가 열림) | 같은 파일을 계속 **덮어씀** |
| Android (Chrome 등) | **다운로드** 폴더 (내 파일 → 다운로드) | 바뀔 때마다 새로 내려받음. 같은 이름이 있으면 `giho_memo_backup (1).txt`처럼 번호가 붙을 수 있음 |

- PC에서는 처음 메모를 저장할 때 백업 파일 위치를 묻습니다. 브라우저가 파일 수정 권한을 물으면 **방문할 때마다 허용**을 고르세요. 그래야 다음부터 묻지 않아요.
- PC에서는 앱을 열 때 다른 기기에서 바뀐 내용이 있으면 백업 파일도 자동으로 갱신됩니다.
- 브라우저 보안 정책 때문에, 웹페이지는 사용자 확인 없이 원하는 폴더에 파일을 덮어쓸 수 없습니다. 그래서 Android에서는 다운로드 방식을 씁니다.

## 참고

- Supabase 무료 프로젝트는 **일주일 동안 사용이 없으면 일시 정지**됩니다. 정지되면 대시보드에서 Restore를 누르면 다시 쓸 수 있고, 데이터는 그대로 남아 있습니다.
