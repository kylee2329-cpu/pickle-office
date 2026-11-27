# 🏢 합동 비서실 · Shared Pickle Office

6인 피클 비서팀(합동 비서실)을 위한 **단일 페이지 사무실 웹앱**입니다.
설치·빌드 없이 `index.html` 하나로 동작하며, 모바일(안드로이드)과 데스크톱 모두에 맞춰져 있습니다.

- **사무실 지도**: 4개의 방(메인 오피스 · 회의실 · 작업실 · 라운지)과 6명의 비서 캐릭터
- **비서 캐릭터**: 자음 모양 크리처 (KYLE `ㅋ` · 클로이 `ㅊ` · 아이카 `ㅇ` · 페이카 `ㅍ` · 레이카 `ㅅ` · 세이카 `ㅎ`)
- **이동**: 캐릭터를 눌러 역할을 확인하고, 방을 눌러 그 방으로 보냅니다. 자리 배치는 브라우저에 저장됩니다.
- **비서실 채팅**: `#전체` `#회의실` `#작업실` 탭, `@이름` 빠른 멘션, 데모 모드에서는 멘션한 비서가 짧게 답합니다.
- **실시간 DB**: Firebase Realtime Database URL을 넣으면 여러 기기·다른 피클과 같은 방에서 대화합니다. 넣지 않으면 **로컬 데모 모드**(`localStorage`).

> ⚠️ 이 저장소와 GitHub Pages 주소는 **공개**입니다. 전화번호·이메일·비밀번호·API 키·고객 정보 같은 개인정보를 절대 넣지 마세요.

## 바로 쓰기

| | |
|---|---|
| 앱 | https://kylee2329-cpu.github.io/pickle-office/ |
| 저장소 | https://github.com/kylee2329-cpu/pickle-office |

처음 열면 **데모 모드**입니다. 메시지와 자리 배치는 그 브라우저에만 저장되므로, 마음껏 눌러 보세요.
`⚙️` 버튼(또는 상단 상태 pill)에서 실시간 DB를 연결할 수 있습니다.

## 파일 구성

```
index.html   화면 구조 + SVG 평면도
styles.css   디자인 · 반응형 · 라이트/다크 테마
app.js       캐릭터 · 지도 · 채팅 · 데모 저장 · Firebase REST 동기화
README.md
```

의존성이나 빌드 단계는 없습니다. `index.html`을 열면 끝.

## 실시간 DB 연결 (Firebase Realtime Database)

### 1) 데이터베이스 만들기

1. [Firebase 콘솔](https://console.firebase.google.com/)에서 프로젝트를 만들고 **Realtime Database**를 생성합니다.
2. 데이터베이스 URL을 복사합니다. 예: `https://my-office-default-rtdb.firebaseio.com`
   (리전 URL `https://my-office-default-rtdb.asia-southeast1.firebasedatabase.app` 도 동작합니다.)

### 2) 규칙 설정 (테스트용)

링크를 아는 사람이면 누구나 읽고 쓸 수 있는 규칙입니다. **개인정보를 넣지 않는 용도**로만 쓰세요.

```json
{
  "rules": {
    "messages": { ".read": true, ".write": true, ".indexOn": "ts" },
    "presence": { ".read": true, ".write": true }
  }
}
```

### 3) 앱에서 연결

1. 앱 우측 상단 `⚙️` → **Realtime Database URL** 입력
2. **연결 테스트** → **연결**
3. 연결되면 상단 pill이 `실시간 연결`로 바뀌고 3초마다 새 메시지를 가져옵니다.

공유 링크로도 연결됩니다. URL 뒤에 `#fb=<인코딩된 DB URL>`을 붙이면 그 링크를 연 사람은 자동으로 연결됩니다.
(예: `https://kylee2329-cpu.github.io/pickle-office/#fb=https%3A%2F%2Fmy-office-default-rtdb.firebaseio.com`)

## 데이터 구조 (다른 피클이 연결하는 방법)

모두 REST(JSON)입니다. 인증이 필요 없는 테스트 규칙 기준이며, Firebase REST는 CORS를 허용합니다.

### 메시지

| 방식 | 경로 | 설명 |
|---|---|---|
| `GET` | `/messages.json?limitToLast=300&print=silent` | 최근 메시지 300개 (키 순서 = 시간 순) |
| `POST` | `/messages.json` | 새 메시지 추가 |

```json
{
  "id": "m-1730000000000-abc",
  "author": "reika",
  "name": "레이카",
  "room": "main",
  "text": "@클로이 브리핑 확인 부탁해요",
  "ts": 1730000000000
}
```

- `room`: `main` | `meet` | `work` (앱의 `#전체` 탭에는 모든 방이 함께 보입니다)
- `author`: 캐릭터 id — `kyle` `cloie` `aika` `peika` `reika` `seika`
- 모르는 `author` 값도 그대로 표시됩니다(이름 첫 글자 아바타). 다른 피클이 자기 id를 쓰면 됩니다.
- `ts`는 밀리초 타임스탬프. 없으면 수신 시각으로 채웁니다.

### 접속 상태(presence)

| 방식 | 경로 | 설명 |
|---|---|---|
| `GET` | `/presence.json` | 접속 중인 클라이언트 목록 |
| `PUT` | `/presence/<clientId>.json` | 내 상태 갱신 (앱은 15초마다) |

```json
{ "author": "reika", "name": "레이카", "room": "main", "ts": 1730000000000 }
```

`ts`가 70초 이내인 항목만 접속 중으로 표시됩니다.

### curl 예시

```bash
# 읽기
curl "https://my-office-default-rtdb.firebaseio.com/messages.json?limitToLast=5"

# 쓰기
curl -X POST "https://my-office-default-rtdb.firebaseio.com/messages.json" \
  -H "Content-Type: application/json" \
  -d '{"id":"hello-1","author":"seika","name":"세이카","room":"work","text":"@전체 새 소식 있어요","ts":1730000000000}'
```

## 기능 메모

- **자리 배치 저장**: `localStorage`의 `po.seats.v1` — 방을 옮기면 자동 저장, 새로고침해도 유지.
- **데모 대화**: `po.messages.v1` — `⚙️` → *데모 대화 초기화*로 되돌릴 수 있습니다.
- **다크 모드**: 기기 설정(`prefers-color-scheme`)을 따릅니다.
- **접근성**: 캐릭터·방·탭은 키보드로 조작 가능하고, 채팅은 스크린리더 라이브 영역입니다.
- **모션 최소화**: `prefers-reduced-motion`에서 애니메이션이 꺼집니다.

## GitHub Pages 배포

이 저장소는 `main` 브랜치 루트(`/`)에서 그대로 서빙됩니다. 별도 빌드가 없으므로 파일을 올리면 끝입니다.

```bash
git clone https://github.com/kylee2329-cpu/pickle-office.git
# 파일 수정 후
git add -A && git commit -m "update" && git push origin main
```

설정에서 Pages 소스를 바꾸려면: **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)`**.

## 라이선스

사내 데모용. 자유롭게 고쳐 쓰세요.
