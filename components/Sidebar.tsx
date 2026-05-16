'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { TabType } from './BottomNav'

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
  activeTab: TabType
  onTabChange: (tab: TabType) => void
}

const NAV_ITEMS = [
  { id: 'home' as TabType,       icon: 'home',     label: '메인홈 · 대시보드', href: '/' },
  { id: 'discussion' as TabType, icon: 'chat',     label: '담론',             href: '/discussions' },
  { id: 'procon' as TabType,     icon: 'scale',    label: '찬반의견',          href: '/discussions?format=pros_cons' },
]

const EXTRA_ITEMS = [
  { icon: 'wiki',     label: '위키 문서',   href: '/wiki' },
  { icon: 'bookmark', label: '저장한 항목', href: '/saved' },
  { icon: 'person',   label: '마이페이지',  href: '/profile' },
]

const ICONS: Record<string, React.ReactNode> = {
  home: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 9.5L12 3l9 6.5V19a1 1 0 01-1 1h-4v-5H8v5H4a1 1 0 01-1-1V9.5z" />
    </svg>
  ),
  chat: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  ),
  scale: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z" />
      <path d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3H10z" />
    </svg>
  ),
  wiki: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  ),
  bookmark: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
    </svg>
  ),
  person: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  logout: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  ),
  close: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="white" strokeWidth="2" strokeLinecap="round">
      <line x1="6" y1="18" x2="18" y2="6" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  chevronRight: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18l6-6-6-6" />
    </svg>
  ),
}

export default function Sidebar({ isOpen, onClose, activeTab, onTabChange }: SidebarProps) {
  const supabase = createClient()
  const router = useRouter()
  const [nickname, setNickname] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setEmail(data.user.email ?? null)
        supabase.from('profiles').select('nickname').eq('id', data.user.id).single()
          .then(({ data: p }) => { if (p) setNickname(p.nickname) })
      }
    })
  }, [])

  // 열릴 때 body 스크롤 잠금
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  async function handleLogout() {
    await supabase.auth.signOut()
    onClose()
    router.push('/')
    router.refresh()
  }

  return (
    <>
      {/* 딤 오버레이 */}
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,30,60,0.38)',
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'all' : 'none',
          transition: 'opacity 0.28s ease',
        }}
      />

      {/* 드로어 */}
      <aside
        aria-label="사이드 메뉴"
        aria-hidden={!isOpen}
        style={{
          position: 'fixed',
          top: 0, left: 0, bottom: 0,
          zIndex: 201,
          width: '78%',
          maxWidth: '300px',
          background: 'rgba(240,249,255,0.98)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.3s cubic-bezier(0.32,0.72,0,1)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: isOpen ? '4px 0 40px rgba(0,30,60,0.18)' : 'none',
        }}
      >
        {/* 헤더 (그라디언트) */}
        <div style={{
          padding: 'env(safe-area-inset-top, 56px) 24px 24px',
          paddingTop: '56px',
          background: 'linear-gradient(135deg, #41b0f8 0%, #3dd9b0 100%)',
          position: 'relative',
          flexShrink: 0,
        }}>
          {/* 닫기 버튼 */}
          <button
            onClick={onClose}
            aria-label="메뉴 닫기"
            style={{
              position: 'absolute', top: '56px', right: '16px',
              background: 'rgba(255,255,255,0.25)',
              border: 'none', cursor: 'pointer',
              borderRadius: '50%', width: '32px', height: '32px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {ICONS.close}
          </button>

          {/* 아바타 */}
          <div style={{
            width: '52px', height: '52px', borderRadius: '50%',
            background: 'rgba(255,255,255,0.28)',
            border: '2px solid rgba(255,255,255,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: '12px', color: '#fff',
          }}>
            {ICONS.person}
          </div>

          <div style={{ fontSize: '15px', fontWeight: 600, color: '#fff', letterSpacing: '-0.3px' }}>
            {nickname ?? 'N의 위키 사용자'}
          </div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.75)', marginTop: '2px' }}>
            {email ?? '로그인이 필요해요'}
          </div>
        </div>

        {/* 주요 메뉴 */}
        <nav style={{ paddingTop: '8px', flexShrink: 0 }}>
          {NAV_ITEMS.map(item => {
            const active = activeTab === item.id
            return (
              <button
                key={item.id}
                onClick={() => { onTabChange(item.id); onClose() }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '14px',
                  width: '100%', padding: '14px 24px',
                  background: active ? 'rgba(26,140,245,0.08)' : 'transparent',
                  border: 'none',
                  borderLeft: active ? '3px solid #1a8cf5' : '3px solid transparent',
                  cursor: 'pointer', textAlign: 'left',
                  fontFamily: 'inherit',
                  transition: 'background 0.15s',
                  color: active ? '#1a8cf5' : '#0d1f3c',
                }}
              >
                <div style={{
                  width: '36px', height: '36px', borderRadius: '10px',
                  background: active
                    ? 'linear-gradient(135deg, #41b0f8, #3dd9b0)'
                    : 'rgba(100,150,200,0.12)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                  color: active ? '#fff' : '#5a7a9a',
                  transition: 'all 0.2s',
                }}>
                  {ICONS[item.icon]}
                </div>
                <span style={{
                  fontSize: '14px',
                  fontWeight: active ? 600 : 400,
                  letterSpacing: '-0.2px',
                  flex: 1,
                }}>
                  {item.label}
                </span>
                {active && (
                  <span style={{ color: '#8faec8' }}>{ICONS.chevronRight}</span>
                )}
              </button>
            )
          })}
        </nav>

        {/* 구분선 */}
        <div style={{ height: '1px', background: 'rgba(100,150,200,0.15)', margin: '8px 20px' }} />

        {/* 추가 메뉴 */}
        <nav style={{ flex: 1, overflowY: 'auto' }}>
          {EXTRA_ITEMS.map(item => (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              style={{
                display: 'flex', alignItems: 'center', gap: '14px',
                padding: '12px 24px',
                textDecoration: 'none',
                color: '#0d1f3c',
              }}
            >
              <div style={{
                width: '36px', height: '36px', borderRadius: '10px',
                background: 'rgba(100,150,200,0.10)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, color: '#5a7a9a',
              }}>
                {ICONS[item.icon]}
              </div>
              <span style={{ fontSize: '14px', fontWeight: 400, letterSpacing: '-0.2px' }}>
                {item.label}
              </span>
            </Link>
          ))}
        </nav>

        {/* 로그아웃 */}
        <div style={{
          padding: '16px 24px',
          paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
          borderTop: '1px solid rgba(100,150,200,0.15)',
          flexShrink: 0,
        }}>
          <button
            onClick={handleLogout}
            style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#5a7a9a', fontSize: '13px', fontFamily: 'inherit',
            }}
          >
            <span style={{ color: '#5a7a9a' }}>{ICONS.logout}</span>
            로그아웃
          </button>
        </div>
      </aside>
    </>
  )
}
