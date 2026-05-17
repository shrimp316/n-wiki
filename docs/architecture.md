# n-wiki 아키텍처 문서

## 목차

1. [기술 스택](#1-기술-스택)
2. [디렉토리 구조](#2-디렉토리-구조)
3. [라우트 맵](#3-라우트-맵)
4. [데이터베이스 스키마](#4-데이터베이스-스키마)
5. [인증 플로우](#5-인증-플로우)
6. [실시간 구독](#6-실시간-구독)
7. [DB 트리거](#7-db-트리거)
8. [주요 컴포넌트](#8-주요-컴포넌트)
9. [상태 관리 패턴](#9-상태-관리-패턴)

---

## 1. 기술 스택

| 분류 | 기술 | 버전/비고 |
|------|------|-----------|
| 프레임워크 | Next.js (App Router) | 14.2.35 |
| 언어 | TypeScript | 5 |
| UI | React | 18 |
| 데이터베이스 | Supabase (PostgreSQL) | @supabase/ssr |
| 인증 | Supabase Auth | 이메일/패스워드 |
| 실시간 | Supabase Realtime | WebSocket 채널 |
| 리치 에디터 | react-quill-new | dynamic import (SSR 비활성) |
| 스타일 | React 인라인 CSSProperties | Tailwind 설정만 있고 미사용 |

---

## 2. 디렉토리 구조

```
n-wiki/
├── app/
│   ├── auth/
│   │   ├── callback/route.ts       # OAuth 콜백 처리
│   │   ├── login/page.tsx          # 로그인
│   │   ├── signup/page.tsx         # 회원가입 (2단계 폼)
│   │   └── reset/page.tsx          # 비밀번호 재설정
│   ├── discussions/
│   │   ├── page.tsx                # 토론 목록
│   │   ├── new/page.tsx            # 토론 생성
│   │   └── [id]/
│   │       ├── page.tsx            # 토론 상세 (실시간)
│   │       └── edit/page.tsx       # 토론 수정 (자동저장)
│   ├── search/page.tsx             # 통합 검색
│   ├── wiki/
│   │   ├── new/page.tsx            # 문서 작성
│   │   └── [slug]/
│   │       ├── page.tsx            # 문서 상세
│   │       └── edit/page.tsx       # 문서 수정
│   ├── layout.tsx                  # 루트 레이아웃 (Navbar 포함)
│   └── page.tsx                    # 홈 (3탭: 카카오/개념/토론)
├── components/
│   ├── Navbar.tsx                  # 상단 네비게이션 + 알림
│   ├── Comments.tsx                # 스레드 댓글
│   ├── LikeButton.tsx              # 좋아요 토글
│   └── QuillEditor.tsx             # 리치 텍스트 에디터 래퍼
├── lib/
│   └── supabase/
│       ├── client.ts               # 브라우저 클라이언트 (createClient)
│       └── server.ts               # 서버 클라이언트 (createServerClient)
├── supabase-schema.sql             # DB 스키마 전체 정의
└── docs/
    ├── architecture.md             # 이 파일
    └── api-spec.csv                # API 호출 명세
```

---

## 3. 라우트 맵

| URL | 파일 | 설명 |
|-----|------|------|
| `/` | `app/page.tsx` | 홈 — 카카오담론/개념문서/토론 3탭 |
| `/auth/login` | `app/auth/login/page.tsx` | 이메일 로그인, 비밀번호 재설정 링크 |
| `/auth/signup` | `app/auth/signup/page.tsx` | 닉네임·이메일·패스워드 + 관심태그 선택 |
| `/auth/reset` | `app/auth/reset/page.tsx` | 비밀번호 재설정 (이메일 인증 후) |
| `/auth/callback` | `app/auth/callback/route.ts` | Supabase OAuth 코드 교환 |
| `/search` | `app/search/page.tsx` | 문서·토론 통합 검색 |
| `/wiki/new` | `app/wiki/new/page.tsx` | 문서 작성 (`?type=kakao\|concept\|discussion`) |
| `/wiki/[slug]` | `app/wiki/[slug]/page.tsx` | 문서 상세 (위키링크, 댓글, 좋아요) |
| `/wiki/[slug]/edit` | `app/wiki/[slug]/edit/page.tsx` | 문서 수정 (버전 이력 저장) |
| `/discussions` | `app/discussions/page.tsx` | 토론 목록 (상태별 필터) |
| `/discussions/new` | `app/discussions/new/page.tsx` | 토론 생성 (찬반형/다관점형) |
| `/discussions/[id]` | `app/discussions/[id]/page.tsx` | 토론 상세 (실시간 피드, 관리자 기능) |
| `/discussions/[id]/edit` | `app/discussions/[id]/edit/page.tsx` | 토론 수정 (자동저장 3초 디바운스) |

---

## 4. 데이터베이스 스키마

### 4.1 사용자

```
profiles
├── id              UUID  PK  → auth.users
├── nickname        TEXT  UNIQUE NOT NULL
├── email           TEXT
├── interests       TEXT[]  default {}
├── is_admin        BOOLEAN default false
└── created_at      TIMESTAMPTZ
```

### 4.2 위키 문서

```
documents
├── id              UUID  PK
├── slug            TEXT  UNIQUE
├── title           TEXT  NOT NULL
├── type            TEXT  ('kakao' | 'concept' | 'discussion')
├── body            TEXT  (Rich HTML)
├── status          TEXT  ('published' | 'draft')
├── author_id       UUID  → profiles
├── tags            TEXT[]
├── like_count      INT   (트리거 자동 갱신)
├── created_at      TIMESTAMPTZ
└── updated_at      TIMESTAMPTZ

kakao_meta
├── document_id     UUID  PK → documents
├── talk_date       DATE
└── participants    TEXT[]

discussion_perspectives
├── id              UUID  PK
├── document_id     UUID  → documents
├── label           TEXT  ("관점 A", "관점 B" ...)
├── body            TEXT  (Rich HTML)
├── author_id       UUID  → profiles
└── display_order   INT

document_versions
├── id              UUID  PK
├── document_id     UUID  → documents
├── body            TEXT  (스냅샷)
├── edited_by       UUID  → profiles
└── edited_at       TIMESTAMPTZ

wiki_links
├── source_slug     TEXT
└── target_slug     TEXT
    PK (source_slug, target_slug)
```

### 4.3 댓글 / 좋아요

```
comments
├── id              UUID  PK
├── document_id     UUID  → documents
├── parent_id       UUID  → comments  (NULL = 최상위)
├── content         TEXT
├── author_id       UUID  → profiles
├── created_at      TIMESTAMPTZ
└── updated_at      TIMESTAMPTZ

likes
├── document_id     UUID  → documents
├── user_id         UUID  → profiles
├── created_at      TIMESTAMPTZ
└── PK (document_id, user_id)
```

### 4.4 토론

```
discussions
├── id              UUID  PK
├── title           TEXT  NOT NULL
├── body            TEXT  (발제문, Rich HTML)
├── format          TEXT  ('pros_cons' | 'multi')
├── status          TEXT  ('active' | 'paused' | 'ended')
├── author_id       UUID  → profiles
├── tags            TEXT[]
├── end_at          TIMESTAMPTZ
├── started_at      TIMESTAMPTZ
├── notice          TEXT  (관리자 공지)
└── created_at      TIMESTAMPTZ

discussion_participants
├── discussion_id   UUID  → discussions
├── user_id         UUID  → profiles
├── stance          TEXT  ("찬성" | "반대" | "발제자" | custom)
├── joined_at       TIMESTAMPTZ
└── PK (discussion_id, user_id)

debate_posts
├── id              UUID  PK
├── discussion_id   UUID  → discussions
├── parent_id       UUID  → debate_posts  (NULL = 최상위)
├── post_type       TEXT  ('argument' | 'rebuttal' | 'question')
├── content         TEXT  (Rich HTML)
├── author_id       UUID  → profiles
├── stance          TEXT  (작성 시 입장 스냅샷)
├── agree_count     INT   (트리거 자동 갱신)
└── created_at      TIMESTAMPTZ

debate_agrees
├── post_id         UUID  → debate_posts
├── user_id         UUID  → profiles
└── PK (post_id, user_id)

extension_requests
├── id              UUID  PK
├── discussion_id   UUID  → discussions
├── user_id         UUID  → profiles
├── stance          TEXT
├── created_at      TIMESTAMPTZ
└── UNIQUE (discussion_id, user_id)
```

### 4.5 알림

```
notifications
├── id              UUID  PK
├── user_id         UUID  → profiles
├── type            TEXT  ('participant_joined' | 'extension_approved' ...)
├── message         TEXT
├── discussion_id   UUID  → discussions
├── is_read         BOOLEAN default false
└── created_at      TIMESTAMPTZ
```

---

## 5. 인증 플로우

```
회원가입
  Step 1: 닉네임 (중복확인 디바운스 400ms) + 이메일 + 패스워드
  Step 2: 관심태그 12개 선택 → user_metadata 저장
  Step 3: 이메일 인증 안내 화면
      ↓ (이메일 클릭)
  /auth/callback  →  exchangeCodeForSession()
      ↓
  DB 트리거: auth.users INSERT → profiles 자동 생성
      ↓
  홈으로 리다이렉트

로그인
  이메일 + 패스워드 → supabase.auth.signInWithPassword()
  실패 시: 비밀번호 재설정 이메일 발송 링크 제공

비밀번호 재설정
  이메일 발송 → 링크 클릭 → /auth/reset → 새 비밀번호 입력
```

---

## 6. 실시간 구독

| 채널 | 테이블 | 이벤트 | 위치 | 동작 |
|------|--------|--------|------|------|
| `discussion-{id}` | `debate_posts` | INSERT | `app/discussions/[id]/page.tsx` | 새 게시물 피드에 추가 |
| `discussion-{id}` | `discussion_participants` | INSERT | `app/discussions/[id]/page.tsx` | 참가자 목록 리로드 |
| `notifications-{userId}` | `notifications` | INSERT | `components/Navbar.tsx` | 벨 배지 업데이트 |

---

## 7. DB 트리거

| 트리거 | 발생 조건 | 동작 |
|--------|-----------|------|
| `create_profile_for_user` | `auth.users` INSERT | `profiles` 레코드 자동 생성 |
| `update_like_count` | `likes` INSERT / DELETE | `documents.like_count` 자동 갱신 |
| `update_agree_count` | `debate_agrees` INSERT / DELETE | `debate_posts.agree_count` 자동 갱신 |

---

## 8. 주요 컴포넌트

### Navbar (`components/Navbar.tsx`)
- 로고, 검색창 (Enter → `/search?q=...`), 로그인/로그아웃
- 알림 벨: `notifications` 테이블 Realtime 구독, 최근 5개 드롭다운, 미읽은 배지
- 알림 클릭 → 해당 토론 이동 + `is_read = true` 업데이트

### Comments (`components/Comments.tsx`)
- `document_id` 기준 댓글 로드 (`parent_id` NULL = 최상위)
- 인라인 수정/삭제 (본인만), 대댓글 입력창 toggle
- Supabase 직접 쿼리 (별도 API 없음)

### LikeButton (`components/LikeButton.tsx`)
- 마운트 시 현재 유저 좋아요 여부 확인 (`maybeSingle`)
- toggle: 좋아요 있으면 DELETE, 없으면 INSERT
- `like_count`는 DB 트리거가 자동 갱신

### QuillEditor (`components/QuillEditor.tsx`)
- `react-quill-new` dynamic import (SSR 비활성화)
- 툴바: 헤더, bold/italic/underline, 색상, 리스트, 인용, 링크, 이미지
- 빈 상태 감지 → custom placeholder 오버레이 (포지션 계산)

---

## 9. 상태 관리 패턴

- **라이브러리 없음**: Redux, Zustand, Context API 미사용
- **패턴**: 각 페이지/컴포넌트가 `useState` + `useEffect`로 자체 상태 관리
- **데이터 접근**: Supabase JS 클라이언트 직접 쿼리 (별도 API 레이어 없음)
- **실시간**: Supabase 채널 구독 → 이벤트 수신 시 로컬 state 업데이트
- **자동저장**: `discussions/[id]/edit` — title/body/tags 변경 시 3초 디바운스 후 DB 저장
- **위키링크**: `[[slug]]` 패턴 → 뷰 렌더링 시 정규식으로 `<a>` 태그 변환

---

## 10. 오픈채팅 봇 시스템 (2026-05-17 추가)

> 카카오톡 오픈채팅방과 n-wiki 사이트를 양방향으로 연결하는 봇 서브시스템

### 10-1. 전체 구조

```
카카오톡 채팅방
     │ 알림 (Notification)
     ▼
┌─────────────────────────────────────────────┐
│  Android 공기계 (메신저봇R / Rhino JS ES5)    │
│                                             │
│  response() 콜백                            │
│    ├─ 일반 채팅   → POST /api/bot/ingest    │
│    └─ 명령어 감지 → POST /api/bot/command   │
│                                             │
│  Java Thread 데몬 (5분 간격)                 │
│    └─ GET  /api/bot/outbox                  │
│    └─ Api.replyRoom(room, message)          │
│    └─ POST /api/bot/outbox/ack              │
└──────────────────────┬──────────────────────┘
                       │ HTTPS
                       ▼
┌─────────────────────────────────────────────┐
│  Vercel (Next.js App Router)                │
│                                             │
│  봇 API (X-Bot-Secret 인증)                  │
│  ├─ POST /api/bot/ingest                    │
│  ├─ GET  /api/bot/outbox                    │
│  ├─ POST /api/bot/outbox/ack                │
│  └─ POST /api/bot/command                   │
│                                             │
│  크론 API (Authorization: Bearer 인증)       │
│  ├─ GET /api/cron/summarize    KST 23:59    │
│  ├─ GET /api/cron/summarize-now  명령어 즉시 │
│  └─ GET /api/cron/top5         KST 09:00   │
│                                             │
│  공통 유틸                                   │
│  ├─ lib/supabase-admin.ts  Service Role     │
│  └─ lib/bot-auth.ts        시크릿 검증       │
└──────────────────────┬──────────────────────┘
                       │
           ┌───────────┴───────────┐
           ▼                       ▼
┌─────────────────┐    ┌──────────────────────┐
│  Supabase (DB)  │    │  Anthropic Claude API │
│                 │    │  모델: Haiku           │
│  chat_logs      │    └──────────────────────┘
│  chat_log_meta  │
│  outbox         │
│  bot_state      │
│  documents ─────│── 기존 테이블 (요약 결과)
│  kakao_meta ────│── 기존 테이블
└─────────────────┘
```

### 10-2. 신규 DB 테이블 (001_bot_tables.sql)

```
chat_logs
  id          BIGSERIAL PK
  log_date    DATE          -- KST 기준 날짜 (UTC+9)
  sender      TEXT
  text        TEXT
  created_at  TIMESTAMPTZ

chat_log_meta
  log_date        DATE PK
  message_count   INT DEFAULT 0
  summarized      BOOLEAN DEFAULT FALSE
  summary_doc_id  UUID → documents

outbox
  id           BIGSERIAL PK
  type         TEXT          -- 'top5' | 'new-post-alert' | 'command-reply'
  room         TEXT
  message      TEXT
  status       ENUM          -- pending | in_flight | sent | failed
  attempts     INT DEFAULT 0
  dedup_key    TEXT UNIQUE
  leased_until TIMESTAMPTZ
  created_at   TIMESTAMPTZ
  sent_at      TIMESTAMPTZ

bot_state
  key    TEXT PK
  value  JSONB
```

### 10-3. 기능별 데이터 흐름

#### 채팅 수집 (상시)
```
메신저봇R response()
  → POST /api/bot/ingest
  → KST 날짜 계산
  → chat_logs INSERT
  → increment_chat_log_meta() RPC (원자적 카운터 +1)
```

#### 일일 자동 요약 (KST 23:59)
```
Vercel Cron → /api/cron/summarize
  → chat_log_meta.summarized 체크 (멱등성)
  → chat_logs 5건 미만이면 skip
  → Claude Haiku API 호출
  → documents INSERT { type: 'kakao', slug: '카카오-담론-YYYY-MM-DD' }
  → kakao_meta INSERT
  → chat_log_meta UPDATE { summarized: true }
```

#### 명령어 즉시 요약 ("요약해줘")
```
채팅방 메시지 → isCommandMessage() = true
  → POST /api/bot/command
  → /api/cron/summarize-now 내부 호출
  → Claude Haiku API 호출 (오늘 자정~현재, 최소 3건)
  → documents INSERT { slug: '카카오-담론-YYYY-MM-DD-중간요약' }
  → outbox INSERT { type: 'command-reply' }  ← 봇이 채팅방에 결과 전송
```

#### 새 글 알림 (실시간)
```
documents INSERT/UPDATE (status → 'published')
  → [Supabase] on_new_document 트리거
  → type='kakao' 이면 skip (무한루프 방지)
  → outbox INSERT { type: 'new-post-alert', dedup_key: 'doc:uuid' }
```

#### Top5 공유 (KST 09:00)
```
Vercel Cron → /api/cron/top5
  → documents ORDER BY like_count DESC LIMIT 5
  → outbox INSERT { type: 'top5', dedup_key: 'top5:YYYY-MM-DD' }
```

#### Outbox 전송 (5분마다)
```
봇 폴러 → GET /api/bot/outbox
  → claim_outbox() RPC (FOR UPDATE SKIP LOCKED, 2분 임대)
  → Api.replyRoom(room, message)
  → POST /api/bot/outbox/ack { id, status: 'sent'|'failed' }
```

### 10-4. 보안

| 항목 | 방식 |
|------|------|
| 봇↔서버 인증 | `X-Bot-Secret` 헤더 + `timingSafeEqual` |
| 크론 인증 | `Authorization: Bearer {CRON_SECRET}` |
| DB 접근 | Service Role Key (RLS 우회, 서버 전용) |
| XSS 방지 | AI 출력에서 script/iframe/on\* 태그 제거 |
| 프롬프트 인젝션 완화 | XML 태그 이스케이프 |
| 무한루프 방지 | `type='kakao'` 트리거 skip |

### 10-5. 데이터 수명 (로테이션 정책)

| 테이블 | 보관 기간 | 이유 |
|--------|---------|------|
| `chat_logs` | 14일 후 삭제 | 요약 후 개인정보 파기 |
| `outbox` (sent) | 30일 후 삭제 | 전송 완료 레코드 정리 |
| `outbox` (failed) | 수동 관리 | `UPDATE SET status='pending'`으로 재시도 |
| `chat_log_meta` | 영구 | 날짜별 요약 상태 |
| `documents` | 영구 | 위키 콘텐츠 |

### 10-6. 추가된 파일 목록

```
n-wiki/
├── lib/
│   ├── supabase-admin.ts       Service Role 클라이언트
│   └── bot-auth.ts             X-Bot-Secret / Bearer 검증
├── app/api/
│   ├── bot/
│   │   ├── ingest/route.ts     채팅 수집
│   │   ├── outbox/route.ts     전송 큐 폴링
│   │   ├── outbox/ack/route.ts 전송 완료 보고
│   │   └── command/route.ts    명령어 처리 (신규)
│   └── cron/
│       ├── summarize/route.ts      일일 자동 요약
│       ├── summarize-now/route.ts  즉시 요약 (신규)
│       └── top5/route.ts           Top5 공유
├── bot-script/
│   └── main.js                 봇 스크립트 (명령어 감지 포함)
├── vercel.json                 크론 스케줄 등록
└── docs/
    └── TASKS.md                남은 작업 목록
