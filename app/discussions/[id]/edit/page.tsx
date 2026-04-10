'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import Navbar from '@/components/Navbar'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

const QuillEditor = dynamic(() => import('@/components/QuillEditor'), { ssr: false })

export default function EditDiscussionPage({ params }: { params: { id: string } }) {
  const { id } = params
  const supabase = createClient()
  const router = useRouter()

  const [userId, setUserId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [format, setFormat] = useState<'pros_cons' | 'multi'>('pros_cons')
  const [tags, setTags] = useState('')
  const [endAt, setEndAt] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [initialLoading, setInitialLoading] = useState(true)

  // 자동저장 타이머
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }
      setUserId(user.id)

      const { data } = await supabase
        .from('discussions')
        .select('*')
        .eq('id', id)
        .single()

      if (!data) { router.push('/'); return }
      if (data.author_id !== user.id) { router.push(`/discussions/${id}`); return }
      if (data.status === 'ended') { router.push(`/discussions/${id}`); return }

      setTitle(data.title)
      setBody(data.body)
      setFormat(data.format)
      setTags((data.tags || []).join(', '))
      if (data.end_at) setEndAt(toDatetimeLocal(data.end_at))
      setInitialLoading(false)
    }
    load()
  }, [id])

  // 본문 변경 시 자동저장 (3초 디바운스)
  useEffect(() => {
    if (initialLoading || !userId) return
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => autoSave(true), 3000)
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current) }
  }, [title, body, tags])

  function toDatetimeLocal(iso: string) {
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  async function autoSave(silent = false) {
    if (!userId || !title.trim()) return
    if (!silent) setSaving(true)
    const tagList = tags.split(',').map(t => t.trim()).filter(Boolean)
    const { error: err } = await supabase.from('discussions').update({
      title, body, format, tags: tagList,
      ...(endAt && { end_at: new Date(endAt).toISOString() }),
    }).eq('id', id)
    if (!err) setLastSaved(new Date())
    if (!silent) setSaving(false)
  }

  async function handleSave() {
    if (!title.trim()) return setError('제목을 입력해주세요')
    if (!body.replace(/<[^>]*>/g, '').trim()) return setError('발제문을 입력해주세요')
    setSaving(true)
    setError('')
    const tagList = tags.split(',').map(t => t.trim()).filter(Boolean)
    const { error: err } = await supabase.from('discussions').update({
      title, body, format, tags: tagList,
      ...(endAt && { end_at: new Date(endAt).toISOString() }),
    }).eq('id', id)
    setSaving(false)
    if (err) { setError(err.message); return }
    router.push(`/discussions/${id}`)
    router.refresh()
  }

  if (initialLoading) return (
    <>
      <Navbar />
      <main style={{ maxWidth: '720px', margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ color: '#A8A29E', fontSize: '13px' }}>불러오는 중...</div>
      </main>
    </>
  )

  return (
    <>
      <Navbar />
      <main style={{ maxWidth: '720px', margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '28px' }}>
          <div>
            <Link href={`/discussions/${id}`} style={{ fontSize: '12px', color: '#A8A29E', textDecoration: 'none' }}>← 발제 보기</Link>
            <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1C1917', marginTop: '6px', letterSpacing: '-0.3px' }}>발제 수정</h1>
          </div>
          {/* 자동저장 상태 */}
          <div style={{ fontSize: '11px', color: '#A8A29E', marginTop: '28px' }}>
            {saving ? '저장 중...' : lastSaved ? `자동저장됨 ${lastSaved.getHours()}:${String(lastSaved.getMinutes()).padStart(2,'0')}` : ''}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>

          {/* 제목 */}
          <div>
            <label style={labelStyle}>발제 제목</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="예) SNS는 민주주의를 해치는가?"
              style={{ ...inputStyle, fontSize: '15px', fontWeight: 500 }}
            />
          </div>

          {/* 발제문 */}
          <div>
            <label style={labelStyle}>발제문</label>
            <QuillEditor value={body} onChange={setBody} placeholder="발제문을 작성해주세요..." minHeight={220} />
          </div>

          {/* 토론 형식 */}
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

          {/* 종료 일시 (관리자가 연장 시 참고) */}
          <div>
            <label style={labelStyle}>토론 종료 일시 <span style={{ color: '#A8A29E', fontWeight: 400, fontSize: '11px' }}>발제 후 24시간 기준, 관리자가 연장 가능</span></label>
            <input
              type="datetime-local"
              value={endAt}
              onChange={e => setEndAt(e.target.value)}
              style={inputStyle}
            />
          </div>

          {/* 태그 */}
          <div>
            <label style={labelStyle}>태그 <span style={{ color: '#A8A29E', fontWeight: 400 }}>(쉼표로 구분)</span></label>
            <input value={tags} onChange={e => setTags(e.target.value)} placeholder="사회, 철학..." style={inputStyle} />
          </div>

          {error && (
            <p style={{ fontSize: '12px', color: '#DC2626', padding: '10px 14px', background: '#FEF2F2', borderRadius: '8px' }}>
              {error}
            </p>
          )}

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', paddingTop: '4px' }}>
            <Link href={`/discussions/${id}`} style={{ fontSize: '13px', color: '#78716C', textDecoration: 'none', padding: '10px 20px', border: '1px solid #E7E5E4', borderRadius: '8px' }}>
              취소
            </Link>
            <button onClick={() => handleSave()} disabled={saving} style={{
              fontSize: '13px', fontWeight: 500, color: '#FAFAF9',
              background: saving ? '#D6D3D1' : '#1C1917',
              border: 'none', borderRadius: '8px', padding: '10px 24px',
              cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
            }}>
              {saving ? '저장 중...' : '저장하기'}
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
  padding: '0 12px', fontSize: '13px', color: '#1C1917', background: '#FFFFFF',
  fontFamily: 'inherit', outline: 'none',
}
