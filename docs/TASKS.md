# N-wiki 봇 시스템 — 남은 작업 목록

> 작성일: 2026-05-17  
> 현재 상태: 서버 코드 완성, DB 미적용, 봇 미설정

---

## 🔴 즉시 필요 (배포 전 필수)

### [ ] T-01. Supabase SQL 실행
- **작업**: Supabase 대시보드 → SQL Editor → `supabase/migrations/260517_001_bot_tables.sql` 전체 붙여넣기 실행
- **생성되는 것**: `chat_logs`, `chat_log_meta`, `outbox`, `bot_state` 테이블 + RPC 2개 + 트리거 1개
- **검증 쿼리**:
  ```sql
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('chat_logs','chat_log_meta','outbox','bot_state');
  -- 4개 행 반환되어야 함
  ```

### [ ] T-02. Supabase bot_state 설정값 등록
- **작업**: Supabase SQL Editor에서 실행 (일반 INSERT — 특별 권한 불필요)
  ```sql
  INSERT INTO bot_state (key, value) VALUES
    ('openchat_room_name', '"정확한채팅방이름"'),
    ('site_url', '"https://your-project.vercel.app"')
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  ```
- **중요**: 이 값이 없으면 새 글 알림 트리거가 작동하지 않음
- **참고**: `ALTER DATABASE SET`은 Supabase에서 권한 오류 발생 → bot_state 테이블 사용으로 변경됨

### [ ] T-03. 환경변수 7개 Vercel 등록
- **작업**: Vercel 대시보드 → 프로젝트 → Settings → Environment Variables
- **등록 목록**:
  ```
  SUPABASE_SERVICE_ROLE_KEY  (Supabase Settings → API → service_role)
  ANTHROPIC_API_KEY          (console.anthropic.com → API Keys)
  BOT_SECRET                 (터미널: openssl rand -hex 32)
  CRON_SECRET                (터미널: openssl rand -hex 32)
  OPENCHAT_ROOM_NAME         (채팅방 정확한 이름)
  SITE_URL                   (https://your-project.vercel.app)
  BOT_AUTHOR_ID              (Supabase profiles 테이블 → 봇 계정 row의 id)
  ```
- **주의**: `NEXT_PUBLIC_` prefix 없이 등록 (서버 전용)

### [ ] T-04. Vercel에 코드 배포 (git push)
- **작업**: `n-wiki/` 디렉터리를 git push → Vercel 자동 배포
- **확인**: Vercel 대시보드에서 빌드 성공 + 크론 등록 확인

### [ ] T-05. 봇 스크립트 설정값 채우기
- **파일**: `n-wiki/bot-script/main.js` 상단 4개 변수
  ```js
  var SERVER_URL  = 'https://실제-vercel-url.vercel.app';
  var BOT_SECRET  = '생성한-BOT_SECRET-값';
  var TARGET_ROOM = '정확한-채팅방-이름';
  var BOT_NAME    = '봇-카카오-닉네임';
  ```

### [ ] T-06. 메신저봇R에 스크립트 등록
- **작업**:
  1. `n-wiki/bot-script/main.js` 전체 복사
  2. 메신저봇R → 스크립트 관리 → 새 스크립트 → 붙여넣기
  3. 컴파일 → 에러 없으면 활성화

---

## 🟡 단계별 검증 (배포 후 순서대로)

### [ ] T-07. 채팅 수집 검증
- 채팅방에 테스트 메시지 전송
- Supabase `chat_logs` 테이블에 row 확인
- `chat_log_meta`에 카운트 증가 확인

### [ ] T-08. outbox → 채팅방 전송 검증
- Supabase SQL Editor에서 수동 INSERT:
  ```sql
  INSERT INTO outbox (type, room, message)
  VALUES ('test', '채팅방이름', '봇 테스트 메시지');
  ```
- 5분 대기 후 채팅방에서 메시지 수신 확인

### [ ] T-09. 일일 요약 크론 수동 테스트
  ```bash
  curl -H "Authorization: Bearer {CRON_SECRET}" \
    https://your-site.vercel.app/api/cron/summarize
  ```
- `documents` 테이블에 요약 글 확인
- 사이트 홈 "카카오톡 담론 요약" 탭에 표시 확인

### [ ] T-10. 즉시 요약 명령어 테스트
  ```bash
  curl -X POST https://your-site.vercel.app/api/bot/command \
    -H "X-Bot-Secret: {BOT_SECRET}" \
    -H "Content-Type: application/json" \
    -d '{"command":"summarize-now","triggered_by":"테스터","room":"채팅방이름"}'
  ```
