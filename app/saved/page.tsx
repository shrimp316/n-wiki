'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import AppHeader from '@/components/AppHeader'
import BottomNav, { TabType } from '@/components/BottomNav'
import Sidebar from '@/components/Sidebar'
import Link from 'next/link'
import type { Document } from '@/lib/supabase'

type DocWithMeta = Document & {
  profiles?: { nickname: string }
  kakao_meta?: Array<{ talk_date: string; participants: string[] }>
}

type LikeRow = {
  created_at: string
  documents: DocWithMeta | null
}

export default function SavedPage() {
  const supabase = createClient()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [docs, setDocs] = useState<DocWithMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [authChecked, setAuthChecked] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id || null
      setUserId(uid)
      setAuthChecked(true)
      if (uid) loadSaved(uid)
      else setLoading(false)
    })
  }, [])

  async function loadSaved(uid: string) {
    setLoading(true)
    const { data } = await supabase
      .from('likes')
      .select('created_at, documents(*, profiles!documents_author_id_fkey(nickname), kakao_meta(talk_date, participants))')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
    const rows = (data as unknown as LikeRow[]) || []
    setDocs(rows.map(r => r.documents).filter((d): d is DocWithMeta => d !== null))
    setLoading(false)
  }

  function navigateToTab(t: TabType) {
    setSidebarOpen(false)
    router.push(`/?tab=${t}`)
  }

  const fmt = (s: string) => {
    const d = new Date(s)
    return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`
  }

  return (
    <div style={containerStyle}>
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activeTab="home"
        onTabChange={navigateToTab}
      />

      <AppHeader onMenuOpen={() => setSidebarOpen(true)} title="저장한 항목" />

      <main style={mainStyle}>
        <div style={sectionHeader}>
          <span style={sectionTitle}>좋아요한 문서</span>
        </div>

        {!authChecked || loading ? (
          <p style={emptyStyle}>불러오는 중...</p>
        ) : !userId ? (
          <div style={{ padding: '40px 16px', textAlign: 'center' }}>
            <p style={{ fontSize: '13px', color: '#8faec8', marginBottom: '14px' }}>
              로그인하면 저장한 항목을 볼 수 있어요
            </p>
            <Link href="/auth/login" style={actionBtn}>로그인</Link>
          </div>
        ) : docs.length === 0 ? (
          <p style={emptyStyle}>아직 저장한 항목이 없어요</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
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
        )}
      </main>

      <BottomNav activeTab={'home'} onTabChange={navigateToTab} />
    </div>
  )
}

const containerStyle: React.CSSProperties = {
  minHeight: '100dvh',
  background: 'linear-gradient(160deg, #b8dcf8 0%, #c5eee8 100%)',
  display: 'flex',
  flexDirection: 'column',
}
const mainStyle: React.CSSProperties = {
  flex: 1, maxWidth: '680px', width: '100%', margin: '0 auto', padding: '16px 16px 96px',
}
const sectionHeader: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  marginBottom: '16px',
}
const sectionTitle: React.CSSProperties = {
  fontSize: '14px', fontWeight: 600, color: '#0d1f3c',
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
const glassCard: React.CSSProperties = {
  padding: '14px 16px',
  background: 'rgba(255,255,255,0.82)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: '1px solid rgba(255,255,255,0.65)',
  borderRadius: '14px',
}
const actionBtn: React.CSSProperties = {
  display: 'inline-block',
  fontSize: '13px', fontWeight: 600, color: '#fff',
  textDecoration: 'none', padding: '9px 20px',
  background: 'linear-gradient(135deg, #41b0f8, #3dd9b0)',
  borderRadius: '10px',
  boxShadow: '0 3px 10px rgba(65,176,248,0.35)',
}
const emptyStyle: React.CSSProperties = {
  padding: '40px 0', textAlign: 'center', color: '#8faec8', fontSize: '13px',
}
