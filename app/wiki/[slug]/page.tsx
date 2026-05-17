'use client'
// 적용 위치: app/wiki/[slug]/page.tsx

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import AppHeader from '@/components/AppHeader'
import Sidebar from '@/components/Sidebar'
import Comments from '@/components/Comments'
import LikeButton from '@/components/LikeButton'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Document, DiscussionPerspective } from '@/lib/supabase'

type DocWithMeta = Document & {
  profiles?: { nickname: string }
  kakao_meta?: Array<{ talk_date: string; participants: string[] }>
}
type PerspectiveWithProfile = DiscussionPerspective & {
  profiles?: { nickname: string }
}

function parseWikiLinks(html: string): string {
  return html.replace(/\[\[(.+?)\]\]/g, (_, name) => {
    const slug = encodeURIComponent(name.trim())
    return `<a href="/wiki/${slug}" class="wiki-link">${name.trim()}</a>`
  })
}

export default function WikiPage({ params }: { params: { slug: string } }) {
  const slug = decodeURIComponent(params.slug)
  const supabase = createClient()
  const router = useRouter()

  const [doc, setDoc] = useState<DocWithMeta | null>(null)
  const [perspectives, setPerspectives] = useState<PerspectiveWithProfile[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id || null))
    loadDoc()
  }, [slug])

  async function loadDoc() {
    const { data, error } = await supabase
      .from('documents')
      .select('*, profiles!documents_author_id_fkey(nickname), kakao_meta(talk_date, participants)')
      .eq('slug', slug).single()
    if (error) console.error('loadDoc error:', error)
    if (!data) { router.push('/'); return }
    setDoc(data as DocWithMeta)
    if (data.type === 'discussion') {
      const { data: persp } = await supabase
        .from('discussion_perspectives').select('*, profiles(nickname)')
        .eq('document_id', data.id).order('display_order', { ascending: true })
      setPerspectives((persp as PerspectiveWithProfile[]) || [])
    }
    setLoading(false)
  }

  async function handleDelete() {
    if (!doc || !confirm('문서를 삭제할까요?')) return
    await supabase.from('documents').delete().eq('id', doc.id)
    router.push('/')
  }

  const fmt = (s: string) => {
    const d = new Date(s)
    return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`
  }

  const typeLabel =
    doc?.type === 'kakao' ? '카카오톡 담론 요약' :
    doc?.type === 'concept' ? '개념 문서' : '토론 문서'
  const canEdit = userId === doc?.author_id

  const bg = { minHeight: '100dvh', background: 'linear-gradient(160deg, #b8dcf8 0%, #c5eee8 100%)' }

  if (loading) return (
    <div style={bg}>
      <AppHeader onMenuOpen={() => setSidebarOpen(true)} title="불러오는 중..." />
      <div style={{ padding: '48px', textAlign: 'center', color: '#8faec8', fontSize: '13px' }}>불러오는 중...</div>
    </div>
  )
  if (!doc) return null

  return (
    <div style={bg}>
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activeTab="home"
        onTabChange={() => { router.push('/'); setSidebarOpen(false) }}
      />
      <AppHeader onMenuOpen={() => setSidebarOpen(true)} title={typeLabel} />

      <main style={{ maxWidth: '720px', margin: '0 auto', padding: '16px 16px 48px' }}>

        {/* 뒤로 가기 */}
        <Link href="/" style={{ fontSize: '13px', color: '#5a7a9a', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px', marginBottom: '16px' }}>
          ← {typeLabel}
        </Link>

        {/* 문서 본문 카드 */}
        <div style={card}>
          {doc.type === 'kakao' && doc.kakao_meta?.[0] && (
            <p style={{ fontSize: '12px', color: '#8faec8', marginBottom: '6px' }}>
              {doc.kakao_meta[0].talk_date}
            </p>
          )}
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#0d1f3c', letterSpacing: '-0.4px', marginBottom: '10px', lineHeight: 1.35 }}>
            {doc.title}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '16px', borderBottom: '1px solid rgba(100,150,200,0.18)', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', color: '#8faec8' }}>
              {doc.profiles?.nickname} · {fmt(doc.created_at)}
            </span>
            {doc.tags?.map(tag => (
              <span key={tag} style={{ fontSize: '11px', background: 'rgba(26,140,245,0.10)', color: '#1a8cf5', padding: '2px 8px', borderRadius: '10px' }}>
                #{tag}
              </span>
            ))}
            {canEdit && (
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                <Link href={`/wiki/${slug}/edit`} style={{ fontSize: '12px', color: '#5a7a9a', textDecoration: 'none', padding: '4px 10px', border: '1px solid rgba(100,150,200,0.25)', borderRadius: '8px' }}>
                  수정
                </Link>
                <button onClick={handleDelete} style={{ fontSize: '12px', color: '#DC2626', background: 'none', border: '1px solid #FCA5A5', borderRadius: '8px', padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit' }}>
                  삭제
                </button>
              </div>
            )}
          </div>
          <div
            className="wiki-body"
            style={{ marginTop: '20px', lineHeight: 1.85 }}
            dangerouslySetInnerHTML={{ __html: parseWikiLinks(doc.body) }}
          />
        </div>

        {/* 토론 관점 (토론 문서일 때) */}
        {doc.type === 'discussion' && perspectives.length > 0 && (
          <div style={{ marginTop: '12px' }}>
            <h2 style={{ fontSize: '14px', fontWeight: 600, color: '#0d1f3c', marginBottom: '10px' }}>관점</h2>
            {perspectives.map(p => (
              <div key={p.id} style={{ marginBottom: '10px', padding: '16px', background: 'rgba(255,255,255,0.70)', border: '1px solid rgba(255,255,255,0.6)', borderRadius: '14px' }}>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#1a8cf5', background: 'rgba(26,140,245,0.10)', padding: '2px 10px', borderRadius: '10px' }}>
                    {p.label}
                  </span>
                  <span style={{ fontSize: '11px', color: '#8faec8' }}>{p.profiles?.nickname}</span>
                </div>
                <div className="wiki-body" dangerouslySetInnerHTML={{ __html: parseWikiLinks(p.body) }} />
              </div>
            ))}
          </div>
        )}

        {/* 좋아요 (개념·토론 문서만) */}
        {(doc.type === 'concept' || doc.type === 'discussion') && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', background: 'rgba(255,255,255,0.70)', border: '1px solid rgba(255,255,255,0.6)', borderRadius: '14px', marginTop: '12px' }}>
            <LikeButton documentId={doc.id} initialCount={doc.like_count} />
            <span style={{ fontSize: '12px', color: '#8faec8' }}>이 문서가 도움이 됐다면 좋아요를 눌러주세요</span>
          </div>
        )}

        {/* ── 댓글: 카카오 담론 포함 모든 문서 ── */}
        <div style={{ marginTop: '12px', ...card }}>
          <Comments documentId={doc.id} />
        </div>

      </main>
    </div>
  )
}

const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.85)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: '1px solid rgba(255,255,255,0.65)',
  borderRadius: '18px',
  padding: '24px',
}
