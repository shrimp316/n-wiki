'use client'

import { useState, useEffect, Suspense } from 'react'
import { createClient } from '@/lib/supabase'
import Navbar from '@/components/Navbar'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

const QuillEditor = dynamic(() => import('@/components/QuillEditor'), { ssr: false })

type DocType = 'kakao' | 'concept' | 'discussion'

function NewDocForm() {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const type = (searchParams.get('type') || 'concept') as DocType

  const [userId, setUserId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [tags, setTags] = useState('')
  const [talkDate, setTalkDate] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // 토론 관점
  const [perspectives, setPerspectives] = useState([
    { label: '관점 A', body: '' },
    { label: '관점 B', body: '' },
  ])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/auth/login'); return }
      setUserId(data.user.id)
    })
  }, [])

  function slugify(text: string) {
    return text
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\w가-힣-]/g, '')
      .slice(0, 60) + '-' + Date.now()
  }

  async function handleSubmit() {
    if (!title.trim()) return setError('제목을 입력해주세요')
    if (!body.trim() && body === '') return setError('본문을 입력해주세요')
    if (!userId) return

    setLoading(true)
    setError('')

    const slug = slugify(title)
    const tagList = tags.split(',').map(t => t.trim()).filter(Boolean)

    const { data: doc, error: docErr } = await supabase
      .from('documents')
      .insert({
        slug, title, type, body,
        status: 'published',
        author_id: userId,
        tags: tagList,
        like_count: 0,
      })
      .select()
      .single()

    if (docErr) { setError(docErr.message); setLoading(false); return }

    // 카카오 담론 메타
    if (type === 'kakao' && talkDate) {
      await supabase.from('kakao_meta').insert({ document_id: doc.id, talk_date: talkDate })
    }

    // 토론 관점 항목
    if (type === 'discussion') {
      const validPersp = perspectives.filter(p => p.body.trim())
      if (validPersp.length > 0) {
        await supabase.from('discussion_perspectives').insert(
          validPersp.map((p, i) => ({
            document_id: doc.id,
            label: p.label,
            body: p.body,
            author_id: userId,
            display_order: i,
          }))
        )
      }
    }

    router.push(`/wiki/${slug}`)
    router.refresh()
  }

  const typeLabel = type === 'kakao' ? '카카오톡 담론 요약' : type === 'concept' ? '개념 문서' : '토론 문서'

  return (
    <>
      <Navbar />
      <main style={{ maxWidth: '720px', margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
          <div>
            <Link href="/" style={{ fontSize: '12px', color: '#A8A29E', textDecoration: 'none' }}>← 목록</Link>
            <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1C1917', marginTop: '6px', letterSpacing: '-0.3px' }}>
              새 {typeLabel}
            </h1>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* 카카오 담론: 날짜 */}
          {type === 'kakao' && (
            <div>
              <label style={labelStyle}>담론 날짜</label>
              <input type="date" value={talkDate} onChange={e => setTalkDate(e.target.value)} style={inputStyle} />
            </div>
          )}

          {/* 제목 */}
          <div>
            <label style={labelStyle}>제목</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={type === 'kakao' ? '담론 주제목을 입력해주세요' : type === 'discussion' ? '~을 어떻게 볼 것인가?' : '개념명을 입력해주세요'}
              style={{ ...inputStyle, fontSize: '16px', fontWeight: 500 }}
            />
          </div>

          {/* 본문 */}
          <div>
            <label style={labelStyle}>
              {type === 'kakao' ? '요약 내용' : type === 'discussion' ? '배경 및 개요' : '본문'}
            </label>
            <QuillEditor value={body} onChange={setBody} placeholder="내용을 입력해주세요..." minHeight={240} />
          </div>

          {/* 토론 관점 */}
          {type === 'discussion' && (
            <div>
              <label style={labelStyle}>관점 항목</label>
              <p style={{ fontSize: '11px', color: '#A8A29E', marginBottom: '12px' }}>각 관점을 별도로 작성해주세요</p>
              {perspectives.map((p, i) => (
                <div key={i} style={{ marginBottom: '16px', padding: '16px', border: '1px solid #E7E5E4', borderRadius: '10px', background: '#FAFAF9' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                    <input
                      value={p.label}
                      onChange={e => {
                        const next = [...perspectives]
                        next[i].label = e.target.value
                        setPerspectives(next)
                      }}
                      style={{ ...inputStyle, width: '120px', fontSize: '12px' }}
                      placeholder="관점 A"
                    />
                    {perspectives.length > 2 && (
                      <button onClick={() => setPerspectives(perspectives.filter((_, idx) => idx !== i))}
                        style={{ fontSize: '11px', color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer' }}>
                        삭제
                      </button>
                    )}
                  </div>
                  <QuillEditor
                    value={p.body}
                    onChange={v => {
                      const next = [...perspectives]
                      next[i].body = v
                      setPerspectives(next)
                    }}
                    placeholder={`${p.label}의 논거를 입력해주세요`}
                    minHeight={140}
                  />
                </div>
              ))}
              <button
                onClick={() => setPerspectives([...perspectives, { label: `관점 ${String.fromCharCode(65 + perspectives.length)}`, body: '' }])}
                style={{ fontSize: '12px', color: '#78716C', background: 'none', border: '1px dashed #E7E5E4', borderRadius: '8px', padding: '8px 16px', cursor: 'pointer', width: '100%' }}
              >
                + 관점 추가
              </button>
            </div>
          )}

          {/* 태그 */}
          <div>
            <label style={labelStyle}>태그 <span style={{ color: '#A8A29E', fontWeight: 400 }}>(쉼표로 구분)</span></label>
            <input
              value={tags}
              onChange={e => setTags(e.target.value)}
              placeholder="사회, 철학, 언어..."
              style={inputStyle}
            />
          </div>

          {error && (
            <p style={{ fontSize: '12px', color: '#DC2626', padding: '10px 14px', background: '#FEF2F2', borderRadius: '8px' }}>
              {error}
            </p>
          )}

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', paddingTop: '8px' }}>
            <Link href="/" style={{ fontSize: '13px', color: '#78716C', textDecoration: 'none', padding: '10px 20px', border: '1px solid #E7E5E4', borderRadius: '8px' }}>
              취소
            </Link>
            <button onClick={handleSubmit} disabled={loading} style={{
              fontSize: '13px', fontWeight: 500, color: '#FAFAF9',
              background: loading ? '#D6D3D1' : '#1C1917',
              border: 'none', borderRadius: '8px', padding: '10px 24px',
              cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
            }}>
              {loading ? '저장 중...' : '발행하기'}
            </button>
          </div>
        </div>
      </main>
    </>
  )
}

export default function NewDocPage() {
  return (
    <Suspense>
      <NewDocForm />
    </Suspense>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '12px', fontWeight: 500, color: '#44403C', marginBottom: '6px',
}
const inputStyle: React.CSSProperties = {
  width: '100%', height: '40px', border: '1px solid #E7E5E4', borderRadius: '8px',
  padding: '0 12px', fontSize: '14px', color: '#1C1917', background: '#FFFFFF',
  fontFamily: 'inherit', outline: 'none',
}
