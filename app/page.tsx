'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import Navbar from '@/components/Navbar'
import Link from 'next/link'
import type { Document, Discussion } from '@/lib/supabase'

type DocWithMeta = Document & {
  profiles?: { nickname: string }
  kakao_meta?: Array<{ talk_date: string; participants: string[] }>
}

type DiscussionWithCount = Discussion & {
  profiles?: { nickname: string }
  participant_count: number
}

type TabType = 'kakao' | 'concept' | 'discussion'

const TABS: { id: TabType; label: string; desc: string }[] = [
  { id: 'kakao',      label: '카카오톡 담론 요약', desc: '날짜별 주요 담론 아카이브' },
  { id: 'concept',    label: '개념 문서',          desc: '용어·이론·인물 정리' },
  { id: 'discussion', label: '토론',               desc: '발제하고 실시간으로 토론하세요' },
]

const STATUS_MAP: Record<string, { label: string; color: string; dot: string }> = {
  active:  { label: '진행중', color: '#065F46', dot: '#10B981' },
  paused:  { label: '일시정지', color: '#92400E', dot: '#F59E0B' },
  ended:   { label: '종료됨', color: '#44403C', dot: '#A8A29E' },
}

export default function HomePage() {
  const supabase = createClient()
  const [tab, setTab] = useState<TabType>('kakao')
  const [docs, setDocs] = useState<DocWithMeta[]>([])
  const [discussions, setDiscussions] = useState<DiscussionWithCount[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id || null))
  }, [])

  useEffect(() => {
    if (tab === 'discussion') loadDiscussions()
    else loadDocs()
  }, [tab])

  async function loadDocs() {
    setLoading(true)
    const { data, error } = await supabase
      .from('documents')
      .select('*, profiles!documents_author_id_fkey(nickname), kakao_meta(talk_date, participants)')
      .eq('type', tab)
      .eq('status', 'published')
      .order('created_at', { ascending: false })
    if (error) console.error('loadDocs error:', error)
    setDocs((data as DocWithMeta[]) || [])
    setLoading(false)
  }

  async function loadDiscussions() {
    setLoading(true)
    const { data, error } = await supabase
      .from('discussions')
      .select('*, profiles!discussions_author_id_fkey(nickname), discussion_participants(user_id)')
      .order('created_at', { ascending: false })
    if (error) console.error('loadDiscussions error:', error)
    const mapped = (data || []).map(d => ({
      ...d,
      participant_count: (d.discussion_participants || []).length,
    })) as DiscussionWithCount[]
    setDiscussions(mapped)
    setLoading(false)
  }

  const formatDate = (s: string) => {
    const d = new Date(s)
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  }

  function timeRemaining(deadline: string | null) {
    if (!deadline) return null
    const diff = new Date(deadline).getTime() - Date.now()
    if (diff <= 0) return null
    const h = Math.floor(diff / 3600000)
    const m = Math.floor((diff % 3600000) / 60000)
    return h > 0 ? `${h}시간 ${m}분 남음` : `${m}분 남음`
  }

  return (
    <>
      <Navbar />
      <main style={{ maxWidth: '720px', margin: '0 auto', padding: '32px 24px' }}>

        {/* 탭 */}
        <div style={{ display: 'flex', borderBottom: '1px solid #E7E5E4', marginBottom: '28px' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '10px 18px', fontSize: '13px',
              fontWeight: tab === t.id ? 600 : 400,
              color: tab === t.id ? '#1C1917' : '#A8A29E',
              background: 'none', border: 'none',
              borderBottom: tab === t.id ? '2px solid #1C1917' : '2px solid transparent',
              cursor: 'pointer', fontFamily: 'inherit',
              marginBottom: '-1px', transition: 'all 0.15s',
            }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* 설명 + 액션 버튼 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <p style={{ fontSize: '12px', color: '#A8A29E' }}>
            {TABS.find(t => t.id === tab)?.desc}
          </p>
          {userId && (
            tab === 'discussion' ? (
              <Link href="/discussions/new" style={actionBtnStyle}>+ 발제하기</Link>
            ) : (
              <Link href={`/wiki/new?type=${tab}`} style={actionBtnStyle}>+ 작성하기</Link>
            )
          )}
        </div>

        {/* ── 카카오 / 개념 문서 목록 ── */}
        {tab !== 'discussion' && (
          loading ? (
            <div style={emptyStyle}>불러오는 중...</div>
          ) : docs.length === 0 ? (
            <div style={{ padding: '48px 0', textAlign: 'center' }}>
              <p style={{ fontSize: '14px', color: '#A8A29E', marginBottom: '12px' }}>아직 문서가 없어요</p>
              {userId && (
                <Link href={`/wiki/new?type=${tab}`} style={{ fontSize: '13px', color: '#1C1917', textDecoration: 'underline', textUnderlineOffset: '2px' }}>
                  첫 문서를 작성해보세요
                </Link>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {docs.map(doc => (
                <Link key={doc.id} href={`/wiki/${doc.slug}`} style={{ textDecoration: 'none' }}>
                  <div
                    style={{ padding: '16px', background: '#FFFFFF', border: '1px solid #E7E5E4', borderRadius: '10px', transition: 'border-color 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = '#A8A29E')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = '#E7E5E4')}
                  >
                    {tab === 'kakao' && doc.kakao_meta?.[0] && (
                      <span style={{ fontSize: '11px', color: '#A8A29E', display: 'block', marginBottom: '4px' }}>
                        {doc.kakao_meta[0].talk_date}
                      </span>
                    )}
                    <h2 style={{ fontSize: '15px', fontWeight: 500, color: '#1C1917', marginBottom: '6px', lineHeight: 1.4 }}>
                      {doc.title}
                    </h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      {doc.tags?.slice(0, 3).map(tag => (
                        <span key={tag} style={{ fontSize: '11px', color: '#A8A29E' }}>#{tag}</span>
                      ))}
                      <span style={{ fontSize: '11px', color: '#A8A29E', marginLeft: 'auto' }}>
                        {doc.profiles?.nickname} · {formatDate(doc.created_at)}
                      </span>
                      {doc.like_count > 0 && (
                        <span style={{ fontSize: '11px', color: '#A8A29E' }}>♥ {doc.like_count}</span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )
        )}

        {/* ── 토론 목록 ── */}
        {tab === 'discussion' && (
          loading ? (
            <div style={emptyStyle}>불러오는 중...</div>
          ) : discussions.length === 0 ? (
            <div style={{ padding: '48px 0', textAlign: 'center' }}>
              <p style={{ fontSize: '14px', color: '#A8A29E', marginBottom: '12px' }}>아직 토론이 없어요</p>
              {userId && (
                <Link href="/discussions/new" style={{ fontSize: '13px', color: '#1C1917', textDecoration: 'underline', textUnderlineOffset: '2px' }}>
                  첫 토론을 발제해보세요
                </Link>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {discussions.map(d => {
                const st = STATUS_MAP[d.status] || STATUS_MAP.ended
                const remaining = d.status === 'active' ? timeRemaining(d.end_at) : null

                return (
                  <Link key={d.id} href={`/discussions/${d.id}`} style={{ textDecoration: 'none' }}>
                    <div
                      style={{ padding: '16px 18px', background: '#FFFFFF', border: '1px solid #E7E5E4', borderRadius: '10px', transition: 'border-color 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = '#A8A29E')}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = '#E7E5E4')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        {/* 상태 뱃지 */}
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 500, color: st.color, background: `${st.dot}18`, padding: '2px 8px', borderRadius: '10px' }}>
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: st.dot, display: 'inline-block' }} />
                          {st.label}
                        </span>
                        <span style={{ fontSize: '11px', color: '#A8A29E' }}>
                          {d.format === 'pros_cons' ? '찬반형' : '다관점형'}
                        </span>
                        {remaining && (
                          <span style={{ fontSize: '11px', color: '#10B981' }}>
                            {remaining}
                          </span>
                        )}
                      </div>

                      <h2 style={{ fontSize: '15px', fontWeight: 500, color: '#1C1917', marginBottom: '6px', lineHeight: 1.4 }}>
                        {d.title}
                      </h2>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        {d.tags?.slice(0, 3).map(tag => (
                          <span key={tag} style={{ fontSize: '11px', color: '#A8A29E' }}>#{tag}</span>
                        ))}
                        <span style={{ fontSize: '11px', color: '#A8A29E', marginLeft: 'auto' }}>
                          참여 {d.participant_count}명 · {d.profiles?.nickname} · {formatDate(d.created_at)}
                        </span>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          )
        )}

      </main>
    </>
  )
}

const actionBtnStyle: React.CSSProperties = {
  fontSize: '12px', fontWeight: 500, color: '#1C1917',
  textDecoration: 'none', padding: '6px 14px',
  border: '1px solid #E7E5E4', borderRadius: '8px', background: '#FFFFFF',
}
const emptyStyle: React.CSSProperties = {
  padding: '40px 0', textAlign: 'center', color: '#A8A29E', fontSize: '13px',
}
