'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import AppHeader from '@/components/AppHeader'
import BottomNav, { TabType } from '@/components/BottomNav'
import Sidebar from '@/components/Sidebar'
import Link from 'next/link'
import type { Document } from '@/lib/supabase'

type DocWithMeta = Document & { profiles?: { nickname: string } }

export default function WikiIndexPage() {
  const supabase = createClient()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [docs, setDocs] = useState<DocWithMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id || null))
  }, [])

  useEffect(() => {
    setLoading(true)
    supabase
      .from('documents')
      .select('*, profiles!documents_author_id_fkey(nickname)')
      .eq('type', 'concept').eq('status', 'published')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setDocs((data as DocWithMeta[]) || [])
        setLoading(false)
      })
  }, [])

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

      <AppHeader onMenuOpen={() => setSidebarOpen(true)} title="위키 문서" />

      <main style={mainStyle}>
        <div style={sectionHeader}>
          <span style={sectionTitle}>개념 · 용어 · 인물</span>
          {userId && (
            <Link href="/wiki/new?type=concept" style={actionBtn}>+ 작성</Link>
          )}
        </div>

        {loading ? (
          <p style={emptyStyle}>불러오는 중...</p>
        ) : docs.length === 0 ? (
          <p style={emptyStyle}>아직 위키 문서가 없어요</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {docs.map(doc => (
              <Link key={doc.id} href={`/wiki/${doc.slug}`} style={{ textDecoration: 'none' }}>
                <div style={glassCard}>
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
  fontSize: '12px', fontWeight: 600, color: '#fff',
  textDecoration: 'none', padding: '7px 14px',
  background: 'linear-gradient(135deg, #41b0f8, #3dd9b0)',
  borderRadius: '10px',
  boxShadow: '0 3px 10px rgba(65,176,248,0.35)',
}
const emptyStyle: React.CSSProperties = {
  padding: '40px 0', textAlign: 'center', color: '#8faec8', fontSize: '13px',
}
