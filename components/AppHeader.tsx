'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import type { Notification } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

interface AppHeaderProps {
  onMenuOpen: () => void
  title?: string
}

export default function AppHeader({ onMenuOpen, title = 'N의 위키' }: AppHeaderProps) {
  const supabase = createClient()
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const unreadCount = notifications.filter(n => !n.is_read).length

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUserId(data.user.id)
        loadNotifications(data.user.id)
      }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      if (!session) { setUserId(null); setNotifications([]) }
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel('notifications-hdr-' + userId)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${userId}`,
      }, payload => {
        setNotifications(prev => [payload.new as Notification, ...prev].slice(0, 20))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId])

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
      .from('notifications').select('*')
      .eq('user_id', uid).order('created_at', { ascending: false }).limit(20)
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
      background: 'linear-gradient(135deg, #41b0f8 0%, #3dd9b0 100%)',
      padding: '12px 20px 16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexShrink: 0,
      position: 'sticky',
      top: 0,
      zIndex: 50,
    }}>
      {/* 햄버거 메뉴 버튼 */}
      <button
        onClick={onMenuOpen}
        aria-label="메뉴 열기"
        style={{
          background: 'rgba(255,255,255,0.22)',
          border: 'none',
          cursor: 'pointer',
          borderRadius: '12px',
          width: '40px',
          height: '40px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          flexShrink: 0,
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
          stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {/* 타이틀 */}
      <span style={{
        fontSize: '17px', fontWeight: 700, color: '#fff', letterSpacing: '-0.4px',
      }}>
        {title}
      </span>

      {/* 알림 벨 */}
      <div ref={dropdownRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setShowDropdown(v => !v)}
          style={{
            background: 'rgba(255,255,255,0.22)',
            border: 'none', cursor: 'pointer',
            borderRadius: '12px', width: '40px', height: '40px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            position: 'relative',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          {unreadCount > 0 && (
            <span style={{
              position: 'absolute', top: '-2px', right: '-2px',
              background: '#ff4d6d', color: '#fff',
              fontSize: '10px', fontWeight: 700,
              borderRadius: '10px', minWidth: '18px', height: '18px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '0 4px', border: '2px solid #41b0f8',
            }}>
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {/* 알림 드롭다운 */}
        {showDropdown && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0,
            width: '300px',
            background: 'rgba(240,249,255,0.96)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.7)',
            borderRadius: '16px',
            boxShadow: '0 8px 32px rgba(0,60,120,0.15)',
            overflow: 'hidden', zIndex: 200,
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 16px', borderBottom: '1px solid rgba(100,150,200,0.15)',
            }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#0d1f3c' }}>알림</span>
              {unreadCount > 0 && (
                <button onClick={markAllRead} style={{
                  fontSize: '11px', color: '#1a8cf5', background: 'none', border: 'none',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  모두 읽음
                </button>
              )}
            </div>
            {notifications.length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: '12px', color: '#8faec8' }}>
                알림이 없어요
              </div>
            ) : (
              notifications.slice(0, 5).map(n => (
                <button key={n.id} onClick={() => handleNotificationClick(n)} style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '12px 16px',
                  background: n.is_read ? 'transparent' : 'rgba(26,140,245,0.06)',
                  border: 'none', borderBottom: '1px solid rgba(100,150,200,0.1)',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  <div style={{ fontSize: '12px', color: '#0d1f3c', lineHeight: 1.5, marginBottom: '3px' }}>
                    {n.message}
                  </div>
                  <div style={{ fontSize: '11px', color: '#8faec8' }}>{formatTime(n.created_at)}</div>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </header>
  )
}
