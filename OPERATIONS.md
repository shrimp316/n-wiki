# N-wiki 오픈채팅 봇 운영 매뉴얼

> Vercel + Supabase + Claude API + 메신저봇R 연동 시스템

---

## 1. 전체 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│  Android 공기계 (메신저봇R)                                   │
│                                                             │
│  카카오톡 알림 → response() 콜백                             │
│    └─ POST /api/bot/ingest          채팅 1건 전송            │
│                                                             │
│  Java Thread (5분 데몬)                                      │
│    └─ GET  /api/bot/outbox          전송할 메시지 조회        │
│    └─ Api.replyRoom(room, message)  채팅방에 전송            │
│    └─ POST /api/bot/outbox/ack      전송 결과 보고           │
└─────────────────────┬───────────────────────────────────────┘
                      │ HTTPS
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  Vercel (Next.js App Router)                                │
│                                                             │
│  API Routes                                                 │
│  ├─ POST /api/bot/ingest       채팅 저장                     │
│  ├─ GET  /api/bot/outbox       전송 대기 메시지 반환          │
│  ├─ POST /api/bot/outbox/ack   전송 완료 처리                │
│  ├─ GET  /api/cron/summarize   일일 요약 (KST 23:59 자동)    │
│  └─ GET  /api/cron/top5        Top5 공유 (KST 09:00 자동)   │
│                                                             │
│  공통 유틸                                                   │
│  ├─ lib/supabase-admin.ts      Service Role 클라이언트       │
│  └─ lib/bot-auth.ts            시크릿 검증                   │
└─────────────────────┬───────────────────────────────────────┘
                      │
          ┌───────────┴───────────┐
          ▼                       ▼
┌─────────────────┐    ┌──────────────────────┐
│  Supabase (DB)  │    │  Anthropic Claude API │
│                 │    │  (Haiku 모델)          │
│  chat_logs      │    │  요약 크론에서만 호출   │
│  chat_log_meta  │    └──────────────────────┘
│  outbox         │
│  bot_state      │
│  documents      │  ← 기존 테이블 (요약 결과 저장)
│  kakao_meta     │  ← 기존 테이블
└─────────────────┘
```

### 컴포넌트 역할 요약

| 컴포넌트 | 역할 | 방향 |
|---|---|---|
| 메신저봇R | 카카오톡 알림 가로채기, 채팅방 메시지 발송 | 봇 → 서버, 서버 → 봇 |
| `/api/bot/ingest` | 채팅 원본 저장 | 봇 → 서버 |
| `/api/bot/outbox` | 전송 대기 메시지 Pull | 서버 → 봇 |
| `/api/bot/outbox/ack` | 전송 완료 기록 | 봇 → 서버 |
| `/api/cron/summarize` | 하루치 채팅 → AI 요약 → 위키 글 등록 | 내부 자동 |
| `/api/cron/top5` | 인기 글 Top5 → outbox 적재 | 내부 자동 |
| DB Trigger | 새 글 등록 → outbox 자동 적재 | Supabase 내부 |

---

## 2. 데이터 모델

```
chat_logs
  id, log_date(KST), sender, text, created_at

chat_log_meta
  log_date(PK), message_count, summarized, summary_doc_id, created_at

outbox
  id, type('top5'|'new-post-alert'), room, message,
  status('pending'|'sent'|'failed'), attempts, created_at, sent_at

bot_state
  key(PK), value(JSONB)
  -- 'last_notified_doc_id': 마지막으로 알림 보낸 문서 UUID
  -- 'last_summary_date'   : 마지막 요약 날짜

documents   ← 기존 테이블 (type에 'kakao' 사용)
kakao_meta  ← 기존 테이블 (talk_date, participants)
```

---

## 3. API 호출 흐름 상세

### 3-1. 채팅 수집 (기능 1 전처리)

```
카카오톡 메시지 도착
  │
  ▼
메신저봇R onMessage(room, msg, sender, ...)
  │  room !== TARGET_ROOM이면 → 무시 (return)
  │
  ▼
POST /api/bot/ingest
  Headers: X-Bot-Secret: {BOT_SECRET}
  Body: { room, sender, text, received_at }
  │
  ▼
[서버] verifyBotSecret() → 401이면 차단
  │
  ▼
KST 날짜 계산 (UTC+9 오프셋 적용)
  │
  ▼
chat_logs INSERT { log_date, sender, text }
  │
  ▼
chat_log_meta UPSERT (message_count + 1)
  │
  ▼
