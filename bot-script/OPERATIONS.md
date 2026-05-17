# N-wiki 오픈채팅 봇 운영 매뉴얼

> 최종 수정: 2026-05-17  
> Vercel + Supabase + Claude API + 메신저봇R 연동 시스템

---

## 1. 전체 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│  Android 공기계 (메신저봇R)                                   │
│                                                             │
│  카카오톡 알림 → response() 콜백                             │
│    ├─ 일반 채팅  → POST /api/bot/ingest    채팅 저장          │
│    └─ "스미스+요약" → POST /api/bot/command  즉시 요약        │
│                                                             │
│  Java Thread (5분 데몬)                                      │
│    └─ GET  /api/bot/outbox          전송할 메시지 조회        │
│    └─ Api.replyRoom(room, message)  채팅방에 전송            │
│    └─ POST /api/bot/outbox/ack      전송 결과 보고           │
└─────────────────────┬───────────────────────────────────────┘
                      │ HTTPS
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  Vercel (Next.js — n-wiki 프로젝트)                          │
│                                                             │
│  API Routes                                                 │
│  ├─ POST /api/bot/ingest            채팅 저장               │
│  ├─ GET  /api/bot/outbox            전송 대기 메시지 반환    │
│  ├─ POST /api/bot/outbox/ack        전송 완료 처리           │
│  ├─ POST /api/bot/command           명령어 처리              │
│  ├─ GET  /api/cron/summarize        일일 요약 (KST 23:59)   │
│  ├─ GET  /api/cron/summarize-now    즉시 요약 (명령어 연동)  │
│  └─ GET  /api/cron/top5             Top5 공유 (KST 09:00)  │
└─────────────────────┬───────────────────────────────────────┘
                      │
          ┌───────────┴───────────┐
          ▼                       ▼
┌─────────────────┐    ┌──────────────────────┐
│  Supabase (DB)  │    │  Anthropic Claude API │
│                 │    │  (Haiku 모델)          │
│  chat_logs      │    └──────────────────────┘
│  chat_log_meta  │
│  outbox         │
│  bot_state      │
│  documents      │  ← 기존 테이블
│  kakao_meta     │  ← 기존 테이블
└─────────────────┘
```

---

## 2. 데이터 모델

```
chat_logs
  id, log_date(KST), sender, text, created_at

chat_log_meta
  log_date(PK), message_count, summarized, summary_doc_id, created_at

outbox
  id, type('top5'|'new-post-alert'|'command-reply'), room, message,
  status('pending'|'in_flight'|'sent'|'failed'), attempts,
  dedup_key(UNIQUE), leased_until, created_at, sent_at

bot_state
  key(PK), value(JSONB)
  -- 'last_notified_doc_id': 마지막으로 알림 보낸 문서 UUID
  -- 'last_summary_date'   : 마지막 요약 날짜

documents   ← 기존 (type: 'kakao' 사용)
kakao_meta  ← 기존 (talk_date, participants)
```

---

## 3. 명령어 시스템

### 현재 지원 명령어

| 채팅 입력 예시 | 동작 |
|---|---|
| `스미스 요약해줘` | 오늘 자정~현재 채팅 즉시 요약 후 위키 등록 + 채팅방 결과 전송 |
| `스미스, 요약 부탁해` | 위와 동일 |
| `야 스미스 담론 요약해` | 위와 동일 ("스미스" + "요약" 동시 포함 시) |

### 명령어 확장 방법

`bot-script/main.js`의 `parseSmithCommand()` 함수에 if 추가:
```js
if (msg.indexOf('인기') !== -1) return 'top5';
if (msg.indexOf('도움') !== -1) return 'help';
```

서버 `app/api/bot/command/route.ts`에서 해당 command 값 처리 추가.

---

## 4. API 호출 흐름

### 채팅 수집
```
카카오톡 메시지 → response() → POST /api/bot/ingest
  → KST 날짜 계산 → chat_logs INSERT → increment_chat_log_meta() RPC
```

### 즉시 요약 (명령어)
```
"스미스 요약해줘" → POST /api/bot/command
  → GET /api/cron/summarize-now (내부 호출)
  → chat_logs 조회 (오늘, 최소 3건)
  → Claude Haiku → documents INSERT (slug: 카카오-담론-YYYY-MM-DD-중간요약)
  → outbox INSERT (command-reply) → 5분 내 봇이 채팅방에 전송
```

### 일일 자동 요약 (KST 23:59)
```
Vercel Cron → GET /api/cron/summarize
  → chat_logs 조회 (어제, 최소 5건)
  → Claude Haiku → documents INSERT (slug: 카카오-담론-YYYY-MM-DD)
  → chat_log_meta UPDATE { summarized: true }
```

### Outbox 전송 (5분마다)
```
봇 폴러 → GET /api/bot/outbox → claim_outbox() RPC
  → Api.replyRoom() → POST /api/bot/outbox/ack
```

---

## 5. 초기 설치 절차

### Step 1. Supabase SQL 실행

Supabase 대시보드 → SQL Editor에서 실행:
```
supabase/migrations/260517_001_bot_tables.sql
```

실행 후 bot_state에 설정값 등록 (Supabase SQL Editor):
```sql
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
| `BOT_SECRET` | `openssl rand -hex 32` |
| `CRON_SECRET` | `openssl rand -hex 32` |
| `OPENCHAT_ROOM_NAME` | 카카오톡 채팅방 정확한 이름 |
| `SITE_URL` | `https://your-site.vercel.app` (끝 `/` 없이) |
| `BOT_AUTHOR_ID` | Supabase → profiles 테이블에서 봇 계정 UUID |

### Step 3. Vercel 환경변수 등록

