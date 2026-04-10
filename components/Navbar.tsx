'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import type { Notification } from '@/lib/supabase'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function Navbar() {
  const supabase = createClient()
  const router = useRouter()
  const [nickname, setNickname] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const unreadCount = notifications.filter(n => !n.is_read).length

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUserId(data.user.id)
        supabase.from('profiles').select('nickname').eq('id', data.user.id).single()
          .then(({ data: p }) => { if (p) setNickname(p.nickname) })
        loadNotifications(data.user.id)
      }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      if (!session) { setNickname(null); setUserId(null); setNotifications([]) }
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel('notifications-' + userId)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      }, payload => {
        setNotifications(prev => [payload.new as Notification, ...prev].slice(0, 20))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId])

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function loadNotifications(uid: string) {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(20)
    if (data) setNotifications(data as Notification[])
  }

  async function handleNotificationClick(notif: Notification) {
    setShowDropdown(false)
    if (!notif.is_read) {
      await supabase.from('notifications').update({ is_read: true }).eq('id', notif.id)
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n))
    }
    router.push(`/discussions/${notif.discussion_id}`)
  }

  async function markAllRead() {
    if (!userId) return
    await supabase.from('notifications').update({ is_read: true })
      .eq('user_id', userId).eq('is_read', false)
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  function formatTime(iso: string) {
    const diff = Date.now() - new Date(iso).getTime()
    const m = Math.floor(diff / 60000)
    if (m < 1) return '방금'
    if (m < 60) return `${m}분 전`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}시간 전`
    return `${Math.floor(h / 24)}일 전`
  }

  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 100,
      background: '#FFFFFF', borderBottom: '1px solid #E7E5E4',
      padding: '0 24px', height: '52px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <Link href="/" style={{ fontSize: '15px', fontWeight: 600, color: '#1C1917', textDecoration: 'none', letterSpacing: '-0.3px' }}>
        N의 위키
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {nickname ? (
          <>
            {/* 알림 벨 */}
            <div ref={dropdownRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setShowDropdown(v => !v)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', gap: '4px', position: 'relative' }}
              >
                <span style={{ fontSize: '16px', lineHeight: 1 }}>🔔</span>
                {unreadCount > 0 && (
                  <span style={{
                    position: 'absolute', top: '0', right: '0',
                    minWidth: '16px', height: '16px',
                    background: '#DC2626', color: '#FFFFFF',
                    fontSize: '10px', fontWeight: 700,
                    borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '0 3px', lineHeight: 1,
                  }}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {showDropdown && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                  width: '300px', background: '#FFFFFF',
                  border: '1px solid #E7E5E4', borderRadius: '12px',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                  overflow: 'hidden', zIndex: 200,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #F5F5F4' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#1C1917' }}>알림</span>
                    {unreadCount > 0 && (
                      <button onClick={markAllRead} style={{ fontSize: '11px', color: '#A8A29E', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                        모두 읽음
                      </button>
                    )}
                  </div>
                  {notifications.length === 0 ? (
                    <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: '12px', color: '#A8A29E' }}>알림이 없어요</div>
                  ) : (
                    notifications.slice(0, 5).map(n => (
                      <button
                        key={n.id}
                        onClick={() => handleNotificationClick(n)}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left',
                          padding: '12px 16px', background: n.is_read ? '#FFFFFF' : '#F5F5F4',
                          border: 'none', borderBottom: '1px solid #F5F5F4',
                          cursor: 'pointer', fontFamily: 'inherit',
                        }}
                      >
                        <div style={{ fontSize: '12px', color: '#1C1917', lineHeight: 1.5, marginBottom: '3px' }}>{n.message}</div>
                        <div style={{ fontSize: '11px', color: '#A8A29E' }}>{formatTime(n.created_at)}</div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <span style={{ fontSize: '13px', color: '#78716C' }}>{nickname}</span>
            <button onClick={handleLogout} style={{ fontSize: '12px', color: '#A8A29E', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
              로그아웃
            </button>
          </>
        ) : (
          <>
            <Link href="/auth/login" style={{ fontSize: '13px', color: '#78716C', textDecoration: 'none' }}>로그인</Link>
            <Link href="/auth/signup" style={{ fontSize: '13px', color: '#1C1917', fontWeight: 500, textDecoration: 'none', padding: '6px 14px', border: '1px solid #E7E5E4', borderRadius: '8px' }}>
              가입하기
            </Link>
          </>
        )}
      </div>
    </header>
  )
}
