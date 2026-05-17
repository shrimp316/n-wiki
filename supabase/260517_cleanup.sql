-- =============================================
-- 260517_cleanup.sql
-- 추가일: 2026-05-17
-- N의 위키 — DB 정리(용량 관리) 스크립트
-- Supabase SQL Editor에서 실행
--
-- 사전 준비:
--   Supabase Dashboard → Database → Extensions 에서
--   `pg_cron` 활성화 (필요 시 `pg_net` 도)
-- =============================================

-- ---------------------------------------------
-- 1. 읽은 알림 30일 경과분 삭제
-- ---------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_old_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  WITH del AS (
    DELETE FROM public.notifications
    WHERE is_read = true
      AND created_at < now() - interval '30 days'
    RETURNING 1
  )
  SELECT count(*) INTO v_deleted FROM del;

  RETURN v_deleted;
END;
$$;

-- ---------------------------------------------
-- 2. 안 읽었어도 너무 오래된 알림(90일) 삭제
--    (선택 — 더 공격적으로 정리하고 싶을 때만 사용)
-- ---------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_stale_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  WITH del AS (
    DELETE FROM public.notifications
    WHERE created_at < now() - interval '90 days'
    RETURNING 1
  )
  SELECT count(*) INTO v_deleted FROM del;

  RETURN v_deleted;
END;
$$;

-- ---------------------------------------------
-- 3. document_versions — 문서별 최근 N개만 유지
--    기본값: 20개
-- ---------------------------------------------
CREATE OR REPLACE FUNCTION public.prune_document_versions(p_keep integer DEFAULT 20)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  WITH ranked AS (
    SELECT id,
           row_number() OVER (
             PARTITION BY document_id
             ORDER BY edited_at DESC
           ) AS rn
    FROM public.document_versions
  ),
  del AS (
    DELETE FROM public.document_versions v
    USING ranked r
    WHERE v.id = r.id AND r.rn > p_keep
    RETURNING 1
  )
  SELECT count(*) INTO v_deleted FROM del;

  RETURN v_deleted;
END;
$$;

-- 권한: cron에서 호출하므로 일반 사용자에겐 실행권 제거
REVOKE ALL ON FUNCTION public.cleanup_old_notifications()    FROM public;
REVOKE ALL ON FUNCTION public.cleanup_stale_notifications()  FROM public;
REVOKE ALL ON FUNCTION public.prune_document_versions(integer) FROM public;


-- =============================================
-- pg_cron 스케줄 등록
--   - 사전 조건: Dashboard → Database → Extensions 에서 `pg_cron` ON
--   - 비활성 상태에서 실행해도 NOTICE만 띄우고 통과
-- =============================================
DO $cron_block$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    RAISE NOTICE 'pg_cron extension is not enabled — skipping cron registration. '
                 'Enable it from Supabase Dashboard → Database → Extensions and re-run.';
    RETURN;
  END IF;

  -- 기존 동일 이름 잡 제거 (재실행 안전)
  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname IN (
    'nwiki_cleanup_notifications',
    'nwiki_cleanup_stale_notifications',
    'nwiki_prune_document_versions'
  );

  -- 매일 04:00 KST = 19:00 UTC (전날 기준)
  PERFORM cron.schedule(
    'nwiki_cleanup_notifications',
    '0 19 * * *',
    $job$ SELECT public.cleanup_old_notifications(); $job$
  );

  -- 매주 일요일 04:00 KST = 토요일 19:00 UTC
  PERFORM cron.schedule(
    'nwiki_cleanup_stale_notifications',
    '0 19 * * 6',
    $job$ SELECT public.cleanup_stale_notifications(); $job$
  );

  -- 매일 04:30 KST = 19:30 UTC
  PERFORM cron.schedule(
    'nwiki_prune_document_versions',
    '30 19 * * *',
    $job$ SELECT public.prune_document_versions(20); $job$
  );
END
$cron_block$;


-- =============================================
-- 점검용 쿼리 (수동 실행)
-- =============================================
-- 현재 스케줄 목록:
--   SELECT jobname, schedule, command FROM cron.job;
-- 최근 실행 이력:
--   SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
-- 수동 즉시 실행:
--   SELECT public.cleanup_old_notifications();
--   SELECT public.prune_document_versions(20);
-- 테이블별 용량 확인:
--   SELECT relname, pg_size_pretty(pg_total_relation_size(relid)) AS size
--   FROM pg_catalog.pg_statio_user_tables
--   ORDER BY pg_total_relation_size(relid) DESC;
