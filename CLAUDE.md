# CLAUDE.md

> Claude Code가 이 프로젝트 작업 시 참고하는 가이드  
> 최종 수정: 2026-05-17

## 명령어

```bash
npm run dev      # 개발 서버 시작 (http://localhost:3000)
npm run build    # 프로덕션 빌드
npm run lint     # ESLint
```

필수 `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

봇 시스템 추가 환경변수 (서버 전용, `NEXT_PUBLIC_` 없이):
```
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
BOT_SECRET=
CRON_SECRET=
OPENCHAT_ROOM_NAME=
SITE_URL=
BOT_AUTHOR_ID=
```

---

## 아키텍처

**N의 위키**는 Next.js 14 App Router + Supabase(Postgres + Auth + Realtime) PWA.

### 데이터 흐름

모든 페이지는 `'use client'` 컴포넌트로 `lib/supabase.ts`의 `createClient()`로 Supabase에 직접 접근.  
서버 API 라우트는 두 종류:
1. `app/auth/callback/route.ts` — OAuth 코드 교환 (기존)
2. `app/api/bot/`, `app/api/cron/` — 봇 시스템 (신규)

TypeScript 타입(`Profile`, `Document`, `Discussion` 등)은 `lib/supabase.ts`에 co-locate.

### 콘텐츠 모델

`documents` 테이블이 type으로 구분:
- `kakao` — 카카오톡 담론 AI 요약 (봇이 자동 생성, `kakao_meta` 조인)
- `concept` — 개념 문서
- `discussion` — 관점 문서

실시간 토론은 별도 `discussions` 테이블 (`format: 'pros_cons' | 'multi'`).

### 봇 시스템 API 라우트

```
app/api/bot/
  ingest/route.ts      POST  채팅 수집 (X-Bot-Secret 인증)
  outbox/route.ts      GET   전송 큐 폴링 (X-Bot-Secret 인증)
  outbox/ack/route.ts  POST  전송 완료 보고 (X-Bot-Secret 인증)
  command/route.ts     POST  명령어 처리 (X-Bot-Secret 인증)

app/api/cron/
  summarize/route.ts      GET  일일 자동 요약 (Bearer 인증)
  summarize-now/route.ts  GET  즉시 요약 — 명령어 연동 (Bearer 인증)
  top5/route.ts           GET  Top5 공유 (Bearer 인증)
```

공통 유틸:
- `lib/supabase-admin.ts` — Service Role 클라이언트 (RLS 우회, 서버 전용)
- `lib/bot-auth.ts` — `verifyBotSecret()`, `verifyCronSecret()` (타이밍 공격 방지)

### 봇 스크립트 명령어 트리거

`bot-script/main.js`에서 "스미스" 호출명 감지 후 명령 파싱:
- `"스미스 + 요약"` → `command: 'summarize-now'` → `/api/bot/command`
- 추후: `"스미스 + 인기"` → `command: 'top5'` 등으로 확장 가능

### 주요 패턴

**위키 링크** — `[[문서명]]` 문법을 `app/wiki/[slug]/page.tsx`의 `parseWikiLinks()`가 클라이언트에서 파싱.

**리치 에디터** — `components/QuillEditor.tsx`는 `dynamic(..., { ssr: false })`로 항상 로드.

**실시간** — `app/discussions/[id]/page.tsx`가 `postgres_changes`를 Supabase 채널로 구독.

**관리자** — `profiles.is_admin`이 토론 관리 권한 제어.

### DB 마이그레이션

봇 시스템 테이블 생성:
```
supabase/migrations/260517_001_bot_tables.sql
```
Supabase SQL Editor에서 실행 후 bot_state에 설정값 등록:
```sql
INSERT INTO bot_state (key, value) VALUES
  ('openchat_room_name', '"채팅방이름"'),
  ('site_url', '"https://your-site.vercel.app"')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
```

### 라우팅

| 경로 | 용도 |
|------|------|
| `/` | 홈 — 카카오담론/개념문서/토론 3탭 |
| `/wiki/[slug]` | 문서 상세 |
| `/wiki/new?type=` | 문서 작성 |
| `/wiki/[slug]/edit` | 문서 수정 |
| `/discussions/[id]` | 실시간 토론 |
| `/discussions/new` | 토론 생성 |
| `/search` | 통합 검색 |

### 스타일

인라인 스타일 위주. Tailwind는 설정만 있고 미사용.  
기존 컴포넌트에 Tailwind 클래스 추가 지양.

---

## 상세 문서

- `docs/architecture.md` — 전체 아키텍처 (DB 스키마, 봇 시스템 포함)
- `docs/TASKS.md` — 남은 작업 체크리스트
- `bot-script/OPERATIONS.md` — 봇 운영 매뉴얼
