'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import Navbar from '@/components/Navbar'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

const QuillEditor = dynamic(() => import('@/components/QuillEditor'), { ssr: false })

export default function EditDocPage({ params }: { params: { slug: string } }) {
  const slug = decodeURIComponent(params.slug)
  const supabase = createClient()
  const router = useRouter()

  const [docId, setDocId] = useState('')
  const [type, setType] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [tags, setTags] = useState('')
  const [talkDate, setTalkDate] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      const { data: doc } = await supabase
        .from('documents')
        .select('*, kakao_meta(talk_date)')
        .eq('slug', slug)
        .single()

      if (!doc || doc.author_id !== user.id) { router.push('/'); return }

      setDocId(doc.id)
      setType(doc.type)
      setTitle(doc.title)
      setBody(doc.body)
      setTags((doc.tags || []).join(', '))
      if (doc.kakao_meta?.[0]) setTalkDate(doc.kakao_meta[0].talk_date)
      setInitialLoading(false)
    }
    load()
  }, [slug])

  async function handleSave() {
    if (!title.trim()) return setError('제목을 입력해주세요')
    setLoading(true)
    setError('')

    const tagList = tags.split(',').map(t => t.trim()).filter(Boolean)
    const { error: err } = await supabase
      .from('documents')
      .update({ title, body, tags: tagList, updated_at: new Date().toISOString() })
      .eq('id', docId)

    if (err) { setError(err.message); setLoading(false); return }

    if (type === 'kakao' && talkDate) {
      await supabase.from('kakao_meta').upsert({ document_id: docId, talk_date: talkDate }, { onConflict: 'document_id' })
    }

    // 편집 이력 저장
    await supabase.from('document_versions').insert({
      document_id: docId, body,
      edited_by: (await supabase.auth.getUser()).data.user!.id,
    })

    router.push(`/wiki/${slug}`)
  }

  const typeLabel = type === 'kakao' ? '카카오톡 담론 요약' : type === 'concept' ? '개념 문서' : '토론 문서'

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
        <div style={{ marginBottom: '28px' }}>
          <Link href={`/wiki/${slug}`} style={{ fontSize: '12px', color: '#A8A29E', textDecoration: 'none' }}>← 문서로 돌아가기</Link>
          <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1C1917', marginTop: '6px', letterSpacing: '-0.3px' }}>
            {typeLabel} 수정
          </h1>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {type === 'kakao' && (
            <div>
              <label style={labelStyle}>담론 날짜</label>
              <input type="date" value={talkDate} onChange={e => setTalkDate(e.target.value)} style={inputStyle} />
            </div>
          )}

          <div>
            <label style={labelStyle}>제목</label>
            <input value={title} onChange={e => setTitle(e.target.value)} style={{ ...inputStyle, fontSize: '16px', fontWeight: 500 }} />
          </div>

          <div>
            <label style={labelStyle}>{type === 'kakao' ? '요약 내용' : '본문'}</label>
            <QuillEditor value={body} onChange={setBody} minHeight={280} />
          </div>

          <div>
            <label style={labelStyle}>태그 <span style={{ color: '#A8A29E', fontWeight: 400 }}>(쉼표로 구분)</span></label>
            <input value={tags} onChange={e => setTags(e.target.value)} placeholder="사회, 철학..." style={inputStyle} />
          </div>

          {error && <p style={{ fontSize: '12px', color: '#DC2626', padding: '10px 14px', background: '#FEF2F2', borderRadius: '8px' }}>{error}</p>}

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <Link href={`/wiki/${slug}`} style={{ fontSize: '13px', color: '#78716C', textDecoration: 'none', padding: '10px 20px', border: '1px solid #E7E5E4', borderRadius: '8px' }}>
              취소
            </Link>
            <button onClick={handleSave} disabled={loading} style={{
              fontSize: '13px', fontWeight: 500, color: '#FAFAF9',
              background: loading ? '#D6D3D1' : '#1C1917',
              border: 'none', borderRadius: '8px', padding: '10px 24px',
              cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
            }}>
              {loading ? '저장 중...' : '저장하기'}
            </button>
          </div>
        </div>
      </main>
    </>
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
