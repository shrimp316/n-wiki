'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Navbar from '@/components/Navbar'
import Link from 'next/link'

type SearchResult = {
  id: string
  title: string
  tab: 'kakao' | 'concept' | 'discussion'
  tags: string[]
  author: string
  created_at: string
  href: string
}

const TAB_META = {
  kakao:      { label: '카카오톡 담론', color: '#92400E', bg: '#FEF9C3', border: '#FDE68A' },
  concept:    { label: '개념 문서',    color: '#1E40AF', bg: '#EFF6FF', border: '#BFDBFE' },
  discussion: { label: '토론',         color: '#065F46', bg: '#ECFDF5', border: '#6EE7B7' },
}

function SearchResults() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const q = searchParams.get('q') || ''
  const supabase = createClient()

  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [inputValue, setInputValue] = useState(q)

  useEffect(() => {
    setInputValue(q)
    if (!q.trim()) { setResults([]); setSearched(false); return }
    runSearch(q.trim())
  }, [q])

  async function runSearch(query: string) {
    setLoading(true)
    setSearched(false)

    const [docsRes, discRes] = await Promise.all([
      supabase
        .from('documents')
        .select('id, slug, title, type, tags, created_at, profiles!documents_author_id_fkey(nickname)')
        .eq('status', 'published')
        .or(`title.ilike.%${query}%,body.ilike.%${query}%`)
        .order('created_at', { ascending: false })
        .limit(20),

      supabase
        .from('discussions')
        .select('id, title, tags, created_at, profiles!discussions_author_id_fkey(nickname)')
        .or(`title.ilike.%${query}%,body.ilike.%${query}%`)
        .order('created_at', { ascending: false })
        .limit(20),
    ])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const docResults: SearchResult[] = (docsRes.data || []).map((d: any) => ({
      id: d.id,
      title: d.title,
      tab: d.type as 'kakao' | 'concept',
      tags: d.tags || [],
      author: d.profiles?.nickname || '',
      created_at: d.created_at,
      href: `/wiki/${d.slug}`,
    }))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const discResults: SearchResult[] = (discRes.data || []).map((d: any) => ({
      id: d.id,
      title: d.title,
      tab: 'discussion' as const,
      tags: d.tags || [],
      author: d.profiles?.nickname || '',
      created_at: d.created_at,
      href: `/discussions/${d.id}`,
    }))

    const combined = [...docResults, ...discResults].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )

    setResults(combined)
    setLoading(false)
    setSearched(true)
  }

  function formatDate(s: string) {
    const d = new Date(s)
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  }

  function handleSearch() {
    const trimmed = inputValue.trim()
    if (!trimmed) return
    router.push(`/search?q=${encodeURIComponent(trimmed)}`)
  }

  return (
    <>
      <Navbar />
      <main style={{ maxWidth: '720px', margin: '0 auto', padding: '32px 24px' }}>

        <div style={{ marginBottom: '28px' }}>
          <Link href="/" style={{ fontSize: '12px', color: '#A8A29E', textDecoration: 'none' }}>← 홈</Link>
          <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1C1917', marginTop: '6px', letterSpacing: '-0.3px' }}>검색</h1>
        </div>

        {/* 검색 인풋 */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '14px', color: '#A8A29E', pointerEvents: 'none' }}>🔍</span>
            <input
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="검색어를 입력하세요..."
              autoFocus
              style={{
                width: '100%', height: '44px',
                border: '1px solid #E7E5E4', borderRadius: '10px',
                paddingLeft: '38px', paddingRight: '16px',
                fontSize: '14px', color: '#1C1917', background: '#FFFFFF',
                fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
          <button
            onClick={handleSearch}
            style={{
              height: '44px', padding: '0 20px',
              background: '#1C1917', color: '#FAFAF9',
              border: 'none', borderRadius: '10px',
              fontSize: '13px', fontWeight: 500,
              cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
            }}
          >
            검색
          </button>
        </div>

        {/* 결과 */}
        {loading ? (
          <div style={{ padding: '48px 0', textAlign: 'center', color: '#A8A29E', fontSize: '13px' }}>
            검색 중...
          </div>
        ) : !q.trim() ? (
          <div style={{ padding: '48px 0', textAlign: 'center', color: '#A8A29E', fontSize: '13px' }}>
            검색어를 입력해주세요
          </div>
        ) : searched && results.length === 0 ? (
          <div style={{ padding: '48px 0', textAlign: 'center' }}>
            <p style={{ fontSize: '15px', color: '#1C1917', fontWeight: 500, marginBottom: '6px' }}>
              &ldquo;{q}&rdquo; 검색 결과가 없어요
            </p>
            <p style={{ fontSize: '13px', color: '#A8A29E' }}>다른 키워드로 검색해보세요</p>
          </div>
        ) : results.length > 0 ? (
          <>
            <p style={{ fontSize: '12px', color: '#A8A29E', marginBottom: '12px' }}>
              &ldquo;{q}&rdquo; 검색 결과 {results.length}건
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {results.map(r => {
                const meta = TAB_META[r.tab]
                return (
                  <Link key={r.id} href={r.href} style={{ textDecoration: 'none' }}>
                    <div
                      style={{ padding: '16px', background: '#FFFFFF', border: '1px solid #E7E5E4', borderRadius: '10px', transition: 'border-color 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = '#A8A29E')}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = '#E7E5E4')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <span style={{
                          fontSize: '11px', fontWeight: 500,
                          color: meta.color, background: meta.bg,
                          border: `1px solid ${meta.border}`,
                          padding: '2px 8px', borderRadius: '10px',
                        }}>
                          {meta.label}
                        </span>
                      </div>
                      <h2 style={{ fontSize: '15px', fontWeight: 500, color: '#1C1917', marginBottom: '6px', lineHeight: 1.4 }}>
                        {r.title}
                      </h2>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        {r.tags.slice(0, 3).map(tag => (
                          <span key={tag} style={{ fontSize: '11px', color: '#A8A29E' }}>#{tag}</span>
                        ))}
                        <span style={{ fontSize: '11px', color: '#A8A29E', marginLeft: 'auto' }}>
                          {r.author} · {formatDate(r.created_at)}
                        </span>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </>
        ) : null}

      </main>
    </>
  )
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchResults />
    </Suspense>
  )
}
