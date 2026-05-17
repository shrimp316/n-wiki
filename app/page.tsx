'use client'
// 적용 위치: app/page.tsx

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import AppHeader from '@/components/AppHeader'
import BottomNav, { TabType } from '@/components/BottomNav'
import Sidebar from '@/components/Sidebar'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
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
  const router = useRouter()
  const [tab, setTab] = useState<TabType>('home')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [docs, setDocs] = useState<DocWithMeta[]>([])
  const [discussions, setDiscussions] = useState<DiscussionWithCount[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [myVotes, setMyVotes] = useState<Record<string, string>>({})

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id || null))
  }, [])

  useEffect(() => {
    if (tab === 'home') loadDocs('kakao')
    else if (tab === 'discussion') loadDiscussions(null)
    else if (tab === 'procon') loadDiscussions('pros_cons')
  }, [tab])

  // userId가 확정된 후 내 투표 목록 로드
  useEffect(() => {
    if (!userId) return
    supabase
      .from('discussion_participants')
      .select('discussion_id, stance')
      .eq('user_id', userId)
      .then(({ data }) => {
        if (data) {
          const vm: Record<string, string> = {}
          data.forEach((p: any) => { vm[p.discussion_id] = p.stance })
          setMyVotes(vm)
        }
      })
  }, [userId])

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
      .select('*, profiles!discussions_author_id_fkey(nickname), discussion_participants(user_id, stance)')
      .order('created_at', { ascending: false })
    if (format) query = (query as any).eq('format', format)
    const { data } = await query
    const mapped = (data || []).map((d: any) => ({
      ...d,
      participant_count: (d.discussion_participants || []).length,
      pros_count: (d.discussion_participants || []).filter((p: any) => p.stance === '찬성').length,
      cons_count: (d.discussion_participants || []).filter((p: any) => p.stance === '반대').length,
    })) as DiscussionWithCount[]
    setDiscussions(mapped)
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

        {/* ── 홈: 카카오 담론 목록 ── */}
        {tab === 'home' && (
          <>
            <div style={rowHeader}>
              <span style={sectionTitle}>카카오톡 담론 아카이브</span>
              {userId && <Link href="/wiki/new?type=kakao" style={actionBtn}>+ 작성</Link>}
            </div>
            {loading ? <p style={emptyStyle}>불러오는 중...</p>
              : docs.length === 0 ? <p style={emptyStyle}>아직 문서가 없어요</p>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
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
            <div style={rowHeader}>
              <span style={sectionTitle}>전체 담론</span>
              {userId && <Link href="/discussions/new" style={actionBtn}>+ 발제하기</Link>}
            </div>
            {loading ? <p style={emptyStyle}>불러오는 중...</p>
              : discussions.length === 0 ? <p style={emptyStyle}>아직 담론이 없어요</p>
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
                            <span style={{ fontSize: '10px', color: '#8faec8' }}>
                              {d.format === 'pros_cons' ? '찬반형' : '다관점형'}
                            </span>
                          </div>
                          <h2 style={{ fontSize: '14px', fontWeight: 500, color: '#0d1f3c', marginBottom: '6px', lineHeight: 1.4 }}>{d.title}</h2>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                            {d.tags?.slice(0,3).map(t => (
                              <span key={t} style={{ fontSize: '10px', color: '#8faec8' }}>#{t}</span>
                            ))}
                            <span style={{ fontSize: '11px', color: '#8faec8', marginLeft: 'auto' }}>참여 {d.participant_count}명</span>
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
            <div style={rowHeader}>
              <span style={sectionTitle}>찬반 토론</span>
              {userId && <Link href="/discussions/new" style={actionBtn}>+ 발제하기</Link>}
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

                        {/* 제목 → 상세 페이지 링크 */}
                        <Link href={`/discussions/${d.id}`} style={{ textDecoration: 'none' }}>
                          <h2 style={{ fontSize: '14px', fontWeight: 600, color: '#0d1f3c', marginBottom: '12px', lineHeight: 1.4 }}>
                            {d.title}
                          </h2>
                        </Link>

                        {/* 찬반 바 */}
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

                        {/* 투표 버튼 */}
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

/* ── 공통 스타일 ── */
const glassCard: React.CSSProperties = {
  padding: '14px 16px',
  background: 'rgba(255,255,255,0.82)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: '1px solid rgba(255,255,255,0.65)',
  borderRadius: '14px',
}
const rowHeader: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px',
}
const sectionTitle: React.CSSProperties = {
  fontSize: '14px', fontWeight: 600, color: '#0d1f3c',
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