Vercel 대시보드 → 프로젝트 → Settings → Environment Variables  
`NEXT_PUBLIC_` prefix 없이 등록 (서버 전용).

### Step 4. 배포

```bash
git push  # Vercel 자동 배포
```

### Step 5. 봇 스크립트 등록

1. `bot-script/main.js` 상단 변수 수정:
   ```js
   var SERVER_URL  = 'https://your-site.vercel.app';
   var BOT_SECRET  = '생성한 BOT_SECRET 값';
   var TARGET_ROOM = '정확한 채팅방 이름';
   var BOT_NAME    = '봇 카카오 닉네임';
   var SMITH_NAME  = '스미스';  // 명령어 호출명 (변경 가능)
   ```
2. 메신저봇R → 스크립트 관리 → 새 스크립트 → 내용 붙여넣기
3. **컴파일** → 에러 없으면 → **활성화**

### Step 6. 단계별 검증

```bash
# ① 채팅 수집 확인
curl -X POST https://YOUR_URL/api/bot/ingest \
  -H "X-Bot-Secret: $BOT_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"room":"채팅방이름","sender":"테스터","text":"테스트"}'
# → Supabase chat_logs에 row 확인

# ② outbox → 채팅방 전송 확인
# Supabase SQL Editor:
# INSERT INTO outbox (type, room, message) VALUES ('test','채팅방이름','테스트');
# 5분 대기 후 채팅방 수신 확인

# ③ 즉시 요약 명령어 테스트
curl -X POST https://YOUR_URL/api/bot/command \
  -H "X-Bot-Secret: $BOT_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"command":"summarize-now","triggered_by":"테스터","room":"채팅방이름"}'

# ④ 일일 요약 크론 수동 실행
curl -H "Authorization: Bearer $CRON_SECRET" https://YOUR_URL/api/cron/summarize

# ⑤ Top5 크론 수동 실행
curl -H "Authorization: Bearer $CRON_SECRET" https://YOUR_URL/api/cron/top5
```

---

## 6. 일상 운영

### 매일 자동 실행

| 시각 (KST) | 이벤트 |
|---|---|
| 상시 | 채팅방 메시지 → chat_logs 적재 |
| 언제든 | "스미스 요약해줘" → 즉시 중간 요약 |
| 09:00 | Top5 인기 글 채팅방 공유 |
| 23:59 | 하루치 채팅 AI 요약 → 위키 글 자동 등록 |
| 새 글 발행 즉시 | 채팅방 알림 (5분 이내) |

### Supabase 비활성 방지

Free 플랜은 7일 미사용 시 자동 일시정지.  
봇 가동 중에는 매일 크론+ingest가 발생해 자연히 해결됨.  
**가동 전 임시 조치**: UptimeRobot → `https://your-site.vercel.app` → 5분 간격 핑.

### 봇 폰 관리

- 충전기 상시 연결
- 배터리 최적화 예외: 메신저봇R, 카카오톡
- 알림 접근 권한: 메신저봇R → ON
- Wi-Fi 연결 유지

---

## 7. 트러블슈팅

### 채팅이 수집 안 됨
1. 메신저봇R 활성화 상태 (초록 불) 확인
2. 카카오톡 알림 접근 권한 확인
3. 카카오톡이 포그라운드면 알림 안 뜸 → 홈 화면으로 이동
4. `chat_logs`에 row 없으면 → webhook.site로 SERVER_URL 임시 교체해 POST 확인
5. row 있는데 필터링됨 → `TARGET_ROOM`과 실제 채팅방 이름 정확히 일치 확인

### 스미스 명령어가 안 됨
1. `bot-script/main.js`의 `SMITH_NAME` 값 확인 (기본값 '스미스')
2. 메시지에 `SMITH_NAME` + 명령 키워드 둘 다 포함되어야 함
3. `/api/bot/command` 수동 curl 테스트로 서버 응답 확인
4. `outbox` 테이블에 `command-reply` row 생성됐는지 확인

### 봇이 메시지를 안 보냄
1. `outbox`에 `pending` row 있는지 확인
2. `GET /api/bot/outbox` 수동 호출로 응답 확인
3. 메신저봇R 로그 탭에서 오류 확인
4. `failed` 쌓이면:
   ```sql
   UPDATE outbox SET status='pending', attempts=0 WHERE status='failed';
   ```

### 요약이 안 만들어짐
1. `chat_log_meta.summarized` 확인 (이미 true면 skip — 정상)
2. Vercel 대시보드 → Functions → 크론 로그 확인
3. 메시지 건수 부족 (일일: 5건 미만, 즉시: 3건 미만) → 자동 skip
4. `ANTHROPIC_API_KEY` 환경변수 확인
5. `BOT_AUTHOR_ID`가 `profiles` 테이블에 존재하는지 확인

### Supabase 일시정지됨
1. Supabase 대시보드 → Resume 클릭
2. 봇 스크립트 재시작 (비활성화 → 활성화)
3. UptimeRobot으로 재발 방지

---

## 8. 비용 관리

| 서비스 | 플랜 | 예상 비용 |
|---|---|---|
| Vercel | Hobby (무료) | $0 |
| Supabase | Free | $0 |
| Claude Haiku | 사용량 기반 | ~$0.06/월 (하루 200메시지 기준) |

**월 $10 한도 설정 강력 권장**: Anthropic 콘솔 → Plans → Spend limits

---

## 9. 환경변수 전체 목록

```env
# 기존 (이미 설정됨)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# 신규 — 서버 전용 (NEXT_PUBLIC_ 없이)
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
BOT_SECRET=
CRON_SECRET=
OPENCHAT_ROOM_NAME=
SITE_URL=
BOT_AUTHOR_ID=
```
