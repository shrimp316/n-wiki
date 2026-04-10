'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import Navbar from '@/components/Navbar'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

const QuillEditor = dynamic(() => import('@/components/QuillEditor'), { ssr: false })

export default function NewDiscussionPage() {
  const supabase = createClient()
  const router = useRouter()

  const [userId, setUserId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [format, setFormat] = useState<'pros_cons' | 'multi'>('pros_cons')
  const [tags, setTags] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/auth/login'); return }
      setUserId(data.user.id)
    })
  }, [])

  async function handleSubmit() {
    if (!title.trim()) return setError('제목을 입력해주세요')
    if (!body.replace(/<[^>]*>/g, '').trim()) return setError('발제문을 입력해주세요')
    if (!userId) return

    setLoading(true)
    setError('')

    const now = Date.now()
    const endAt = new Date(now + 24 * 3600000).toISOString()
    const tagList = tags.split(',').map(t => t.trim()).filter(Boolean)

    const { data, error: err } = await supabase
      .from('discussions')
      .insert({
        title, body, format,
        status: 'active',
        author_id: userId,
        tags: tagList,
        end_at: endAt,
        started_at: new Date(now).toISOString(),
      })
      .select()
      .single()

    if (err) { setError(err.message); setLoading(false); return }

    // 발제자 자동 참여
    await supabase.from('discussion_participants').insert({
      discussion_id: data.id,
      user_id: userId,
      stance: '발제자',
    })

    router.push(`/discussions/${data.id}`)
    router.refresh()
  }

  return (
    <>
      <Navbar />
      <main style={{ maxWidth: '720px', margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ marginBottom: '28px' }}>
          <Link href="/" style={{ fontSize: '12px', color: '#A8A29E', textDecoration: 'none' }}>← 목록</Link>
          <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1C1917', marginTop: '6px', letterSpacing: '-0.3px' }}>토론 발제</h1>
          <p style={{ fontSize: '12px', color: '#A8A29E', marginTop: '4px' }}>발제 후 24시간 동안 토론이 진행돼요</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>

          <div>
            <label style={labelStyle}>발제 제목 <span style={{ color: '#A8A29E', fontWeight: 400, fontSize: '11px' }}>~인가? / ~해야 하는가? 형식 권장</span></label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="예) SNS는 민주주의를 해치는가?"
              style={{ ...inputStyle, fontSize: '15px', fontWeight: 500 }}
            />
          </div>

          <div>
            <label style={labelStyle}>발제문 <span style={{ color: '#A8A29E', fontWeight: 400, fontSize: '11px' }}>배경, 핵심 쟁점, 발제자의 시각</span></label>
            <QuillEditor value={body} onChange={setBody} placeholder="발제문을 작성해주세요..." minHeight={220} />
          </div>

          <div>
            <label style={labelStyle}>토론 형식</label>
            <div style={{ display: 'flex', gap: '10px' }}>
              {(['pros_cons', 'multi'] as const).map(f => (
                <button key={f} onClick={() => setFormat(f)} style={{
                  flex: 1, padding: '12px', borderRadius: '10px', cursor: 'pointer',
                  fontFamily: 'inherit', transition: 'all 0.15s', textAlign: 'left' as const,
                  border: `1.5px solid ${format === f ? '#1C1917' : '#E7E5E4'}`,
                  background: format === f ? '#F5F5F4' : '#FFFFFF',
                }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#1C1917', marginBottom: '3px' }}>
                    {f === 'pros_cons' ? '찬반형' : '다관점형'}
                  </div>
                  <div style={{ fontSize: '11px', color: '#78716C' }}>
                    {f === 'pros_cons' ? '찬성 / 반대 두 입장으로 나뉘어 토론' : '참여자가 자유롭게 입장명을 정해 토론'}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={labelStyle}>태그 <span style={{ color: '#A8A29E', fontWeight: 400 }}>(쉼표로 구분)</span></label>
            <input value={tags} onChange={e => setTags(e.target.value)} placeholder="사회, 철학, 민주주의..." style={inputStyle} />
          </div>

          {error && (
            <p style={{ fontSize: '12px', color: '#DC2626', padding: '10px 14px', background: '#FEF2F2', borderRadius: '8px' }}>
              {error}
            </p>
          )}

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', paddingTop: '4px' }}>
            <Link href="/" style={{ fontSize: '13px', color: '#78716C', textDecoration: 'none', padding: '10px 20px', border: '1px solid #E7E5E4', borderRadius: '8px' }}>
              취소
            </Link>
            <button onClick={handleSubmit} disabled={loading} style={{
              fontSize: '13px', fontWeight: 500, color: '#FAFAF9',
              background: loading ? '#D6D3D1' : '#1C1917',
              border: 'none', borderRadius: '8px', padding: '10px 24px',
              cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
            }}>
              {loading ? '발제 중...' : '발제하기'}
            </button>
          </div>
        </div>
      </main>
    </>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '12px', fontWeight: 500, color: '#44403C', marginBottom: '7px',
}
const inputStyle: React.CSSProperties = {
  width: '100%', height: '40px', border: '1px solid #E7E5E4', borderRadius: '8px',
  padding: '0 12px', fontSize: '14px', color: '#1C1917', background: '#FFFFFF',
  fontFamily: 'inherit', outline: 'none',
}