- `outbox`에 `command-reply` row 확인
- 5분 내 채팅방에서 요약 메시지 수신 확인

### [ ] T-11. Top5 크론 수동 테스트
  ```bash
  curl -H "Authorization: Bearer {CRON_SECRET}" \
    https://your-site.vercel.app/api/cron/top5
  ```
- `outbox`에 `top5` row 확인
- 5분 내 채팅방에서 수신 확인

### [ ] T-12. 새 글 알림 트리거 테스트
- 사이트에서 새 글(type: concept) 발행
- `outbox`에 `new-post-alert` row 자동 생성 확인
- 5분 내 채팅방에서 알림 수신 확인

---

## 🟢 추가 기능 (우선순위 낮음)

### [ ] T-13. 데이터 정리 크론 구현
- **작업**: `n-wiki/app/api/cron/cleanup/route.ts` 생성
  ```typescript
  // chat_logs 14일 후 삭제
  // outbox sent 30일 후 삭제
  ```
- `vercel.json`에 크론 추가: `"0 16 * * *"` (KST 01:00)
- **이유**: Free 플랜은 pg_cron 미지원, Vercel Cron으로 대체 필요

### [ ] T-14. Anthropic 월 한도 설정
- **작업**: console.anthropic.com → Plans → Spend limits → **$10 설정**
- **이유**: 채팅량 폭증 시 비용 폭주 방지

### [ ] T-15. UptimeRobot 설정
- **작업**: uptimerobot.com → Add Monitor → HTTPS → `https://your-site.vercel.app` → 5분 간격
- **이유**: Supabase Free 플랜 7일 미사용 시 자동 일시정지 방지

### [ ] T-16. 봇 폰 물리 설정
- 충전기 상시 연결
- 배터리 최적화 예외: 메신저봇R, 카카오톡
- 알림 접근 권한: 메신저봇R → ON
- 화면 꺼짐 허용, 잠금화면 알림 허용
- Wi-Fi 연결 유지 (데이터 절약 모드 해제)

### [ ] T-17. 명령어 추가 / 커스터마이징
- **파일**: `bot-script/main.js` `parseSmithCommand()` 함수에 if 절 추가
  ```js
  if (msg.indexOf('인기') !== -1) return 'top5';
  if (msg.indexOf('도움') !== -1) return 'help';
  ```
- 서버 `app/api/bot/command/route.ts`에 해당 command 처리 추가
- `SMITH_NAME` 변수로 호출명 변경 가능 (기본값 `'스미스'`)

---

## 📋 작업 현황 요약

| 구분 | 항목 | 상태 |
|------|------|------|
| 서버 코드 | `lib/supabase-admin.ts` | ✅ 완료 |
| 서버 코드 | `lib/bot-auth.ts` | ✅ 완료 |
| 서버 코드 | `POST /api/bot/ingest` | ✅ 완료 |
| 서버 코드 | `GET /api/bot/outbox` | ✅ 완료 |
| 서버 코드 | `POST /api/bot/outbox/ack` | ✅ 완료 |
| 서버 코드 | `POST /api/bot/command` | ✅ 완료 |
| 서버 코드 | `GET /api/cron/summarize` | ✅ 완료 |
| 서버 코드 | `GET /api/cron/summarize-now` | ✅ 완료 |
| 서버 코드 | `GET /api/cron/top5` | ✅ 완료 |
| 설정 | `vercel.json` | ✅ 완료 |
| 봇 스크립트 | `bot-script/main.js` | ✅ 완료 (설정값 미입력) |
| SQL | `supabase/migrations/260517_001_bot_tables.sql` | ⏳ Supabase 실행 필요 |
| SQL | DB 설정값 (room, url) | ⏳ 실행 필요 |
| Vercel | 환경변수 7개 | ⏳ 등록 필요 |
| Vercel | git push 배포 | ⏳ 대기 |
| 봇 | main.js 설정값 채우기 | ⏳ 대기 |
| 봇 | 메신저봇R 스크립트 등록 | ⏳ 대기 |
| 검증 | curl 단계별 테스트 | ⏳ 배포 후 |
| 추가 | cleanup 크론 | 🔵 선택 |
| 추가 | UptimeRobot | 🔵 선택 |
| 추가 | Anthropic 한도 설정 | 🔵 권장 |
