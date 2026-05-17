-- =============================================
-- 260517_rls_fix.sql
-- 추가일: 2026-05-17
-- N의 위키 — RLS WITH CHECK 보강
-- with_check=null 정책들을 명시적으로 보강
-- Supabase SQL Editor에서 순서대로 실행하세요
-- =============================================

-- ---------------------------------------------
-- 1. profiles_update
--   기존: USING (auth.uid() = id), WITH CHECK 누락
--   조치: 새 행도 본인 id여야 변경 가능하도록 명시
-- ---------------------------------------------
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ---------------------------------------------
-- 2. documents_update
--   조치: author_id 이전(타인에게 양도) 차단을 명시
-- ---------------------------------------------
DROP POLICY IF EXISTS "documents_update" ON public.documents;
CREATE POLICY "documents_update" ON public.documents
  FOR UPDATE
  USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);

-- ---------------------------------------------
-- 3. discussions_update
--   조치: 작성자가 author_id를 타인으로 변경하지 못하도록
-- ---------------------------------------------
DROP POLICY IF EXISTS "discussions_update" ON public.discussions;
CREATE POLICY "discussions_update" ON public.discussions
  FOR UPDATE
  USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);

-- ---------------------------------------------
-- 4. discussions_admin_update
--   기존: USING은 admin 체크, WITH CHECK 누락 → admin이 author_id 변조 가능
--   조치: WITH CHECK도 admin이어야 한다고 명시
--         (admin은 author_id를 포함한 모든 필드 수정 가능하다는 의도 유지)
-- ---------------------------------------------
DROP POLICY IF EXISTS "discussions_admin_update" ON public.discussions;
CREATE POLICY "discussions_admin_update" ON public.discussions
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- ---------------------------------------------
-- 5. kakao_meta_write  (FOR ALL → INSERT/UPDATE/DELETE 모두 커버)
--   조치: ALL 정책은 INSERT 시 WITH CHECK가 핵심.
--         새 행의 document_id 소유자가 본인이어야 INSERT/UPDATE 가능.
-- ---------------------------------------------
DROP POLICY IF EXISTS "kakao_meta_write" ON public.kakao_meta;
CREATE POLICY "kakao_meta_write" ON public.kakao_meta
  FOR ALL
  USING (
    auth.uid() = (SELECT author_id FROM public.documents WHERE id = document_id)
  )
  WITH CHECK (
    auth.uid() = (SELECT author_id FROM public.documents WHERE id = document_id)
  );

-- ---------------------------------------------
-- 6. notifications_own  (FOR ALL)
--   기존: USING (auth.uid() = user_id), WITH CHECK 누락
--   현실 제약: app/discussions/[id]/page.tsx 가 다른 사용자(발제자/참가자)에게
--             직접 INSERT 하고 있음 → INSERT를 본인 한정으로 막으면 깨짐
--
--   조치(보수): 본인 SELECT/UPDATE/DELETE 만 본인 한정으로 명시.
--               INSERT 는 별도 정책으로 분리해 WITH CHECK (true) 로 명시.
--               (보안 수준은 기존과 동일하되 with_check=null 상태는 제거)
--   권장 후속: 알림 생성을 SECURITY DEFINER 함수로 캡슐화하고
--             notifications_insert 정책을 제거하여 직접 INSERT 차단.
--             (아래 7번 함수 참고)
-- ---------------------------------------------
DROP POLICY IF EXISTS "notifications_own" ON public.notifications;

CREATE POLICY "notifications_select" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "notifications_update" ON public.notifications
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "notifications_delete" ON public.notifications
  FOR DELETE USING (auth.uid() = user_id);

-- 기존 코드 호환용. 누구나 누구에게나 INSERT 가능(기존과 동일한 보안 수준).
-- 안전 강화 시 이 정책을 제거하고 아래 create_notification() 함수 사용.
CREATE POLICY "notifications_insert" ON public.notifications
  FOR INSERT
  WITH CHECK (true);

-- ---------------------------------------------
-- 7. (선택) SECURITY DEFINER 함수 — 안전한 알림 생성 경로
--   사용 예: supabase.rpc('create_notification', { ... })
--   클라이언트가 직접 INSERT 하는 대신 이 함수를 호출하도록 마이그레이션 권장.
--   이 함수 채택 후 위 notifications_insert 정책은 DROP.
-- ---------------------------------------------
CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id uuid,
  p_type text,
  p_message text,
  p_discussion_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_caller uuid := auth.uid();
  v_is_participant boolean;
  v_is_author boolean;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  -- 발신자가 해당 토론의 참가자이거나 발제자일 때만 알림 생성 허용
  SELECT EXISTS (
    SELECT 1 FROM public.discussion_participants
    WHERE discussion_id = p_discussion_id AND user_id = v_caller
  ) INTO v_is_participant;

  SELECT EXISTS (
    SELECT 1 FROM public.discussions
    WHERE id = p_discussion_id AND author_id = v_caller
  ) INTO v_is_author;

  IF NOT (v_is_participant OR v_is_author) THEN
    RAISE EXCEPTION 'not allowed to notify for this discussion';
  END IF;

  INSERT INTO public.notifications (user_id, type, message, discussion_id)
  VALUES (p_user_id, p_type, p_message, p_discussion_id)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_notification(uuid, text, text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.create_notification(uuid, text, text, uuid) TO authenticated;
