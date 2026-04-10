import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export type Profile = {
  id: string
  nickname: string
  email: string
  interests: string[]
  created_at: string
}

export type Document = {
  id: string
  slug: string
  title: string
  type: 'kakao' | 'concept' | 'discussion'
  body: string
  status: 'published' | 'draft'
  author_id: string
  tags: string[]
  like_count: number
  created_at: string
  updated_at: string
  profiles?: { nickname: string }
  kakao_meta?: { talk_date: string; participants: string[] }
}

export type Comment = {
  id: string
  document_id: string
  parent_id: string | null
  content: string
  author_id: string
  created_at: string
  updated_at: string | null
  profiles?: { nickname: string }
}

export type DiscussionPerspective = {
  id: string
  document_id: string
  label: string
  body: string
  author_id: string
  display_order: number
  profiles?: { nickname: string }
}

export type Discussion = {
  id: string
  title: string
  body: string
  format: 'pros_cons' | 'multi'
  status: 'active' | 'paused' | 'ended'
  author_id: string
  tags: string[]
  end_at: string | null
  started_at: string
  created_at: string
  notice: string | null
  profiles?: { nickname: string }
  discussion_participants?: DiscussionParticipant[]
}

export type Notification = {
  id: string
  user_id: string
  type: string
  message: string
  discussion_id: string
  is_read: boolean
  created_at: string
}

export type ExtensionRequest = {
  id: string
  discussion_id: string
  user_id: string
  stance: string
  created_at: string
  profiles?: { nickname: string }
}

export type DiscussionParticipant = {
  discussion_id: string
  user_id: string
  stance: string
  joined_at: string
  profiles?: { nickname: string }
}

export type DebatePost = {
  id: string
  discussion_id: string
  parent_id: string | null
  post_type: 'argument' | 'rebuttal' | 'question'
  content: string
  author_id: string
  stance: string | null
  agree_count: number
  created_at: string
  profiles?: { nickname: string }
}
