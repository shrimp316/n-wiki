-- ============================================================
-- 001_bot_tables.sql  (rev 3 — Round-2 review fixes applied)
-- depends on: documents, kakao_meta tables already existing
-- assumes: documents.slug has a UNIQUE constraint
-- assumes: kakao_meta.document_id has a UNIQUE constraint
-- ============================================================

-- ── chat_logs ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_logs (
  id         BIGSERIAL PRIMARY KEY,
  log_date   DATE        NOT NULL,
  sender     TEXT        NOT NULL,
  text       TEXT        NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_logs_date ON chat_logs(log_date);

-- RLS: anon/authenticated 접근 차단, service_role만 허용
ALTER TABLE chat_logs ENABLE ROW LEVEL SECURITY;

-- ── chat_log_meta ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_log_meta (
  log_date        DATE    PRIMARY KEY,
  message_count   INT     DEFAULT 0,
  summarized      BOOLEAN DEFAULT FALSE,
  summary_doc_id  UUID,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE chat_log_meta ENABLE ROW LEVEL SECURITY;

-- 원자적 카운터 증가 RPC (TOCTOU 레이스 방지)
CREATE OR REPLACE FUNCTION increment_chat_log_meta(p_date DATE)
RETURNS void AS $$
  INSERT INTO chat_log_meta (log_date, message_count)
  VALUES (p_date, 1)
  ON CONFLICT (log_date)
  DO UPDATE SET message_count = chat_log_meta.message_count + 1;
$$ LANGUAGE sql SECURITY DEFINER;

-- ── outbox ────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE outbox_status AS ENUM ('pending', 'in_flight', 'sent', 'failed');
EXCEPTION WHEN duplicate_object THEN
  BEGIN
    ALTER TYPE outbox_status ADD VALUE IF NOT EXISTS 'in_flight';
  EXCEPTION WHEN others THEN NULL;
  END;
END $$;

CREATE TABLE IF NOT EXISTS outbox (
  id           BIGSERIAL    PRIMARY KEY,
  type         TEXT         NOT NULL,         -- 'top5' | 'new-post-alert' | 'command-reply'
  room         TEXT         NOT NULL,
  message      TEXT         NOT NULL,
  status       outbox_status DEFAULT 'pending',
  attempts     INT          DEFAULT 0,
  dedup_key    TEXT         UNIQUE,            -- 중복 발송 방지
  leased_until TIMESTAMPTZ,                   -- in_flight 임대 만료 시각
  created_at   TIMESTAMPTZ  DEFAULT NOW(),
  sent_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_outbox_status ON outbox(status);
ALTER TABLE outbox ENABLE ROW LEVEL SECURITY;

-- 원자적 outbox 청구 RPC (중복 polling 방지)
-- FOR UPDATE SKIP LOCKED: 동시 호출 시 같은 row를 두 번 lease하지 않음
-- attempts >= 5: 반복 실패 row는 자동 failed 처리 후 건너뜀
CREATE OR REPLACE FUNCTION claim_outbox(p_limit INT DEFAULT 10)
RETURNS SETOF outbox AS $$
  -- 5회 이상 실패한 만료 row 영구 실패 처리
  UPDATE outbox
  SET    status = 'failed'
  WHERE  status = 'in_flight'
     AND leased_until < NOW()
     AND attempts >= 5;

  -- 정상 lease
  UPDATE outbox
  SET    status       = 'in_flight',
         leased_until = NOW() + INTERVAL '2 minutes',
         attempts     = attempts + 1
  WHERE id IN (
    SELECT id FROM outbox
    WHERE  (status = 'pending'
         OR (status = 'in_flight' AND leased_until < NOW()))
       AND attempts < 5
    ORDER BY created_at ASC
    LIMIT  p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$ LANGUAGE sql SECURITY DEFINER;

-- ── bot_state ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bot_state (
  key   TEXT PRIMARY KEY,
  value JSONB
);
ALTER TABLE bot_state ENABLE ROW LEVEL SECURITY;

INSERT INTO bot_state (key, value) VALUES
  ('last_notified_doc_id', 'null'::jsonb),
  ('last_summary_date',    'null'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ── 새 글 알림 트리거 ──────────────────────────────────────
-- 설정값은 ALTER DATABASE 대신 bot_state 테이블에 저장:
--   INSERT INTO bot_state (key, value) VALUES
--     ('openchat_room_name', '"채팅방이름"'),
--     ('site_url', '"https://your-site.vercel.app"')
--   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

CREATE OR REPLACE FUNCTION notify_new_document()
RETURNS TRIGGER AS $$
DECLARE
  v_room TEXT;
  v_url  TEXT;
BEGIN
  -- bot이 생성한 타입이면 알림 skip (무한루프 방지)
  IF NEW.type IN ('kakao', 'bot-summary') THEN
    RETURN NEW;
  END IF;

  IF NEW.status != 'published' THEN
    RETURN NEW;
  END IF;

  -- UPDATE인 경우: 이미 published였으면 중복 알림 skip
  IF TG_OP = 'UPDATE' AND OLD.status = 'published' THEN
    RETURN NEW;
  END IF;

  -- bot_state 테이블에서 설정 읽기 (Supabase는 ALTER DATABASE SET 권한 없음)
  SELECT value #>> '{}' INTO v_room FROM bot_state WHERE key = 'openchat_room_name';
  SELECT value #>> '{}' INTO v_url  FROM bot_state WHERE key = 'site_url';

  IF v_room IS NULL OR v_room = '' THEN
    RETURN NEW;
  END IF;

  INSERT INTO outbox (type, room, message, dedup_key)
  VALUES (
    'new-post-alert',
    v_room,
    '📢 새 글: ' ||
      LEFT(regexp_replace(NEW.title, '[\r\n]+', ' ', 'g'), 100) ||
      E'\n' || COALESCE(v_url, '') || '/wiki/' || NEW.slug,
    'doc:' || NEW.id::TEXT
  )
  ON CONFLICT (dedup_key) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- AFTER INSERT OR UPDATE OF status: draft→published 전환 시에도 알림 발송
DROP TRIGGER IF EXISTS on_new_document ON documents;
CREATE TRIGGER on_new_document
  AFTER INSERT OR UPDATE OF status ON documents
  FOR EACH ROW EXECUTE FUNCTION notify_new_document();

-- ── 데이터 정리 (pg_cron 사용 시 주석 해제) ────────────────
-- chat_logs 14일 후 자동 삭제
-- SELECT cron.schedule('purge-chat-logs', '5 15 * * *',
--   $$DELETE FROM chat_logs WHERE created_at < NOW() - INTERVAL '14 days'$$);

-- outbox sent 30일 후 정리
-- SELECT cron.schedule('purge-outbox-sent', '10 15 * * *',
--   $$DELETE FROM outbox WHERE status = 'sent' AND sent_at < NOW() - INTERVAL '30 days'$$);
