'use client'
// 적용 위치: app/page.tsx

import { useState, useEffect, Suspense } from 'react'
import { createClient } from '@/lib/supabase'
import AppHeader from '@/components/AppHeader'
import BottomNav, { TabType } from '@/components/BottomNav'
import Sidebar from '@/components/Sidebar'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import type { Document, Discussion } from '@/lib/supabase'

type DocWithMeta = Document & {
  profiles?: { nickname: string }
  kakao_meta?: Array<{ talk_date: string; participants: string[] }>
}
type DiscussionWithCount = Discussion & {
  profiles?: { nickname: string }
  participant_count: number
  pros_count: number
  cons_count: number
}
type Stats = {
  kakao: { total: number; today: number }
  procon: { total: number; today: number }
  wiki:  { total: number; today: number }
}

const STATUS_MAP: Record<string, { label: string; color: string; dot: string }> = {
  active:  { label: '진행중',   color: '#065F46', dot: '#10B981' },
  paused:  { label: '일시정지', color: '#92400E', dot: '#F59E0B' },
  ended:   { label: '종료됨',   color: '#44403C', dot: '#A8A29E' },
}
const TAB_TITLES: Record<TabType, string> = {
  home: 'N의 위키',
  discussion: '카카오톡 담론요약',
  procon: '찬반의견',
}

