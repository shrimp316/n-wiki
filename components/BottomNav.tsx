'use client'

export type TabType = 'home' | 'discussion' | 'procon'

interface BottomNavProps {
  activeTab: TabType
  onTabChange: (tab: TabType) => void
}

const TABS: { id: TabType; label: string; href: string; icon: React.ReactNode }[] = [
  {
    id: 'home',
    label: '홈',
    href: '/',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9.5L12 3l9 6.5V19a1 1 0 01-1 1h-4v-5H8v5H4a1 1 0 01-1-1V9.5z" />
      </svg>
    ),
  },
  {
    id: 'discussion',
    label: '담론',
    href: '/discussions',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
      </svg>
    ),
  },
  {
    id: 'procon',
    label: '찬반의견',
    href: '/discussions?format=pros_cons',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z" />
        <path d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3H10z" />
      </svg>
    ),
  },
]

export default function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  return (
    <nav
      aria-label="하단 탭 내비게이션"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: 'rgba(255,255,255,0.90)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(255,255,255,0.7)',
        display: 'flex',
        alignItems: 'center',
        padding: '8px 0 env(safe-area-inset-bottom, 16px)',
        boxShadow: '0 -4px 24px rgba(0,60,120,0.08)',
        zIndex: 100,
      }}
    >
      {TABS.map(t => {
        const active = activeTab === t.id
        return (
          <button
            key={t.id}
            onClick={() => onTabChange(t.id)}
            aria-current={active ? 'page' : undefined}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              padding: '6px 0',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'all 0.2s',
              color: active ? '#1a8cf5' : '#8faec8',
            }}
          >
            {/* 아이콘 pill */}
            <div style={{
              width: '48px',
              height: '30px',
              borderRadius: '15px',
              background: active
                ? 'linear-gradient(135deg, #41b0f8, #3dd9b0)'
                : 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.25s cubic-bezier(0.34,1.56,0.64,1)',
              transform: active ? 'scale(1.05)' : 'scale(1)',
              boxShadow: active ? '0 4px 12px rgba(65,176,248,0.4)' : 'none',
              color: active ? '#fff' : '#8faec8',
            }}>
              {/* 홈 아이콘은 fill 방식 */}
              {t.id === 'home' ? (
                <svg width="20" height="20" viewBox="0 0 24 24"
                  fill={active ? '#fff' : 'none'}
                  stroke={active ? 'none' : '#8faec8'}
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 9.5L12 3l9 6.5V19a1 1 0 01-1 1h-4v-5H8v5H4a1 1 0 01-1-1V9.5z" />
                </svg>
              ) : (
                <div style={{ color: active ? '#fff' : '#8faec8' }}>
                  {t.icon}
                </div>
              )}
            </div>

            <span style={{
              fontSize: '11px',
              fontWeight: active ? 600 : 400,
              letterSpacing: '-0.2px',
              color: active ? '#1a8cf5' : '#8faec8',
            }}>
              {t.label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
