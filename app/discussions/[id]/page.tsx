'use client'
// 적용 위치: app/discussions/[id]/page.tsx

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import AppHeader from '@/components/AppHeader'
import Sidebar from '@/components/Sidebar'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Discussion, DiscussionParticipant, DebatePost, ExtensionRequest } from '@/lib/supabase'

const QuillEditor = dynamic(() => import('@/components/QuillEditor'), { ssr: false })

type DiscussionFull = Discussion & {
  profiles?: { nickname: string }
  discussion_participants: (DiscussionParticipant & { profiles?: { nickname: string } })[]
}
type PostFull = DebatePost & { profiles?: { nickname: string } }

const POST_TYPE_LABEL = {
  argument: { label: '논거', color: '#1a8cf5', bg: 'rgba(26,140,245,0.08)' },
  rebuttal: { label: '반론', color: '#9A3412', bg: '#FFF7ED' },
  question: { label: '질문', color: '#1E40AF', bg: '#EFF6FF' },
}

const STANCE_COLOR: Record<string, { text: string; bg: string; border: string }> = {
  '찬성':   { text: '#065F46', bg: '#ECFDF5', border: '#6EE7B7' },
  '반대':   { text: '#9A3412', bg: '#FFF7ED', border: '#FCA5A5' },
  '발제자': { text: '#4C1D95', bg: '#F5F3FF', border: '#C4B5FD' },
}
function stanceStyle(stance: string | null) {
  if (!stance) return { text: '#78716C', bg: '#F5F5F4', border: '#E7E5E4' }
  return STANCE_COLOR[stance] || { text: '#1C1917', bg: '#F5F5F4', border: '#E7E5E4' }
}

