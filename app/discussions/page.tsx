'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Navbar from '@/components/Navbar'
import Link from 'next/link'
import type { Discussion } from '@/lib/supabase'

const STATUS_LABEL: Record<string, { label: string; color: string; dot: string }> = {
  active:  { label: '진행중', color: '#065F46', dot: '#10B981' },
  paused:  { label: '일시정지', color: '#92400E', dot: '#F59E0B' },
  ended:   { label: '종료됨', color: '#44403C', dot: '#A8A29E' },
}

type DiscussionWithCount = Discussion & { participant_count: number }

export default function DiscussionsPage() {
  const supabase = createClient()
  const [discussions, setDiscussions] = useState<DiscussionWithCount[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'active' | 'paused' | 'ended'>('all')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id || null))
  }, [])

  useEffect(() => {
    loadDiscussions()
  }, [filter])

  async function loadDiscussions() {
    setLoading(true)
    let query = supabase
      .from('discussions')
      .select('*, profiles!discussions_author_id_fkey(nickname), discussion_participants(user_id)')
      .order('created_at', { ascending: false })

    if (filter !== 'all') query = query.eq('status', filter)

    const { data, error } = await query
    if (error) console.error('loadDiscussions error:', error)

    const mapped = (data || []).map(d => ({
      ...d,
      participant_count: (d.discussion_participants || []).length,
    })) as DiscussionWithCount[]

    setDiscussions(mapped)
    setLoading(false)
  }

  function timeRemaining(deadline: string | null) {
    if (!deadline) return null
    const diff = new Date(deadline).getTime() - Date.now()
    if (diff <= 0) return '마감'
    const h = Math.floor(diff / 3600000)
    const m = Math.floor((diff % 3600000) / 60000)
    return h > 0 ? `${h}시간 ${m}분 남음` : `${m}분 남음`
  }

  const formatDate = (s: string) => {
    const d = new Date(s)
    return `${d.getMonth() + 1}/${d.getDate()}`
  }

  return (
    <>
      <Navbar />
      <main style={{ maxWidth: '720px', margin: '0 auto', padding: '32px 24px' }}>

        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1C1917', letterSpacing: '-0.3px' }}>토론</h1>
            <p style={{ fontSize: '12px', color: '#A8A29E', marginTop: '4px' }}>발제를 올리고 실시간으로 토론에 참여하세요</p>
          </div>
          {userId && (
            <Link href="/discussions/new" style={{
              fontSize: '13px', fontWeight: 500, color: '#FAFAF9',
              background: '#1C1917', textDecoration: 'none',
              padding: '8px 16px', borderRadius: '8px',
            }}>
              + 발제하기
            </Link>
          )}
        </div>

        {/* 필터 탭 */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '20px' }}>
          {(['all', 'active', 'paused', 'ended'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              fontSize: '12px', padding: '5px 14px', borderRadius: '20px', cursor: 'pointer',
              fontFamily: 'inherit', border: '1px solid',
              borderColor: filter === f ? '#1C1917' : '#E7E5E4',
              background: filter === f ? '#1C1917' : 'transparent',
              color: filter === f ? '#FAFAF9' : '#78716C',
              transition: 'all 0.15s',
            }}>
              {f === 'all' ? '전체' : STATUS_LABEL[f].label}
            </button>
          ))}
        </div>

        {/* 목록 */}
        {loading ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: '#A8A29E', fontSize: '13px' }}>불러오는 중...</div>
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
              const st = STATUS_LABEL[d.status]
              const endRemaining = d.status === 'active' ? timeRemaining(d.end_at) : null

              return (
                <Link key={d.id} href={`/discussions/${d.id}`} style={{ textDecoration: 'none' }}>
                  <div
                    style={{ padding: '16px 18px', background: '#FFFFFF', border: '1px solid #E7E5E4', borderRadius: '10px', transition: 'border-color 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = '#A8A29E')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = '#E7E5E4')}
                  >
                    {/* 상태 + 형식 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 500, color: st.color, background: `${st.dot}18`, padding: '2px 8px', borderRadius: '10px' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: st.dot, display: 'inline-block' }} />
                        {st.label}
                      </span>
                      <span style={{ fontSize: '11px', color: '#A8A29E' }}>
                        {d.format === 'pros_cons' ? '찬반형' : '다관점형'}
                      </span>
                      {endRemaining && <span style={{ fontSize: '11px', color: '#10B981' }}>{endRemaining}</span>}
                    </div>

                    <h2 style={{ fontSize: '15px', fontWeight: 500, color: '#1C1917', marginBottom: '8px', lineHeight: 1.4 }}>
                      {d.title}
                    </h2>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {d.tags?.slice(0, 3).map(tag => (
                        <span key={tag} style={{ fontSize: '11px', color: '#A8A29E' }}>#{tag}</span>
                      ))}
                      <span style={{ fontSize: '11px', color: '#A8A29E', marginLeft: 'auto' }}>
                        참여 {d.participant_count}명 · {(d as Discussion & { profiles?: { nickname: string } }).profiles?.nickname} · {formatDate(d.created_at)}
                      </span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </main>
    </>
  )
}