Response: { ok: true }     ← 봇은 응답 무시
```

**핵심 포인트**
- `log_date`는 **KST 날짜** 기준 (UTC 00:00~08:59에 온 메시지도 한국 날짜로 저장)
- 대상 방 외 메시지는 서버에서 한번 더 필터링 (`OPENCHAT_ROOM_NAME` 환경변수)
- `chat_log_meta`는 날짜별 카운터 역할 (요약 여부 추적용)

---

### 3-2. 봇 전송 큐 — Outbox 패턴

```
[5분마다 봇 폴러 실행]
  │
  ▼
GET /api/bot/outbox
  Headers: X-Bot-Secret: {BOT_SECRET}
  │
  ▼
[서버] outbox WHERE status='pending' ORDER BY created_at LIMIT 10
  │
  ▼
Response: [ { id, type, room, message }, ... ]
  │
  ├─ 빈 배열이면 → 종료 (아무것도 안 함)
  │
  └─ 메시지 있으면 루프:
       Api.replyRoom(item.room, item.message)
       │
       ├─ 성공 → POST /api/bot/outbox/ack { id, status: 'sent' }
       └─ 실패 → POST /api/bot/outbox/ack { id, status: 'failed' }

[서버 ack 처리]
  outbox UPDATE SET status='sent', sent_at=NOW()
```

**핵심 포인트**
- 봇 폰에 공인 IP가 없어서 서버가 직접 푸시 불가 → **Pull 방식**
- `pending` 상태만 반환하므로 중복 전송 없음
- `failed` 상태는 자동 재시도하지 않음 (운영자가 수동 재처리)

---

### 3-3. 일일 요약 (기능 1)

```
[Vercel Cron — 매일 UTC 14:59 = KST 23:59]
  │
  ▼
GET /api/cron/summarize
  Headers: Authorization: Bearer {CRON_SECRET}
  │
  ▼
KST 오늘 날짜 계산
  │
  ▼
chat_log_meta WHERE log_date = 오늘 AND summarized = true
  ├─ 이미 요약됨 → { skipped: 'already_summarized' } 반환 (멱등성)
  │
  └─ 미요약:
       chat_logs WHERE log_date = 오늘 ORDER BY created_at ASC
       │
       ├─ 5건 미만 → { skipped: 'not_enough_messages' } 반환
       │
       └─ 5건 이상:
            참여자 목록 추출 (중복 제거)
            │
            ▼
            POST https://api.anthropic.com/v1/messages
              model: claude-haiku-4-5-20251001
              대화 내용 + 요약 포맷 프롬프트
            │
            ▼
            요약 HTML 텍스트 수신
            │
            ▼
            documents INSERT {
              type: 'kakao',
              title: '카카오톡 담론 요약 (YYYY-MM-DD)',
              body: 요약HTML,
              status: 'published',
              author_id: BOT_AUTHOR_ID
            }
            │
            ▼
            kakao_meta INSERT { document_id, talk_date, participants }
            │
            ▼
            chat_log_meta UPDATE { summarized: true, summary_doc_id }
            │
            ▼
            Response: { ok: true, doc_id, date, message_count }
```

**핵심 포인트**
- `chat_log_meta.summarized` 체크로 크론이 여러 번 실행돼도 중복 요약 방지
- 요약 결과는 기존 `/wiki/[slug]` 페이지에서 바로 열람 가능
- `type: 'kakao'`이므로 홈 화면 "카카오톡 담론 요약" 탭에 자동 표시

---

### 3-4. Top5 공유 (기능 2)

```
[Vercel Cron — 매일 UTC 00:00 = KST 09:00]
  │
  ▼
GET /api/cron/top5
  │
  ▼
documents WHERE status='published' AND type != 'bot-summary'
  ORDER BY like_count DESC LIMIT 5
  │
  ▼
메시지 포맷:
  "📊 오늘의 인기 글 TOP 5
   1. 제목 ♥12
      https://site/wiki/slug
   ..."
  │
  ▼
outbox INSERT { type:'top5', room, message, status:'pending' }
  │
  ▼ (5분 이내 봇 폴러가 수신)
봇 → Api.replyRoom(채팅방, 메시지)
```

---

### 3-5. 새 글 알림 (기능 3)

```
[사용자가 위키 글 발행]
  │
  ▼
documents INSERT (Next.js 앱에서)
  │
  ▼
[Supabase DB Trigger: on_new_document]
  type = 'bot-summary' → SKIP (무한루프 방지)
  status != 'published' → SKIP
  │
  ▼
outbox INSERT {
  type: 'new-post-alert',
  room: current_setting('app.openchat_room_name'),
  message: '📢 새 글: 제목\nhttps://site/wiki/slug'
}
  │
  ▼ (5분 이내 봇 폴러가 수신)