export default function DiscussionPage({ params }: { params: { id: string } }) {
  const { id } = params
  const supabase = createClient()
  const router = useRouter()
  const feedEndRef = useRef<HTMLDivElement>(null)

  const [discussion, setDiscussion] = useState<DiscussionFull | null>(null)
  const [posts, setPosts] = useState<PostFull[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [myNickname, setMyNickname] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [myStance, setMyStance] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [adminLoading, setAdminLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const [postType, setPostType] = useState<'argument' | 'rebuttal' | 'question'>('argument')
  const [postContent, setPostContent] = useState('')
  const [replyTarget, setReplyTarget] = useState<PostFull | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [stanceInput, setStanceInput] = useState('')

  const [agreedPosts, setAgreedPosts] = useState<Set<string>>(new Set())
  const [bodyExpanded, setBodyExpanded] = useState(false)
  const [extRequests, setExtRequests] = useState<ExtensionRequest[]>([])
  const [myExtRequest, setMyExtRequest] = useState(false)
  const [extHours, setExtHours] = useState(24)
  const [noticeText, setNoticeText] = useState('')
  const [noticeEditing, setNoticeEditing] = useState(false)
  const [noticeSaving, setNoticeSaving] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUserId(data.user.id)
        supabase.from('profiles').select('nickname, is_admin').eq('id', data.user.id).single()
          .then(({ data: p }) => {
            if (p) { setMyNickname(p.nickname); setIsAdmin(p.is_admin ?? false) }
          })
      }
    })
    loadDiscussion()
    loadPosts()
  }, [id])

  useEffect(() => {
    const channel = supabase
      .channel(`discussion-${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'debate_posts', filter: `discussion_id=eq.${id}` },
        async (payload) => {
          const { data } = await supabase.from('debate_posts')
            .select('*, profiles!debate_posts_author_id_fkey(nickname)')
            .eq('id', payload.new.id).single()
          if (data) {
            setPosts(prev => [...prev, data as PostFull])
            setTimeout(() => feedEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
          }
        })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'discussion_participants', filter: `discussion_id=eq.${id}` },
        () => loadDiscussion())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [id])

  useEffect(() => {
    if (!userId || !discussion) return
    const me = discussion.discussion_participants.find(p => p.user_id === userId)
    if (me) setMyStance(me.stance)
  }, [userId, discussion])

  useEffect(() => {
    if (!userId || posts.length === 0) return
    supabase.from('debate_agrees').select('post_id').eq('user_id', userId)
      .then(({ data }) => { if (data) setAgreedPosts(new Set(data.map(a => a.post_id))) })
  }, [userId, posts.length])

  useEffect(() => {
    if (!discussion || discussion.status !== 'ended') return
    loadExtRequests()
  }, [discussion?.status])

  async function loadDiscussion() {
    const { data } = await supabase
      .from('discussions')
      .select('*, profiles!discussions_author_id_fkey(nickname), discussion_participants(*, profiles!discussion_participants_user_id_fkey(nickname))')
      .eq('id', id).single()
    if (!data) { router.push('/'); return }
    setDiscussion(data as DiscussionFull)
    setNoticeText(data.notice || '')
  }

  async function loadPosts() {
    const { data } = await supabase
      .from('debate_posts')
      .select('*, profiles!debate_posts_author_id_fkey(nickname)')
      .eq('discussion_id', id).order('created_at', { ascending: true })
    setPosts((data as PostFull[]) || [])
    setLoading(false)
  }

  async function loadExtRequests() {
    const { data } = await supabase
      .from('extension_requests')
      .select('*, profiles!extension_requests_user_id_fkey(nickname)')
      .eq('discussion_id', id)
    setExtRequests((data as ExtensionRequest[]) || [])
    if (userId) setMyExtRequest((data || []).some((r: ExtensionRequest) => r.user_id === userId))
  }

  async function joinDiscussion(stance: string) {
    if (!userId) { router.push('/auth/login'); return }
    const { error } = await supabase.from('discussion_participants').insert({ discussion_id: id, user_id: userId, stance })
    if (!error) {
      setMyStance(stance)
      if (discussion && discussion.author_id !== userId) {
        await supabase.from('notifications').insert({
          user_id: discussion.author_id, type: 'participant_joined',
          message: `${myNickname}님이 "${discussion.title}" 토론에 참여했어요`, discussion_id: id,
        })
      }
      loadDiscussion()
    }
  }

  async function submitPost() {
    if (!userId) { router.push('/auth/login'); return }
    if (!postContent.replace(/<[^>]*>/g, '').trim()) return
    setSubmitting(true)
    await supabase.from('debate_posts').insert({
      discussion_id: id, parent_id: replyTarget?.id || null,
      post_type: postType, content: postContent, author_id: userId, stance: myStance,
    })
    setPostContent(''); setReplyTarget(null); setPostType('argument')
    setSubmitting(false)
  }

  async function toggleAgree(postId: string) {
    if (!userId) { router.push('/auth/login'); return }
    if (agreedPosts.has(postId)) {
      await supabase.from('debate_agrees').delete().eq('post_id', postId).eq('user_id', userId)
      setAgreedPosts(prev => { const n = new Set(prev); n.delete(postId); return n })
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, agree_count: Math.max(0, p.agree_count - 1) } : p))
    } else {
      await supabase.from('debate_agrees').insert({ post_id: postId, user_id: userId })
      setAgreedPosts(prev => { const n = new Set(prev); n.add(postId); return n })
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, agree_count: p.agree_count + 1 } : p))
    }
  }

  async function adminSetStatus(status: 'paused' | 'active' | 'ended') {
    if (!isAdmin) return
    const msg = status === 'paused' ? '일시정지할까요?' : status === 'ended' ? '종료할까요? 되돌릴 수 없어요.' : '재개할까요?'
    if (!confirm(msg)) return
    setAdminLoading(true)
    const { error } = await supabase.from('discussions').update({ status }).eq('id', id)
    if (error) alert('상태 변경 실패: ' + error.message)
    else await loadDiscussion()
    setAdminLoading(false)
  }

  async function adminExtend(hours: number) {
    if (!isAdmin || !confirm(`${hours}시간 연장할까요?`)) return
    setAdminLoading(true)
    const newEndAt = new Date(Date.now() + hours * 3600000).toISOString()
    const { error } = await supabase.from('discussions').update({ status: 'active', end_at: newEndAt }).eq('id', id)
    if (!error) {
      await supabase.from('extension_requests').delete().eq('discussion_id', id)
      if (discussion) {
        const notifs = discussion.discussion_participants.filter(p => p.user_id !== userId).map(p => ({
          user_id: p.user_id, type: 'extension_approved',
          message: `"${discussion.title}" 토론이 ${hours}시간 연장됐어요`, discussion_id: id,
        }))
        if (notifs.length > 0) await supabase.from('notifications').insert(notifs)
      }
      await loadDiscussion(); setExtRequests([]); setMyExtRequest(false)
    }
    setAdminLoading(false)
  }

  async function saveNotice() {
    if (!isAdmin) return
    setNoticeSaving(true)
    await supabase.from('discussions').update({ notice: noticeText || null }).eq('id', id)
    setNoticeSaving(false); setNoticeEditing(false); loadDiscussion()
  }

  async function toggleExtRequest() {
    if (!userId || !myStance) return
    if (myExtRequest) {
      await supabase.from('extension_requests').delete().eq('discussion_id', id).eq('user_id', userId)
      setMyExtRequest(false); loadExtRequests()
    } else {
      await supabase.from('extension_requests').insert({ discussion_id: id, user_id: userId, stance: myStance })
      setMyExtRequest(true); loadExtRequests()
    }
  }

  const formatTime = (s: string) => {
    const diff = Date.now() - new Date(s).getTime()
    if (diff < 60000) return '방금'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}분 전`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}시간 전`
    const d = new Date(s); return `${d.getMonth()+1}/${d.getDate()}`
  }
  function timeRemaining(deadline: string | null) {
    if (!deadline) return null
    const diff = new Date(deadline).getTime() - Date.now()
    if (diff <= 0) return null
    const h = Math.floor(diff / 3600000), m = Math.floor((diff % 3600000) / 60000)
    return h > 0 ? `${h}시간 ${m}분` : `${m}분`
  }

  const topPosts = posts.filter(p => !p.parent_id)
  const getReplies = (postId: string) => posts.filter(p => p.parent_id === postId)
  const prosCount = discussion?.discussion_participants.filter(p => p.stance === '찬성').length || 0
  const consCount = discussion?.discussion_participants.filter(p => p.stance === '반대').length || 0
  const totalCount = discussion?.discussion_participants.length || 0
  const isEnded = discussion?.status === 'ended'
  const isPaused = discussion?.status === 'paused'
  const canPost = myStance && !isEnded && !isPaused
  const isAuthor = userId === discussion?.author_id
  const canEdit = isAuthor && !isEnded
  const proExtCount = extRequests.filter(r => r.stance === '찬성' || r.stance === '발제자').length
  const conExtCount = extRequests.filter(r => r.stance === '반대').length
  const canAdminExtend = isAdmin && isEnded && proExtCount >= 1 && conExtCount >= 1

  const bg: React.CSSProperties = { minHeight: '100dvh', background: 'linear-gradient(160deg, #b8dcf8 0%, #c5eee8 100%)' }

  if (loading) return (
    <div style={bg}>
      <AppHeader onMenuOpen={() => setSidebarOpen(true)} title="불러오는 중..." />
      <div style={{ padding: '48px', textAlign: 'center', color: '#8faec8', fontSize: '13px' }}>불러오는 중...</div>
    </div>
  )
  if (!discussion) return null

  const sidebarActiveTab = discussion.format === 'pros_cons' ? 'procon' : 'discussion'

  return (
    <div style={bg}>
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activeTab={sidebarActiveTab}
        onTabChange={() => { router.push('/'); setSidebarOpen(false) }}
      />
      <AppHeader onMenuOpen={() => setSidebarOpen(true)} title={discussion.title} />

      <main style={{ maxWidth: '760px', margin: '0 auto', padding: '16px 16px 140px' }}>

        <Link href="/" style={{ fontSize: '13px', color: '#5a7a9a', textDecoration: 'none', display: 'inline-block', marginBottom: '16px' }}>
          ← 목록
        </Link>

        {/* ── 발제문 카드 ── */}
        <div style={glassCard}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <StatusBadge status={discussion.status} />
            <span style={{ fontSize: '11px', color: '#8faec8' }}>
              {discussion.format === 'pros_cons' ? '찬반형' : '다관점형'}
            </span>
            {discussion.status === 'active' && discussion.end_at && (
              <span style={{ fontSize: '11px', color: '#10B981' }}>⏱ {timeRemaining(discussion.end_at) ?? '곧 종료'} 남음</span>
            )}
            {canEdit && (
              <Link href={`/discussions/${id}/edit`} style={{ fontSize: '11px', color: '#5a7a9a', textDecoration: 'none', padding: '3px 10px', border: '1px solid rgba(100,150,200,0.25)', borderRadius: '8px', marginLeft: 'auto' }}>
                수정하기
              </Link>
            )}
          </div>

          <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#0d1f3c', letterSpacing: '-0.3px', marginBottom: '8px', lineHeight: 1.4 }}>
            {discussion.title}
          </h1>
          <p style={{ fontSize: '12px', color: '#8faec8', marginBottom: '12px' }}>
            발제자 {discussion.profiles?.nickname} · 참여 {totalCount}명
            {discussion.tags?.map(t => <span key={t} style={{ marginLeft: '6px' }}>#{t}</span>)}
          </p>

          <div style={{ borderTop: '1px solid rgba(100,150,200,0.15)', paddingTop: '12px' }}>
            <div
              className="wiki-body"
              style={{ fontSize: '13px', lineHeight: 1.8, overflow: 'hidden', maxHeight: bodyExpanded ? 'none' : '80px', position: 'relative' }}
              dangerouslySetInnerHTML={{ __html: discussion.body }}
            />
            {!bodyExpanded && <div style={{ position: 'relative', marginTop: '-20px', background: 'linear-gradient(transparent, rgba(255,255,255,0.85))', height: '32px' }} />}
            <button onClick={() => setBodyExpanded(v => !v)} style={{ fontSize: '12px', color: '#5a7a9a', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', fontFamily: 'inherit' }}>
              {bodyExpanded ? '접기 ▲' : '발제문 전체 보기 ▼'}
            </button>
          </div>

          {discussion.format === 'pros_cons' && totalCount > 1 && (
            <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid rgba(100,150,200,0.15)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '5px' }}>
                <span style={{ color: '#1a8cf5', fontWeight: 600 }}>찬성 {prosCount}명</span>
                <span style={{ color: '#ff4d6d', fontWeight: 600 }}>반대 {consCount}명</span>
              </div>
              <div style={{ height: '6px', background: 'rgba(255,77,109,0.15)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ height: '100%', background: 'linear-gradient(90deg,#41b0f8,#3dd9b0)', borderRadius: '3px', width: `${(prosCount/(prosCount+consCount||1))*100}%`, transition: 'width 0.3s' }} />
              </div>
            </div>
          )}
        </div>

        {/* ── 입장 선택 ── */}
        {userId && !myStance && !isEnded && (
          <div style={{ ...glassCard, marginTop: '10px', background: 'rgba(255,251,235,0.90)', border: '1px solid rgba(253,230,138,0.6)', textAlign: 'center' }}>
            <p style={{ fontSize: '13px', color: '#92400E', marginBottom: '12px', fontWeight: 500 }}>토론에 참여하려면 입장을 선택해주세요</p>
            {discussion.format === 'pros_cons' ? (
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                <button onClick={() => joinDiscussion('찬성')} style={{ ...stanceBtnBase, background: '#ECFDF5', color: '#065F46', border: '1.5px solid #6EE7B7' }}>찬성으로 참여</button>
                <button onClick={() => joinDiscussion('반대')} style={{ ...stanceBtnBase, background: '#FFF7ED', color: '#9A3412', border: '1.5px solid #FCA5A5' }}>반대로 참여</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', maxWidth: '360px', margin: '0 auto' }}>
                <input
                  value={stanceInput} onChange={e => setStanceInput(e.target.value)}
                  placeholder="내 입장을 입력해주세요 (예: 조건부 찬성)"
                  style={{ flex: 1, height: '38px', border: '1px solid rgba(100,150,200,0.3)', borderRadius: '10px', padding: '0 12px', fontSize: '13px', fontFamily: 'inherit', outline: 'none', background: 'rgba(255,255,255,0.8)' }}
                  onKeyDown={e => e.key === 'Enter' && stanceInput.trim() && joinDiscussion(stanceInput.trim())}
                />
                <button onClick={() => stanceInput.trim() && joinDiscussion(stanceInput.trim())} style={{ ...stanceBtnBase, background: 'linear-gradient(135deg,#41b0f8,#3dd9b0)', color: '#fff', border: 'none' }}>참여</button>
              </div>
            )}
          </div>
        )}

        {myStance && (
          <div style={{ fontSize: '12px', color: '#5a7a9a', marginTop: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>내 입장:</span><StanceBadge stance={myStance} />
          </div>
        )}

        {/* ── 참여자 ── */}
        <div style={{ ...glassCard, marginTop: '10px', padding: '12px 16px' }}>
          <p style={{ fontSize: '11px', color: '#8faec8', marginBottom: '8px' }}>참여자 {totalCount}명</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {discussion.discussion_participants.map(p => {
              const sc = stanceStyle(p.stance)
              return (
                <span key={p.user_id} style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '12px', border: `1px solid ${sc.border}`, background: sc.bg, color: sc.text }}>
                  {p.profiles?.nickname} <span style={{ opacity: 0.7 }}>· {p.stance}</span>
                </span>
              )
            })}
            {!userId && (
              <Link href="/auth/login" style={{ fontSize: '11px', color: '#8faec8', padding: '3px 10px', border: '1px dashed rgba(100,150,200,0.4)', borderRadius: '12px', textDecoration: 'none' }}>
                + 참여하기
              </Link>
            )}
          </div>
        </div>

        {/* ── 관리자 공지 ── */}
        {(discussion.notice || (isAdmin && isPaused)) && (
          <div style={{ background: 'rgba(255,251,235,0.92)', border: '1.5px solid rgba(253,230,138,0.6)', borderRadius: '14px', padding: '14px 18px', marginTop: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: noticeEditing ? '10px' : (discussion.notice ? '8px' : '0') }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#92400E' }}>📢 관리자 공지</span>
              {isAdmin && !noticeEditing && (
                <button onClick={() => setNoticeEditing(true)} style={{ fontSize: '11px', color: '#B45309', background: 'none', border: 'none', cursor: 'pointer', marginLeft: 'auto', fontFamily: 'inherit', textDecoration: 'underline', textUnderlineOffset: '2px' }}>
                  {discussion.notice ? '수정' : '공지 작성'}
                </button>
              )}
            </div>
            {noticeEditing ? (
              <div>
                <textarea value={noticeText} onChange={e => setNoticeText(e.target.value)} placeholder="공지를 입력해주세요..." rows={4}
                  style={{ width: '100%', border: '1px solid rgba(253,230,138,0.8)', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: '#1C1917', background: 'rgba(255,255,255,0.8)', fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box', lineHeight: 1.6 }} />
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
                  <button onClick={() => { setNoticeEditing(false); setNoticeText(discussion.notice || '') }} style={outlineBtn}>취소</button>
                  {discussion.notice && <button onClick={() => { setNoticeText(''); saveNotice() }} style={{ ...outlineBtn, color: '#DC2626', borderColor: '#FCA5A5' }}>공지 삭제</button>}
                  <button onClick={saveNotice} disabled={noticeSaving} style={gradBtn}>{noticeSaving ? '저장 중...' : '저장'}</button>
                </div>
              </div>
            ) : discussion.notice ? (
              <p style={{ fontSize: '13px', color: '#78716C', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{discussion.notice}</p>
            ) : null}
          </div>
        )}

        {/* ── 일시정지 배너 ── */}
        {isPaused && (
          <div style={{ background: 'rgba(255,247,237,0.92)', border: '1px solid rgba(253,230,138,0.6)', borderRadius: '14px', padding: '14px 18px', marginTop: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '16px' }}>⏸</span>
            <div>
              <p style={{ fontSize: '13px', fontWeight: 500, color: '#92400E' }}>토론이 일시정지 중이에요</p>
              <p style={{ fontSize: '12px', color: '#B45309', marginTop: '2px' }}>관리자가 재개할 때까지 발언이 제한됩니다</p>
            </div>
            {isAdmin && (
              <button onClick={() => adminSetStatus('active')} disabled={adminLoading} style={{ marginLeft: 'auto', fontSize: '12px', fontWeight: 500, color: '#065F46', background: '#ECFDF5', border: '1px solid #6EE7B7', borderRadius: '8px', padding: '6px 14px', cursor: 'pointer', fontFamily: 'inherit' }}>
                재개하기
              </button>
            )}
          </div>
        )}

        {/* ── 어드민 컨트롤 ── */}
        {isAdmin && !isEnded && (
          <div style={{ background: 'rgba(245,243,255,0.92)', border: '1px solid rgba(221,214,254,0.7)', borderRadius: '14px', padding: '12px 16px', marginTop: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#4C1D95' }}>🛡 관리자</span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                {discussion.status === 'active' && (
                  <button onClick={() => adminSetStatus('paused')} disabled={adminLoading} style={adminBtnStyle('#92400E','#FFFBEB','#FDE68A')}>⏸ 일시정지</button>
                )}
                {discussion.status === 'paused' && (
                  <button onClick={() => adminSetStatus('active')} disabled={adminLoading} style={adminBtnStyle('#065F46','#ECFDF5','#6EE7B7')}>▶ 재개</button>
                )}
                <button onClick={() => adminSetStatus('ended')} disabled={adminLoading} style={adminBtnStyle('#DC2626','#FEF2F2','#FCA5A5')}>■ 종료</button>
              </div>
            </div>
          </div>
        )}

        {/* ── 연장 요청 패널 ── */}
        {isEnded && (
          <div style={{ ...glassCard, marginTop: '10px' }}>
            <p style={{ fontSize: '13px', fontWeight: 500, color: '#0d1f3c', marginBottom: '8px' }}>토론이 종료됐어요</p>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', color: '#065F46', background: '#ECFDF5', padding: '3px 10px', borderRadius: '10px' }}>찬성 측 {proExtCount}명 연장 요청</span>
              <span style={{ fontSize: '12px', color: '#9A3412', background: '#FFF7ED', padding: '3px 10px', borderRadius: '10px' }}>반대 측 {conExtCount}명 연장 요청</span>
            </div>
            <p style={{ fontSize: '11px', color: '#8faec8', marginBottom: '12px' }}>찬반 각 1명 이상 요청 시 관리자가 연장할 수 있어요</p>
            {myStance && myStance !== '발제자' && (
              <button onClick={toggleExtRequest} style={{
                fontSize: '12px', fontWeight: 500, padding: '7px 16px', borderRadius: '10px', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                background: myExtRequest ? 'rgba(255,255,255,0.5)' : 'linear-gradient(135deg,#41b0f8,#3dd9b0)',
                color: myExtRequest ? '#5a7a9a' : '#fff',
                border: myExtRequest ? '1px solid rgba(100,150,200,0.3)' : 'none',
              }}>
                {myExtRequest ? '✓ 연장 요청 취소' : '토론 연장 요청하기'}
              </button>
            )}
            {canAdminExtend && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(100,150,200,0.15)' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#4C1D95' }}>🛡 연장 가능</span>
                <select value={extHours} onChange={e => setExtHours(Number(e.target.value))}
                  style={{ height: '32px', border: '1px solid rgba(221,214,254,0.8)', borderRadius: '8px', padding: '0 8px', fontSize: '12px', background: 'rgba(255,255,255,0.8)', fontFamily: 'inherit', cursor: 'pointer' }}>
                  <option value={24}>+24시간</option>
                  <option value={48}>+48시간</option>
                  <option value={72}>+72시간</option>
                </select>
                <button onClick={() => adminExtend(extHours)} disabled={adminLoading} style={adminBtnStyle('#4C1D95','#F5F3FF','#DDD6FE')}>연장하기</button>
              </div>
            )}
          </div>
        )}

        {/* ── 발언 피드 ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px', marginBottom: '24px' }}>
          {posts.length === 0 ? (
            <div style={{ padding: '32px 0', textAlign: 'center', color: '#8faec8', fontSize: '13px' }}>
              아직 발언이 없어요. 첫 논거를 제시해보세요.
            </div>
          ) : (
            topPosts.map(post => (
              <PostCard
                key={post.id}
                post={post}
                replies={getReplies(post.id)}
                agreed={agreedPosts.has(post.id)}
                repliesAgreed={agreedPosts}
                onAgree={toggleAgree}
                onReply={p => {
                  setReplyTarget(p); setPostType('rebuttal')
                  document.getElementById('post-editor')?.scrollIntoView({ behavior: 'smooth' })
                }}
                formatTime={formatTime}
              />
            ))
          )}
          <div ref={feedEndRef} />
        </div>

        {!userId && (
          <div style={{ textAlign: 'center', padding: '16px', background: 'rgba(255,255,255,0.7)', borderRadius: '14px', fontSize: '13px', color: '#5a7a9a' }}>
            <Link href="/auth/login" style={{ color: '#1a8cf5', fontWeight: 500, textDecoration: 'underline', textUnderlineOffset: '2px' }}>로그인</Link>하면 토론에 참여할 수 있어요
          </div>
        )}
      </main>

      {/* ── 발언 작성 하단 고정 ── */}
      {canPost && (
        <div id="post-editor" style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: 'rgba(240,249,255,0.97)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderTop: '1px solid rgba(255,255,255,0.7)',
          padding: '12px 24px 16px', zIndex: 50,
          boxShadow: '0 -4px 24px rgba(0,60,120,0.10)',
        }}>
          <div style={{ maxWidth: '760px', margin: '0 auto' }}>
            {replyTarget && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', padding: '6px 10px', background: 'rgba(255,255,255,0.6)', borderRadius: '8px' }}>
                <span style={{ fontSize: '11px', color: '#5a7a9a' }}>↩ {replyTarget.profiles?.nickname}의 발언에 {postType === 'question' ? '질문' : '반론'}</span>
                <button onClick={() => { setReplyTarget(null); setPostType('argument') }} style={{ fontSize: '11px', color: '#8faec8', background: 'none', border: 'none', cursor: 'pointer', marginLeft: 'auto' }}>✕</button>
              </div>
            )}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
              {(['argument', 'rebuttal', 'question'] as const).map(t => {
                const pt = POST_TYPE_LABEL[t]
                return (
                  <button key={t} onClick={() => setPostType(t)} style={{
                    fontSize: '11px', padding: '4px 12px', borderRadius: '12px', cursor: 'pointer',
                    fontFamily: 'inherit', transition: 'all 0.1s', border: '1px solid',
                    borderColor: postType === t ? pt.color : 'rgba(100,150,200,0.3)',
                    background: postType === t ? pt.bg : 'transparent',
                    color: postType === t ? pt.color : '#8faec8',
                  }}>
                    {pt.label}
                  </button>
                )
              })}
              {myStance && <StanceBadge stance={myStance} />}
            </div>
            <div style={{ marginBottom: '8px' }}>
              <QuillEditor
                value={postContent} onChange={setPostContent}
                placeholder={postType === 'argument' ? '논거를 입력해주세요...' : postType === 'rebuttal' ? '반론을 입력해주세요...' : '질문을 입력해주세요...'}
                minHeight={80}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={submitPost} disabled={submitting} style={{
                fontSize: '13px', fontWeight: 600, color: '#fff',
                background: submitting ? 'rgba(100,150,200,0.4)' : 'linear-gradient(135deg,#41b0f8,#3dd9b0)',
                border: 'none', borderRadius: '10px', padding: '8px 20px',
                cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                boxShadow: submitting ? 'none' : '0 3px 10px rgba(65,176,248,0.35)',
              }}>
                {submitting ? '전송 중...' : '전송'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── 서브 컴포넌트 ── */

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string; dot: string }> = {
    active: { label: '진행중',   color: '#065F46', dot: '#10B981' },
    paused: { label: '일시정지', color: '#92400E', dot: '#F59E0B' },
    ended:  { label: '종료됨',   color: '#44403C', dot: '#A8A29E' },
  }
  const s = map[status] || map.ended
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 500, color: s.color, background: `${s.dot}18`, padding: '3px 10px', borderRadius: '10px' }}>
      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: s.dot, display: 'inline-block' }} />
      {s.label}
    </span>
  )
}

function StanceBadge({ stance }: { stance: string }) {
  const sc = STANCE_COLOR[stance] || { text: '#1C1917', bg: '#F5F5F4', border: '#E7E5E4' }
  return (
    <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '12px', border: `1px solid ${sc.border}`, background: sc.bg, color: sc.text, display: 'inline-block' }}>
      {stance}
    </span>
  )
}

function PostCard({ post, replies, agreed, repliesAgreed, onAgree, onReply, formatTime }: {
  post: PostFull; replies: PostFull[]
  agreed: boolean; repliesAgreed: Set<string>
  onAgree: (id: string) => void; onReply: (post: PostFull) => void
  formatTime: (s: string) => string
}) {
  const pt = POST_TYPE_LABEL[post.post_type]
  return (
    <div>
      <div style={glassCard}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', fontWeight: 500, color: pt.color, background: pt.bg, padding: '2px 8px', borderRadius: '8px' }}>{pt.label}</span>
          {post.stance && <StanceBadge stance={post.stance} />}
          <span style={{ fontSize: '12px', fontWeight: 500, color: '#0d1f3c' }}>{post.profiles?.nickname}</span>
          <span style={{ fontSize: '11px', color: '#8faec8' }}>{formatTime(post.created_at)}</span>
        </div>
        <div className="wiki-body" style={{ fontSize: '14px', lineHeight: 1.8 }} dangerouslySetInnerHTML={{ __html: post.content }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(100,150,200,0.12)' }}>
          <button onClick={() => onAgree(post.id)} style={{
            fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px',
            padding: '4px 10px', borderRadius: '14px', cursor: 'pointer', fontFamily: 'inherit',
            border: `1px solid ${agreed ? '#1a8cf5' : 'rgba(100,150,200,0.25)'}`,
            background: agreed ? 'rgba(26,140,245,0.08)' : 'transparent',
            color: agreed ? '#1a8cf5' : '#8faec8', transition: 'all 0.15s',
          }}>
            {agreed ? '♥' : '♡'} 동의{post.agree_count > 0 ? ` ${post.agree_count}` : ''}
          </button>
          <button onClick={() => onReply(post)} style={{ fontSize: '12px', color: '#8faec8', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
            ↩ 반론·질문
          </button>
        </div>
      </div>
      {replies.map(r => {
        const rpt = POST_TYPE_LABEL[r.post_type]
        const rAgreed = repliesAgreed.has(r.id)
        return (
          <div key={r.id} style={{ marginLeft: '20px', marginTop: '4px', background: 'rgba(255,255,255,0.70)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.6)', borderRadius: '12px', padding: '12px 16px', borderLeft: `3px solid ${rpt.color}50` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '10px' }}>↩</span>
              <span style={{ fontSize: '11px', fontWeight: 500, color: rpt.color, background: rpt.bg, padding: '2px 7px', borderRadius: '7px' }}>{rpt.label}</span>
              {r.stance && <StanceBadge stance={r.stance} />}
              <span style={{ fontSize: '12px', fontWeight: 500, color: '#0d1f3c' }}>{r.profiles?.nickname}</span>
              <span style={{ fontSize: '11px', color: '#8faec8' }}>{formatTime(r.created_at)}</span>
            </div>
            <div className="wiki-body" style={{ fontSize: '13px', lineHeight: 1.8 }} dangerouslySetInnerHTML={{ __html: r.content }} />
            <div style={{ marginTop: '8px' }}>
              <button onClick={() => onAgree(r.id)} style={{
                fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px',
                padding: '3px 9px', borderRadius: '12px', cursor: 'pointer', fontFamily: 'inherit',
                border: `1px solid ${rAgreed ? '#1a8cf5' : 'rgba(100,150,200,0.25)'}`,
                background: rAgreed ? 'rgba(26,140,245,0.08)' : 'transparent',
                color: rAgreed ? '#1a8cf5' : '#8faec8', transition: 'all 0.15s',
              }}>
                {rAgreed ? '♥' : '♡'} 동의{r.agree_count > 0 ? ` ${r.agree_count}` : ''}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── 공통 스타일 ── */
const glassCard: React.CSSProperties = {
  background: 'rgba(255,255,255,0.85)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: '1px solid rgba(255,255,255,0.65)',
  borderRadius: '16px',
  padding: '18px 20px',
}
const stanceBtnBase: React.CSSProperties = {
  padding: '8px 20px', borderRadius: '10px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px', fontWeight: 500, transition: 'all 0.15s',
}
const outlineBtn: React.CSSProperties = {
  fontSize: '12px', color: '#5a7a9a', background: 'none', border: '1px solid rgba(100,150,200,0.3)', borderRadius: '8px', padding: '5px 14px', cursor: 'pointer', fontFamily: 'inherit',
}
const gradBtn: React.CSSProperties = {
  fontSize: '12px', fontWeight: 600, color: '#fff', background: 'linear-gradient(135deg,#41b0f8,#3dd9b0)', border: 'none', borderRadius: '8px', padding: '5px 16px', cursor: 'pointer', fontFamily: 'inherit',
}
function adminBtnStyle(color: string, bg: string, border: string): React.CSSProperties {
  return { fontSize: '12px', color, background: bg, border: `1px solid ${border}`, borderRadius: '8px', padding: '6px 14px', cursor: 'pointer', fontFamily: 'inherit' }
}
