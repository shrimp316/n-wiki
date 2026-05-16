'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import AppHeader from '@/components/AppHeader'
import BottomNav, { TabType } from '@/components/BottomNav'
import Sidebar from '@/components/Sidebar'
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
const STATUS_MAP: Record<string, { label: string; color: string; dot: string }> = {
  active:  { label: '진행중',   color: '#065F46', dot: '#10B981' },
  paused:  { label: '일시정지', color: '#92400E', dot: '#F59E0B' },
  ended:   { label: '종료됨',   color: '#44403C', dot: '#A8A29E' },
}
const TAB_TITLES: Record<TabType, string> = {
  home: 'N의 위키',
  discussion: '담론',
  procon: '찬반의견',
}

export default function HomePage() {
  const supabase = createClient()
  const [tab, setTab] = useState<TabType>('home')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [docs, setDocs] = useState<DocWithMeta[]>([])
  const [discussions, setDiscussions] = useState<DiscussionWithCount[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id || null))
  }, [])

  useEffect(() => {
    if (tab === 'home') loadDocs('kakao')
    else if (tab === 'discussion') loadDiscussions(null)
    else if (tab === 'procon') loadDiscussions('pros_cons')
  }, [tab])

  async function loadDocs(type: string) {
    setLoading(true)
    const { data } = await supabase
      .from('documents')
      .select('*, profiles!documents_author_id_fkey(nickname), kakao_meta(talk_date, participants)')
      .eq('type', type).eq('status', 'published')
      .order('created_at', { ascending: false })
    setDocs((data as DocWithMeta[]) || [])
    setLoading(false)
  }

  async function loadDiscussions(format: string | null) {
    setLoading(true)
    let query = supabase
      .from('discussions')
      .select('*, profiles!discussions_author_id_fkey(nickname), discussion_participants(user_id)')
      .order('created_at', { ascending: false })
    if (format) query = query.eq('format', format)
    const { data } = await query
    const mapped = (data || []).map(d => ({
      ...d,
      participant_count: (d.discussion_participants || []).length,
    })) as DiscussionWithCount[]
    setDiscussions(mapped)
    setLoading(false)
  }

  const fmt = (s: string) => {
    const d = new Date(s)
    return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'linear-gradient(160deg, #b8dcf8 0%, #c5eee8 100%)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* 사이드바 */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activeTab={tab}
        onTabChange={(t) => { setTab(t); setSidebarOpen(false) }}
      />

      {/* 헤더 */}
      <AppHeader
        onMenuOpen={() => setSidebarOpen(true)}
        title={TAB_TITLES[tab]}
      />

      {/* 컨텐츠 */}
      <main style={{
        flex: 1,
        maxWidth: '680px',
        width: '100%',
        margin: '0 auto',
        padding: '16px 16px 96px',
      }}>

        {/* ── 홈 탭: 담론 카카오 목록 ── */}
        {tab === 'home' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <span style={{ fontSize: '14px', fontWeight: 600, color: '#0d1f3c' }}>최근 담론 아카이브</span>
              {userId && (
                <Link href="/wiki/new?type=kakao" style={actionBtn}>+ 작성</Link>
              )}
            </div>
            {loading ? <p style={emptyStyle}>불러오는 중...</p> :
              docs.length === 0 ? <p style={emptyStyle}>아직 문서가 없어요</p> :
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {docs.map(doc => (
                  <Link key={doc.id} href={`/wiki/${doc.slug}`} style={{ textDecoration: 'none' }}>
                    <div style={glassCard}>
                      {doc.kakao_meta?.[0] && (
                        <span style={{ fontSize: '11px', color: '#8faec8', display: 'block', marginBottom: '4px' }}>
                          {doc.kakao_meta[0].talk_date}
                        </span>
                      )}
                      <h2 style={{ fontSize: '15px', fontWeight: 500, color: '#0d1f3c', marginBottom: '6px', lineHeight: 1.4 }}>
                        {doc.title}
                      </h2>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                        {doc.tags?.slice(0,3).map(t => (
                          <span key={t} style={{ fontSize: '11px', color: '#8faec8' }}>#{t}</span>
                        ))}
                        <span style={{ fontSize: '11px', color: '#8faec8', marginLeft: 'auto' }}>
                          {doc.profiles?.nickname} · {fmt(doc.created_at)}
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            }
          </>
        )}

        {/* ── 담론 탭 ── */}
        {tab === 'discussion' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <span style={{ fontSize: '14px', fontWeight: 600, color: '#0d1f3c' }}>전체 담론</span>
              {userId && <Link href="/discussions/new" style={actionBtn}>+ 발제하기</Link>}
            </div>
            {loading ? <p style={emptyStyle}>불러오는 중...</p> :
              discussions.length === 0 ? <p style={emptyStyle}>아직 담론이 없어요</p> :
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {discussions.map(d => {
                  const st = STATUS_MAP[d.status] || STATUS_MAP.ended
                  return (
                    <Link key={d.id} href={`/discussions/${d.id}`} style={{ textDecoration: 'none' }}>
                      <div style={glassCard}>
                        <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', alignItems: 'center' }}>
                          <span style={{
                            fontSize: '10px', fontWeight: 600, color: st.color,
                            background: `${st.dot}18`, padding: '2px 8px', borderRadius: '8px',
                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                          }}>
                            <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: st.dot, display: 'inline-block' }} />
                            {st.label}
                          </span>
                          <span style={{ fontSize: '10px', color: '#8faec8' }}>
                            {d.format === 'pros_cons' ? '찬반형' : '다관점형'}
                          </span>
                        </div>
                        <h2 style={{ fontSize: '14px', fontWeight: 500, color: '#0d1f3c', marginBottom: '6px', lineHeight: 1.4 }}>
                          {d.title}
                        </h2>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                          {d.tags?.slice(0,3).map(t => (
                            <span key={t} style={{ fontSize: '10px', color: '#8faec8' }}>#{t}</span>
                          ))}
                          <span style={{ fontSize: '11px', color: '#8faec8', marginLeft: 'auto' }}>
                            참여 {d.participant_count}명
                          </span>
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            }
          </>
        )}

        {/* ── 찬반의견 탭 ── */}
        {tab === 'procon' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <span style={{ fontSize: '14px', fontWeight: 600, color: '#0d1f3c' }}>찬반 토론</span>
              {userId && <Link href="/discussions/new" style={actionBtn}>+ 발제하기</Link>}
            </div>
            {loading ? <p style={emptyStyle}>불러오는 중...</p> :
              discussions.length === 0 ? <p style={emptyStyle}>아직 찬반 토론이 없어요</p> :
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {discussions.map(d => {
                  const st = STATUS_MAP[d.status] || STATUS_MAP.ended
                  return (
                    <Link key={d.id} href={`/discussions/${d.id}`} style={{ textDecoration: 'none' }}>
                      <div style={glassCard}>
                        <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', alignItems: 'center' }}>
                          <span style={{
                            fontSize: '10px', fontWeight: 600, color: st.color,
                            background: `${st.dot}18`, padding: '2px 8px', borderRadius: '8px',
                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                          }}>
                            <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: st.dot, display: 'inline-block' }} />
                            {st.label}
                          </span>
                        </div>
                        <h2 style={{ fontSize: '14px', fontWeight: 500, color: '#0d1f3c', marginBottom: '6px', lineHeight: 1.4 }}>
                          {d.title}
                        </h2>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                          {d.tags?.slice(0,3).map(t => (
                            <span key={t} style={{ fontSize: '10px', color: '#8faec8' }}>#{t}</span>
                          ))}
                          <span style={{ fontSize: '11px', color: '#8faec8', marginLeft: 'auto' }}>
                            참여 {d.participant_count}명
                          </span>
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            }
          </>
        )}
      </main>

      {/* 하단 네비 */}
      <BottomNav activeTab={tab} onTabChange={setTab} />
    </div>
  )
}

const glassCard: React.CSSProperties = {
  padding: '14px 16px',
  background: 'rgba(255,255,255,0.82)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: '1px solid rgba(255,255,255,0.65)',
  borderRadius: '14px',
}
const actionBtn: React.CSSProperties = {
  fontSize: '12px', fontWeight: 600, color: '#fff',
  textDecoration: 'none', padding: '7px 14px',
  background: 'linear-gradient(135deg, #41b0f8, #3dd9b0)',
  borderRadius: '10px',
  boxShadow: '0 3px 10px rgba(65,176,248,0.35)',
}
const emptyStyle: React.CSSProperties = {
  padding: '40px 0', textAlign: 'center', color: '#8faec8', fontSize: '13px',
}