function HomeView() {
  const supabase = createClient()
  const router = useRouter()
  const params = useSearchParams()
  const initialTab = (params.get('tab') as TabType) || 'home'
  const [tab, setTab] = useState<TabType>(initialTab)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [docs, setDocs] = useState<DocWithMeta[]>([])
  const [discussions, setDiscussions] = useState<DiscussionWithCount[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [myVotes, setMyVotes] = useState<Record<string, string>>({})
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id || null))
  }, [])

  useEffect(() => {
    if (tab === 'home') { loadHome(); loadStats() }
    else if (tab === 'discussion') loadKakaoDocs()
    else if (tab === 'procon') loadProcons()
  }, [tab])

  // userId가 확정된 후 내 투표 목록 로드 (procon 인라인 투표용)
  useEffect(() => {
    if (!userId) return
    supabase
      .from('discussion_participants')
      .select('discussion_id, stance')
      .eq('user_id', userId)
      .then(({ data }) => {
        if (data) {
          const vm: Record<string, string> = {}
          ;(data as { discussion_id: string; stance: string }[])
            .forEach(p => { vm[p.discussion_id] = p.stance })
          setMyVotes(vm)
        }
      })
  }, [userId])

  async function loadStats() {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayIso = todayStart.toISOString()

    const [kTotal, kToday, pTotal, pToday, wTotal, wToday] = await Promise.all([
      supabase.from('documents').select('*', { count: 'exact', head: true })
        .eq('type', 'kakao').eq('status', 'published'),
      supabase.from('documents').select('*', { count: 'exact', head: true })
        .eq('type', 'kakao').eq('status', 'published').gte('created_at', todayIso),
      supabase.from('discussions').select('*', { count: 'exact', head: true })
        .eq('format', 'pros_cons'),
      supabase.from('discussions').select('*', { count: 'exact', head: true })
        .eq('format', 'pros_cons').gte('created_at', todayIso),
      supabase.from('documents').select('*', { count: 'exact', head: true })
        .eq('type', 'concept').eq('status', 'published'),
      supabase.from('documents').select('*', { count: 'exact', head: true })
        .eq('type', 'concept').eq('status', 'published').gte('created_at', todayIso),
    ])
    setStats({
      kakao:  { total: kTotal.count ?? 0, today: kToday.count ?? 0 },
      procon: { total: pTotal.count ?? 0, today: pToday.count ?? 0 },
      wiki:   { total: wTotal.count ?? 0, today: wToday.count ?? 0 },
    })
  }

  async function loadHome() {
    setLoading(true)
    const [docsRes, discRes] = await Promise.all([
      supabase.from('documents')
        .select('*, profiles!documents_author_id_fkey(nickname), kakao_meta(talk_date, participants)')
        .eq('type', 'kakao').eq('status', 'published')
        .order('created_at', { ascending: false }).limit(3),
      supabase.from('discussions')
        .select('*, profiles!discussions_author_id_fkey(nickname), discussion_participants(user_id, stance)')
        .eq('format', 'pros_cons')
        .order('created_at', { ascending: false }).limit(3),
    ])
    setDocs((docsRes.data as DocWithMeta[]) || [])
    type DiscussionRow = Discussion & {
      profiles?: { nickname: string }
      discussion_participants?: { user_id: string; stance: string }[]
    }
    const rows = (discRes.data ?? []) as DiscussionRow[]
    setDiscussions(rows.map(d => {
      const parts = d.discussion_participants ?? []
      return {
        ...d,
        participant_count: parts.length,
        pros_count: parts.filter(p => p.stance === '찬성').length,
        cons_count: parts.filter(p => p.stance === '반대').length,
      }
    }))
    setLoading(false)
  }

  async function loadKakaoDocs() {
    setLoading(true)
    const { data } = await supabase
      .from('documents')
      .select('*, profiles!documents_author_id_fkey(nickname), kakao_meta(talk_date, participants)')
      .eq('type', 'kakao').eq('status', 'published')
      .order('created_at', { ascending: false })
    setDocs((data as DocWithMeta[]) || [])
    setLoading(false)
  }

  async function loadProcons() {
    setLoading(true)
    const { data } = await supabase
      .from('discussions')
      .select('*, profiles!discussions_author_id_fkey(nickname), discussion_participants(user_id, stance)')
      .eq('format', 'pros_cons')
      .order('created_at', { ascending: false })
    type DiscussionRow = Discussion & {
      profiles?: { nickname: string }
      discussion_participants?: { user_id: string; stance: string }[]
    }
    const rows = (data ?? []) as DiscussionRow[]
    setDiscussions(rows.map(d => {
      const parts = d.discussion_participants ?? []
      return {
        ...d,
        participant_count: parts.length,
        pros_count: parts.filter(p => p.stance === '찬성').length,
        cons_count: parts.filter(p => p.stance === '반대').length,
      }
    }))
    setLoading(false)
  }

  async function voteInline(discussionId: string, stance: '찬성' | '반대') {
    if (!userId) { router.push('/auth/login'); return }
    if (myVotes[discussionId]) return // 이미 투표함
    const { error } = await supabase.from('discussion_participants').insert({
      discussion_id: discussionId, user_id: userId, stance,
    })
    if (!error) {
      setMyVotes(prev => ({ ...prev, [discussionId]: stance }))
      setDiscussions(prev => prev.map(d => d.id !== discussionId ? d : {
        ...d,
        participant_count: d.participant_count + 1,
        pros_count: stance === '찬성' ? d.pros_count + 1 : d.pros_count,
        cons_count: stance === '반대' ? d.cons_count + 1 : d.cons_count,
      }))
    }
  }

  const fmt = (s: string) => {
    const d = new Date(s)
    return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'linear-gradient(160deg, #b8dcf8 0%, #c5eee8 100%)', display: 'flex', flexDirection: 'column' }}>
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activeTab={tab}
        onTabChange={(t) => { setTab(t); setSidebarOpen(false) }}
      />
      <AppHeader onMenuOpen={() => setSidebarOpen(true)} title={TAB_TITLES[tab]} />

      <main style={{ flex: 1, maxWidth: '680px', width: '100%', margin: '0 auto', padding: '16px 16px 96px' }}>

        {/* ── 홈: 통계 대시보드 + 미리보기 ── */}
        {tab === 'home' && (
          <>
            <div style={statsGrid}>
              <StatCard
                label="전체담론"
                sub="카카오톡 담론요약"
                total={stats?.kakao.total}
                today={stats?.kakao.today}
                color="#41b0f8"
                onClick={() => setTab('discussion')}
              />
              <StatCard
                label="찬반의견"
                sub="찬반 토론"
                total={stats?.procon.total}
                today={stats?.procon.today}
                color="#ff7a59"
                onClick={() => setTab('procon')}
              />
              <StatCard
                label="위키문서"
                sub="개념 문서"
                total={stats?.wiki.total}
                today={stats?.wiki.today}
                color="#3dd9b0"
                href="/wiki"
              />
            </div>

            {/* 카카오톡 담론요약 미리보기 */}
            <div style={sectionHeader}>
              <span style={sectionTitle}>최근 카카오톡 담론요약</span>
              <button onClick={() => setTab('discussion')} style={moreBtn}>더보기 →</button>
            </div>
            {loading ? <p style={emptyStyle}>불러오는 중...</p>
              : docs.length === 0 ? <p style={emptyStyle}>아직 담론 요약이 없어요</p>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
                  {docs.map(doc => (
                    <Link key={doc.id} href={`/wiki/${doc.slug}`} style={{ textDecoration: 'none' }}>
                      <div style={glassCard}>
                        {doc.kakao_meta?.[0] && (
                          <span style={{ fontSize: '11px', color: '#8faec8', display: 'block', marginBottom: '4px' }}>
                            {doc.kakao_meta[0].talk_date}
                          </span>
                        )}
                        <h2 style={cardTitle}>{doc.title}</h2>
                        <div style={cardMetaRow}>
                          {doc.tags?.slice(0,3).map(t => (
                            <span key={t} style={tagStyle}>#{t}</span>
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

            {/* 찬반의견 미리보기 */}
            <div style={sectionHeader}>
              <span style={sectionTitle}>최근 찬반의견</span>
              <button onClick={() => setTab('procon')} style={moreBtn}>더보기 →</button>
            </div>
            {loading ? <p style={emptyStyle}>불러오는 중...</p>
              : discussions.length === 0 ? <p style={emptyStyle}>아직 찬반 토론이 없어요</p>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {discussions.map(d => {
                    const st = STATUS_MAP[d.status] || STATUS_MAP.ended
                    return (
                      <Link key={d.id} href={`/discussions/${d.id}`} style={{ textDecoration: 'none' }}>
                        <div style={glassCard}>
                          <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', alignItems: 'center' }}>
                            <span style={{ fontSize: '10px', fontWeight: 600, color: st.color, background: `${st.dot}18`, padding: '2px 8px', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: st.dot, display: 'inline-block' }} />
                              {st.label}
                            </span>
                          </div>
                          <h2 style={cardTitle}>{d.title}</h2>
                          <div style={cardMetaRow}>
                            {d.tags?.slice(0,3).map(t => (
                              <span key={t} style={tagStyle}>#{t}</span>
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

        {/* ── 담론: 카카오톡 담론요약 전체 ── */}
        {tab === 'discussion' && (
          <>
            <div style={sectionHeader}>
              <span style={sectionTitle}>카카오톡 담론 아카이브</span>
              {userId && <Link href="/wiki/new?type=kakao" style={actionBtn}>+ 작성</Link>}
            </div>
            {loading ? <p style={emptyStyle}>불러오는 중...</p>
              : docs.length === 0 ? <p style={emptyStyle}>아직 담론 요약이 없어요</p>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {docs.map(doc => (
                    <Link key={doc.id} href={`/wiki/${doc.slug}`} style={{ textDecoration: 'none' }}>
                      <div style={glassCard}>
                        {doc.kakao_meta?.[0] && (
                          <span style={{ fontSize: '11px', color: '#8faec8', display: 'block', marginBottom: '4px' }}>
                            {doc.kakao_meta[0].talk_date}
                          </span>
                        )}
                        <h2 style={cardTitle}>{doc.title}</h2>
                        <div style={cardMetaRow}>
                          {doc.tags?.slice(0,3).map(t => (
                            <span key={t} style={tagStyle}>#{t}</span>
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

        {/* ── 찬반의견 탭 (인라인 투표 + 시각화) ── */}
        {tab === 'procon' && (
          <>
            <div style={sectionHeader}>
              <span style={sectionTitle}>찬반 토론</span>
              {userId && <Link href="/discussions/new?format=pros_cons" style={actionBtn}>+ 발제하기</Link>}
            </div>
            {loading ? <p style={emptyStyle}>불러오는 중...</p>
              : discussions.length === 0 ? <p style={emptyStyle}>아직 찬반 토론이 없어요</p>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {discussions.map(d => {
                    const st = STATUS_MAP[d.status] || STATUS_MAP.ended
                    const total = d.pros_count + d.cons_count
                    const prosPercent = total > 0 ? Math.round((d.pros_count / total) * 100) : 50
                    const myVote = myVotes[d.id]
                    const isEnded = d.status === 'ended'

                    return (
                      <div key={d.id} style={{ ...glassCard, padding: '16px' }}>
                        {/* 상태 + 태그 */}
                        <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', alignItems: 'center' }}>
                          <span style={{ fontSize: '10px', fontWeight: 600, color: st.color, background: `${st.dot}18`, padding: '2px 8px', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: st.dot, display: 'inline-block' }} />
                            {st.label}
                          </span>
                          {d.tags?.slice(0,2).map(t => (
                            <span key={t} style={{ fontSize: '10px', color: '#8faec8' }}>#{t}</span>
                          ))}
                        </div>

                        <Link href={`/discussions/${d.id}`} style={{ textDecoration: 'none' }}>
                          <h2 style={{ fontSize: '14px', fontWeight: 600, color: '#0d1f3c', marginBottom: '12px', lineHeight: 1.4 }}>
                            {d.title}
                          </h2>
                        </Link>

                        {total > 0 && (
                          <div style={{ marginBottom: '12px' }}>
                            <div style={{ height: '6px', background: 'rgba(255,77,109,0.15)', borderRadius: '6px', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${prosPercent}%`, background: 'linear-gradient(90deg, #41b0f8, #3dd9b0)', borderRadius: '6px', transition: 'width 0.4s ease' }} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '5px' }}>
                              <span style={{ fontSize: '11px', color: '#1a8cf5', fontWeight: 600 }}>찬성 {prosPercent}%</span>
                              <span style={{ fontSize: '11px', color: '#8faec8' }}>총 {total}명</span>
                              <span style={{ fontSize: '11px', color: '#ff4d6d', fontWeight: 600 }}>반대 {100 - prosPercent}%</span>
                            </div>
                          </div>
                        )}

                        {!isEnded ? (
                          <>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button
                                onClick={() => voteInline(d.id, '찬성')}
                                style={{
                                  flex: 1, height: '36px', borderRadius: '10px', border: 'none',
                                  background: myVote === '찬성' ? 'linear-gradient(135deg, #41b0f8, #3dd9b0)' : 'rgba(65,176,248,0.12)',
                                  color: myVote === '찬성' ? '#fff' : '#1a8cf5',
                                  cursor: myVote ? 'default' : 'pointer',
                                  fontSize: '13px', fontWeight: 600, fontFamily: 'inherit',
                                  boxShadow: myVote === '찬성' ? '0 3px 10px rgba(65,176,248,0.35)' : 'none',
                                  transition: 'all 0.2s',
                                }}
                              >
                                {myVote === '찬성' ? '✓ 찬성' : '찬성'}
                              </button>
                              <button
                                onClick={() => voteInline(d.id, '반대')}
                                style={{
                                  flex: 1, height: '36px', borderRadius: '10px', border: 'none',
                                  background: myVote === '반대' ? 'linear-gradient(135deg, #ff6b8a, #ff4d6d)' : 'rgba(255,77,109,0.12)',
                                  color: myVote === '반대' ? '#fff' : '#ff4d6d',
                                  cursor: myVote ? 'default' : 'pointer',
                                  fontSize: '13px', fontWeight: 600, fontFamily: 'inherit',
                                  boxShadow: myVote === '반대' ? '0 3px 10px rgba(255,77,109,0.35)' : 'none',
                                  transition: 'all 0.2s',
                                }}
                              >
                                {myVote === '반대' ? '✓ 반대' : '반대'}
                              </button>
                            </div>
                            {myVote ? (
                              <p style={{ marginTop: '8px', textAlign: 'center', fontSize: '11px', color: '#8faec8' }}>
                                투표 완료 ·{' '}
                                <Link href={`/discussions/${d.id}`} style={{ color: '#1a8cf5', textDecoration: 'none' }}>
                                  토론 참여하기 →
                                </Link>
                              </p>
                            ) : (
                              !userId && (
                                <p style={{ marginTop: '8px', textAlign: 'center', fontSize: '11px', color: '#8faec8' }}>
                                  <Link href="/auth/login" style={{ color: '#1a8cf5', textDecoration: 'none' }}>로그인</Link>하면 투표할 수 있어요
                                </p>
                              )
                            )}
                          </>
                        ) : (
                          <Link href={`/discussions/${d.id}`} style={{ display: 'block', textAlign: 'center', fontSize: '12px', color: '#8faec8', padding: '8px', textDecoration: 'none' }}>
                            종료된 토론 · 결과 보기 →
                          </Link>
                        )}
                      </div>
                    )
                  })}
                </div>
            }
          </>
        )}
      </main>

      <BottomNav activeTab={tab} onTabChange={setTab} />
    </div>
  )
}

export default function HomePage() {
  return (
    <Suspense>
      <HomeView />
    </Suspense>
  )
}

/* ── 통계 카드 ── */
function StatCard({
  label, sub, total, today, color, onClick, href,
}: {
  label: string
  sub: string
  total: number | undefined
  today: number | undefined
  color: string
  onClick?: () => void
  href?: string
}) {
  const inner = (
    <div style={{
      ...glassCard,
      padding: '12px 10px',
      cursor: 'pointer',
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      minWidth: 0,
      borderTop: `3px solid ${color}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: '#0d1f3c', letterSpacing: '-0.3px' }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: '10px', color: '#8faec8', marginTop: '-4px' }}>{sub}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: 'auto' }}>
        <span style={{ fontSize: '22px', fontWeight: 700, color: '#0d1f3c', lineHeight: 1 }}>
          {total ?? '—'}
        </span>
        {typeof today === 'number' && today > 0 && (
          <span style={{
            fontSize: '11px', fontWeight: 600, color: '#10b981',
            background: 'rgba(16,185,129,0.12)',
            padding: '2px 6px', borderRadius: '8px',
          }}>
            +{today} 오늘
          </span>
        )}
        {typeof today === 'number' && today === 0 && (
          <span style={{ fontSize: '11px', color: '#8faec8' }}>오늘 0</span>
        )}
      </div>
    </div>
  )

  if (href) {
    return <Link href={href} style={{ textDecoration: 'none', minWidth: 0 }}>{inner}</Link>
  }
  return (
    <button
      onClick={onClick}
      style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', fontFamily: 'inherit', minWidth: 0 }}
    >
      {inner}
    </button>
  )
}

/* ── 공통 스타일 ── */
const glassCard: React.CSSProperties = {
  padding: '14px 16px',
  background: 'rgba(255,255,255,0.82)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: '1px solid rgba(255,255,255,0.65)',
  borderRadius: '14px',
}
const statsGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: '8px',
  marginBottom: '20px',
}
const sectionHeader: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  marginBottom: '12px', marginTop: '4px',
}
const sectionTitle: React.CSSProperties = {
  fontSize: '14px', fontWeight: 600, color: '#0d1f3c',
}
const moreBtn: React.CSSProperties = {
  fontSize: '12px', color: '#1a8cf5', background: 'none', border: 'none',
  cursor: 'pointer', fontFamily: 'inherit', padding: 0,
}
const cardTitle: React.CSSProperties = {
  fontSize: '15px', fontWeight: 500, color: '#0d1f3c', marginBottom: '6px', lineHeight: 1.4,
}
const cardMetaRow: React.CSSProperties = {
  display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center',
}
const tagStyle: React.CSSProperties = {
  fontSize: '11px', color: '#8faec8',
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