봇 → Api.replyRoom(채팅방, 메시지)
```

**핵심 포인트**
- `type = 'bot-summary'` 필터가 없으면 AI 요약 글이 다시 알림을 유발하는 무한루프 발생
- DB 트리거는 Vercel 서버와 무관하게 Supabase 내부에서 실행됨

---

## 4. 초기 설치 절차

### Step 1. Supabase 설정

```sql
-- 1) Supabase SQL Editor에서 마이그레이션 실행
-- supabase/migrations/001_bot_tables.sql 전체 붙여넣기 후 실행

-- 2) 채팅방 이름과 사이트 URL 설정 (bot_state 테이블 사용 — ALTER DATABASE는 권한 없음)
INSERT INTO bot_state (key, value) VALUES
  ('openchat_room_name', '"정확한채팅방이름"'),
  ('site_url', '"https://your-site.vercel.app"')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
```

### Step 2. 환경변수 발급

| 변수명 | 발급 방법 |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 대시보드 → Settings → API → service_role |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys |
| `BOT_SECRET` | 터미널: `openssl rand -hex 32` |
| `CRON_SECRET` | 터미널: `openssl rand -hex 32` |
| `OPENCHAT_ROOM_NAME` | 카카오톡 채팅방 정확한 이름 (공백 포함) |
| `SITE_URL` | `https://your-site.vercel.app` (끝에 `/` 없이) |
| `BOT_AUTHOR_ID` | Supabase → profiles 테이블에서 봇 계정 UUID 복사 |

### Step 3. Vercel 환경변수 등록

Vercel 대시보드 → 프로젝트 → Settings → Environment Variables에서 위 변수 전부 추가.  
`NEXT_PUBLIC_` prefix 없이 등록해야 서버에서만 접근 가능.

### Step 4. 배포

```bash
git add .
git commit -m "feat: 오픈채팅 봇 시스템 추가"
git push
```

Vercel이 자동 배포 후 `/api/cron/*` 경로가 vercel.json 스케줄에 등록됨.

### Step 5. 봇 스크립트 등록

1. `bot-script/main.js` 열기
2. 상단 3개 변수 수정:
   ```js
   var SERVER_URL  = 'https://your-site.vercel.app';
   var BOT_SECRET  = '위에서 생성한 BOT_SECRET 값';
   var TARGET_ROOM = '정확한 채팅방 이름';
   ```
3. 메신저봇R → 스크립트 관리 → 새 스크립트 → 내용 붙여넣기
4. **컴파일** → 컴파일 에러 없으면 → **활성화**

### Step 6. 검증 (단계별)

```
① 봇 → 서버 채팅 수집 확인
   채팅방에 테스트 메시지 전송
   Supabase chat_logs 테이블에 row 확인

② 서버 → 봇 전송 확인
   Supabase outbox에 수동 INSERT:
   INSERT INTO outbox (type, room, message) VALUES ('test', '채팅방이름', '봇 테스트 메시지');
   5분 기다린 후 채팅방에 메시지 수신 확인

③ 요약 크론 수동 테스트
   curl -H "Authorization: Bearer {CRON_SECRET}" https://your-site.vercel.app/api/cron/summarize
   documents 테이블에 요약 글 확인

④ Top5 크론 수동 테스트
   curl -H "Authorization: Bearer {CRON_SECRET}" https://your-site.vercel.app/api/cron/top5
   outbox에 top5 row 생성 확인 → 5분 후 채팅방 수신 확인
```

---

## 5. 일상 운영

### 매일 자동으로 일어나는 일

| 시각 (KST) | 이벤트 |
|---|---|
| 상시 | 채팅방 메시지 → chat_logs 적재 |
| 09:00 | Top5 인기 글 채팅방 공유 |
| 23:59 | 하루치 채팅 AI 요약 → 위키 글 자동 등록 |
| 새 글 발행 즉시 | 채팅방 알림 (5분 이내) |

### Supabase 비활성 일시정지 방지

Free 플랜은 7일 미사용 시 자동 일시정지. 봇 가동 중에는 매일 크론+채팅 ingest가 발생하므로 자연히 해결됨.  
**봇 가동 전 임시 조치**: UptimeRobot (무료) → 모니터 추가 → `https://your-site.vercel.app` → 5분 간격 핑.

### 봇 폰 관리

- 충전기 상시 연결 (24시간 가동)
- 화면 꺼짐 허용, 잠금화면 알림 허용
- 배터리 최적화 예외: 메신저봇R, 카카오톡
- 알림 접근 권한: 메신저봇R → ON
- Wi-Fi 연결 유지 (데이터 절약 모드 해제)

---

## 6. 트러블슈팅

### 채팅이 수집 안 됨

