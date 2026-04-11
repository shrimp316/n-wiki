'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Navbar from '@/components/Navbar'
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

// [[문서명]] → <a> 위키 링크 변환
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

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id || null))
    loadDoc()
  }, [slug])

  async function loadDoc() {
    const { data, error } = await supabase
      .from('documents')
      .select(`
        *,
        profiles!documents_author_id_fkey(nickname),
        kakao_meta(talk_date, participants)
      `)
      .eq('slug', slug)
      .single()

    if (error) console.error('loadDoc error:', error)
    if (!data) { router.push('/'); return }
    setDoc(data as DocWithMeta)

    if (data.type === 'discussion') {
      const { data: persp } = await supabase
        .from('discussion_perspectives')
        .select('*, profiles(nickname)')
        .eq('document_id', data.id)
        .order('display_order', { ascending: true })
      setPerspectives((persp as PerspectiveWithProfile[]) || [])
    }
    setLoading(false)
  }

  async function handleDelete() {
    if (!doc || !confirm('문서를 삭제할까요?')) return
    await supabase.from('documents').delete().eq('id', doc.id)
    router.push('/')
  }

  const formatDate = (s: string) => {
    const d = new Date(s)
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  }

  const typeLabel = doc?.type === 'kakao' ? '카카오톡 담론 요약' : doc?.type === 'concept' ? '개념 문서' : '토론 문서'
  const backHref = '/'
  const canEdit = userId === doc?.author_id

  if (loading) return (
    <>
      <Navbar />
      <main style={{ maxWidth: '720px', margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ color: '#A8A29E', fontSize: '13px' }}>불러오는 중...</div>
      </main>
    </>
  )

  if (!doc) return null

  return (
    <>
      <Navbar />
      <main style={{ maxWidth: '720px', margin: '0 auto', padding: '32px 24px' }}>

        {/* 뒤로 가기 */}
        <Link href={backHref} style={{ fontSize: '13px', color: '#A8A29E', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px', marginBottom: '24px' }}>
          ← {typeLabel}
        </Link>

        {/* 문서 헤더 */}
        <div style={{ marginBottom: '24px' }}>
          {doc.type === 'kakao' && doc.kakao_meta?.[0] && (
            <p style={{ fontSize: '12px', color: '#A8A29E', marginBottom: '6px' }}>
              {doc.kakao_meta[0].talk_date}
            </p>
          )}
          <h1 style={{ fontSize: '24px', fontWeight: 600, color: '#1C1917', letterSpacing: '-0.4px', marginBottom: '10px', lineHeight: 1.3 }}>
            {doc.title}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingBottom: '16px', borderBottom: '1px solid #E7E5E4' }}>
            <span style={{ fontSize: '12px', color: '#A8A29E' }}>
              {doc.profiles?.nickname} · {formatDate(doc.created_at)}
            </span>
            {doc.tags?.map(tag => (
              <span key={tag} style={{ fontSize: '11px', background: '#F5F5F4', color: '#78716C', padding: '2px 8px', borderRadius: '10px' }}>
                #{tag}
              </span>
            ))}
            {canEdit && (
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                <Link href={`/wiki/${slug}/edit`} style={{ fontSize: '12px', color: '#78716C', textDecoration: 'none', padding: '4px 10px', border: '1px solid #E7E5E4', borderRadius: '6px' }}>
                  수정
                </Link>
                <button onClick={handleDelete} style={{ fontSize: '12px', color: '#DC2626', background: 'none', border: '1px solid #FCA5A5', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit' }}>
                  삭제
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 본문 */}
        <div
          className="wiki-body"
          style={{ marginBottom: '32px', lineHeight: 1.8 }}
          dangerouslySetInnerHTML={{ __html: parseWikiLinks(doc.body) }}
        />

        {/* 토론 문서: 관점 항목 */}
        {doc.type === 'discussion' && perspectives.length > 0 && (
          <div style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#1C1917', marginBottom: '16px', paddingBottom: '10px', borderBottom: '1px solid #E7E5E4' }}>
              관점
            </h2>
            {perspectives.map(p => (
              <div key={p.id} style={{ marginBottom: '20px', padding: '16px', background: '#FAFAF9', border: '1px solid #E7E5E4', borderRadius: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#1C1917', background: '#F5F5F4', padding: '2px 10px', borderRadius: '10px' }}>
                    {p.label}
                  </span>
                  <span style={{ fontSize: '11px', color: '#A8A29E' }}>
                    {p.profiles?.nickname}
                  </span>
                </div>
                <div className="wiki-body" dangerouslySetInnerHTML={{ __html: parseWikiLinks(p.body) }} />
              </div>
            ))}
          </div>
        )}

        {/* 좋아요 (개념/토론만) */}
        {(doc.type === 'concept' || doc.type === 'discussion') && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingBottom: '24px', borderBottom: '1px solid #E7E5E4' }}>
            <LikeButton documentId={doc.id} initialCount={doc.like_count} />
            <span style={{ fontSize: '12px', color: '#A8A29E' }}>이 문서가 도움이 됐다면 좋아요를 눌러주세요</span>
          </div>
        )}

        {/* 댓글 (개념/토론만) */}
        {(doc.type === 'concept' || doc.type === 'discussion') && (
          <Comments documentId={doc.id} />
        )}

      </main>
    </>
  )
}
