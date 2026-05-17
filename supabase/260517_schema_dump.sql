-- ============================================================
-- 260517_schema_dump.sql
-- 추가일: 2026-05-17
-- 출처: resource/260517_sql/260517_sql_원본.sql (Supabase 스키마 덤프)
--
-- !! 참고용 — 실행 금지 !!
-- Table 순서·제약 조건이 실행 가능한 순서로 정렬되어 있지 않습니다.
-- DB 복원이 필요하다면 Supabase 대시보드 → Backups 기능을 사용하세요.
-- ============================================================

-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.comments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  document_id uuid,
  parent_id uuid,
  content text NOT NULL,
  author_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone,
  CONSTRAINT comments_pkey PRIMARY KEY (id),
  CONSTRAINT comments_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id),
  CONSTRAINT comments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.comments(id),
  CONSTRAINT comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.debate_agrees (
  post_id uuid NOT NULL,
  user_id uuid NOT NULL,
  CONSTRAINT debate_agrees_pkey PRIMARY KEY (post_id, user_id),
  CONSTRAINT debate_agrees_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.debate_posts(id),
  CONSTRAINT debate_agrees_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.debate_posts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  discussion_id uuid,
  parent_id uuid,
  post_type text NOT NULL DEFAULT 'argument'::text CHECK (post_type = ANY (ARRAY['argument'::text, 'rebuttal'::text, 'question'::text])),
  content text NOT NULL,
  author_id uuid,
  stance text,
  agree_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT debate_posts_pkey PRIMARY KEY (id),
  CONSTRAINT debate_posts_discussion_id_fkey FOREIGN KEY (discussion_id) REFERENCES public.discussions(id),
  CONSTRAINT debate_posts_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.debate_posts(id),
  CONSTRAINT debate_posts_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.discussion_participants (
  discussion_id uuid NOT NULL,
  user_id uuid NOT NULL,
  stance text NOT NULL,
  joined_at timestamp with time zone DEFAULT now(),
  CONSTRAINT discussion_participants_pkey PRIMARY KEY (discussion_id, user_id),
  CONSTRAINT discussion_participants_discussion_id_fkey FOREIGN KEY (discussion_id) REFERENCES public.discussions(id),
  CONSTRAINT discussion_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.discussion_perspectives (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  document_id uuid,
  label text NOT NULL,
  body text NOT NULL DEFAULT ''::text,
  author_id uuid,
  display_order integer DEFAULT 0,
  CONSTRAINT discussion_perspectives_pkey PRIMARY KEY (id),
  CONSTRAINT discussion_perspectives_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id),
  CONSTRAINT discussion_perspectives_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.discussions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL DEFAULT ''::text,
  format text NOT NULL DEFAULT 'pros_cons'::text CHECK (format = ANY (ARRAY['pros_cons'::text, 'multi'::text])),
  status text NOT NULL DEFAULT 'recruiting'::text CHECK (status = ANY (ARRAY['active'::text, 'paused'::text, 'ended'::text])),
  author_id uuid,
  tags ARRAY DEFAULT '{}'::text[],
  recruit_deadline timestamp with time zone,
  end_at timestamp with time zone,
  max_participants integer,
  created_at timestamp with time zone DEFAULT now(),
  is_draft boolean NOT NULL DEFAULT false,
  started_at timestamp with time zone DEFAULT now(),
  notice text,
  CONSTRAINT discussions_pkey PRIMARY KEY (id),
  CONSTRAINT discussions_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.document_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  document_id uuid,
  body text NOT NULL,
  edited_by uuid,
  edited_at timestamp with time zone DEFAULT now(),
  CONSTRAINT document_versions_pkey PRIMARY KEY (id),
  CONSTRAINT document_versions_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id),
  CONSTRAINT document_versions_edited_by_fkey FOREIGN KEY (edited_by) REFERENCES public.profiles(id)
);
CREATE TABLE public.documents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  type text NOT NULL CHECK (type = ANY (ARRAY['kakao'::text, 'concept'::text, 'discussion'::text])),
  body text NOT NULL DEFAULT ''::text,
  status text NOT NULL DEFAULT 'published'::text CHECK (status = ANY (ARRAY['published'::text, 'draft'::text])),
  author_id uuid,
  tags ARRAY DEFAULT '{}'::text[],
  like_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT documents_pkey PRIMARY KEY (id),
  CONSTRAINT documents_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.extension_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  discussion_id uuid,
  user_id uuid,
  stance text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT extension_requests_pkey PRIMARY KEY (id),
  CONSTRAINT extension_requests_discussion_id_fkey FOREIGN KEY (discussion_id) REFERENCES public.discussions(id),
  CONSTRAINT extension_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.kakao_meta (
  document_id uuid NOT NULL,
  talk_date date,
  participants ARRAY DEFAULT '{}'::text[],
  CONSTRAINT kakao_meta_pkey PRIMARY KEY (document_id),
  CONSTRAINT kakao_meta_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id)
);
CREATE TABLE public.likes (
  document_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT likes_pkey PRIMARY KEY (document_id, user_id),
  CONSTRAINT likes_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id),
  CONSTRAINT likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  type text NOT NULL,
  message text NOT NULL,
  discussion_id uuid,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT notifications_pkey PRIMARY KEY (id),
  CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT notifications_discussion_id_fkey FOREIGN KEY (discussion_id) REFERENCES public.discussions(id)
);
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  nickname text NOT NULL UNIQUE,
  email text,
  interests ARRAY DEFAULT '{}'::text[],
  created_at timestamp with time zone DEFAULT now(),
  is_admin boolean NOT NULL DEFAULT false,
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.wiki_links (
  source_slug text NOT NULL,
  target_slug text NOT NULL,
  CONSTRAINT wiki_links_pkey PRIMARY KEY (source_slug, target_slug)
);