```
체크 순서:
1. 메신저봇R 활성화 상태 확인 (초록 불)
2. 카카오톡 알림 접근 권한 → 설정 → 앱 → 메신저봇R → 알림 접근 허용 확인
3. 봇 폰에서 카카오톡 앱이 포그라운드에 있으면 알림 안 뜸 → 홈 화면으로 이동
4. Supabase chat_logs에 row가 없으면:
   webhook.site로 SERVER_URL 임시 교체 → 봇이 POST 보내는지 확인
5. row가 있는데 채팅방 필터링됨:
   TARGET_ROOM과 실제 채팅방 이름 정확히 일치하는지 확인 (공백, 특수문자 포함)
```

### 봇이 채팅방에 메시지를 안 보냄

```
체크 순서:
1. outbox 테이블에 pending row가 있는지 확인
2. pending이 있는데 전송 안 되면:
   GET /api/bot/outbox 수동 호출해서 응답 확인
   메신저봇R 로그 탭에서 오류 확인
3. Api.replyRoom 실패면:
   봇 계정이 해당 채팅방 멤버인지 확인
   채팅방 이름 정확히 일치하는지 확인
4. outbox에 failed row 쌓이면:
   UPDATE outbox SET status='pending' WHERE status='failed'; -- 수동 재시도
```

### 요약이 안 만들어짐

```
체크 순서:
1. chat_log_meta에서 해당 날짜 summarized 확인
2. Vercel 대시보드 → Functions → /api/cron/summarize 로그 확인
3. 메시지 5건 미만이면 자동 skip → chat_logs 건수 확인
4. Claude API 오류면:
   ANTHROPIC_API_KEY 환경변수 확인
   Anthropic 콘솔에서 잔액/한도 확인
5. documents INSERT 오류면:
   BOT_AUTHOR_ID가 profiles 테이블에 존재하는지 확인
```

### Supabase 프로젝트 일시정지됨

```
1. Supabase 대시보드 접속 → Resume 클릭
2. Resume 후 봇 스크립트 재시작 (메신저봇R 비활성화 → 활성화)
3. 재발 방지: UptimeRobot으로 일일 핑 설정
```

---

## 7. 비용 관리

### 예상 비용 (월)

| 서비스 | 플랜 | 예상 비용 |
|---|---|---|
| Vercel | Hobby (무료) | $0 |
| Supabase | Free | $0 |
| Anthropic Claude Haiku | 사용량 기반 | $1~3 (하루 200메시지 기준) |
| 알뜰폰 데이터 | 봇 폰 요금제 | 별도 |

### Claude Haiku 비용 계산

- 입력: 메시지 200건 × 평균 30자 = 약 1,800토큰 + 프롬프트 300토큰 = 2,100토큰/일
- 출력: 요약 약 500토큰/일
- Haiku 가격: 입력 $0.80/M, 출력 $4.00/M
- 일 비용: 약 $0.002 → **월 $0.06**

**월 $10 한도 설정 강력 권장** (Anthropic 콘솔 → Plans → Spend limits)

---

## 8. 환경변수 전체 목록

```env
# 기존 (이미 설정됨)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# 신규 — 서버 전용 (NEXT_PUBLIC_ 없이)
SUPABASE_SERVICE_ROLE_KEY=   # Supabase service_role key
ANTHROPIC_API_KEY=            # sk-ant-...
BOT_SECRET=                   # openssl rand -hex 32
CRON_SECRET=                  # openssl rand -hex 32
OPENCHAT_ROOM_NAME=           # 채팅방 정확한 이름
SITE_URL=                     # https://your-site.vercel.app
BOT_AUTHOR_ID=                # 봇 계정 UUID (profiles.id)
```

---

## 9. 운영 체크리스트

### 최초 배포 시

- [ ] 001_bot_tables.sql Supabase에서 실행
- [ ] `app.openchat_room_name`, `app.site_url` DB 설정
- [ ] Vercel 환경변수 7개 등록
- [ ] git push → Vercel 배포 완료 확인
- [ ] 봇 스크립트 SERVER_URL/BOT_SECRET/TARGET_ROOM 수정 후 메신저봇R 등록
- [ ] 단계별 검증 (채팅 수집 → outbox 수동 → 요약 수동 → top5 수동)
- [ ] Anthropic 월 $10 한도 설정
- [ ] UptimeRobot 또는 크론 가동으로 Supabase 비활성 방지

### 주간 점검

- [ ] chat_logs 수집 정상 여부 (Supabase에서 최근 7일 건수 확인)
- [ ] outbox failed 건수 확인 (있으면 pending으로 리셋)
- [ ] Anthropic 비용 확인
- [ ] Vercel 크론 실행 로그 확인

### 채팅방 이름 변경 시

- [ ] `bot-script/main.js`의 `TARGET_ROOM` 수정 → 메신저봇R 재컴파일
- [ ] Vercel 환경변수 `OPENCHAT_ROOM_NAME` 수정
- [ ] Supabase SQL Editor: `UPDATE bot_state SET value = '"새이름"' WHERE key = 'openchat_room_name';`
