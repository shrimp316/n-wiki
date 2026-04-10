'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import type { Comment } from '@/lib/supabase'

interface Props {
  documentId: string
}

export default function Comments({ documentId }: Props) {
  const supabase = createClient()
  const [userId, setUserId] = useState<string | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [commentText, setCommentText] = useState('')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadComments()
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUserId(data.user.id)
      }
    })
  }, [documentId])

  async function loadComments() {
    const { data } = await supabase
      .from('comments')
      .select('*, profiles(nickname)')
      .eq('document_id', documentId)
      .order('created_at', { ascending: true })
    setComments((data as Comment[]) || [])
  }

  async function addComment(parentId: string | null = null) {
    if (!userId) return
    const text = parentId ? replyText : commentText
    if (!text.trim()) return
    setLoading(true)
    await supabase.from('comments').insert({
      document_id: documentId,
      parent_id: parentId,
      content: text.trim(),
      author_id: userId,
    })
    if (parentId) { setReplyText(''); setReplyTo(null) }
    else setCommentText('')
    setLoading(false)
    loadComments()
  }

  async function deleteComment(id: string) {
    if (!confirm('댓글을 삭제할까요?')) return
    await supabase.from('comments').delete().eq('id', id)
    loadComments()
  }

  async function updateComment(id: string) {
    if (!editText.trim()) return
    await supabase.from('comments').update({ content: editText, updated_at: new Date().toISOString() }).eq('id', id)
    setEditingId(null)
    loadComments()
  }

  const formatDate = (s: string) => {
    const d = new Date(s)
    return `${d.getMonth() + 1}/${d.getDate()}`
  }

  const topComments = comments.filter(c => !c.parent_id)
  const getReplies = (id: string) => comments.filter(c => c.parent_id === id)

  return (
    <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid #E7E5E4' }}>
      <h3 style={{ fontSize: '13px', fontWeight: 500, color: '#78716C', marginBottom: '16px' }}>
        댓글 {comments.length}개
      </h3>

      {/* 댓글 작성 */}
      {userId ? (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
          <input
            type="text"
            placeholder="댓글을 입력해주세요..."
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addComment()}
            style={inputStyle}
          />
          <button onClick={() => addComment()} disabled={loading} style={btnSmStyle}>
            등록
          </button>
        </div>
      ) : (
        <p style={{ fontSize: '13px', color: '#A8A29E', marginBottom: '16px' }}>
          <Link href="/auth/login" style={{ color: '#1C1917', textDecoration: 'underline', textUnderlineOffset: '2px' }}>로그인</Link>하면 댓글을 남길 수 있어요.
        </p>
      )}

      {/* 댓글 목록 */}
      {topComments.length === 0 ? (
        <p style={{ fontSize: '13px', color: '#A8A29E', textAlign: 'center', padding: '24px 0' }}>
          아직 댓글이 없어요.
        </p>
      ) : (
        topComments.map(c => (
          <div key={c.id}>
            {/* 댓글 */}
            <div style={{ padding: '12px 0', borderBottom: '1px solid #F5F5F4' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: 500, color: '#1C1917' }}>
                  {(c as Comment & { profiles?: { nickname: string } }).profiles?.nickname || '알 수 없음'}
                </span>
                <span style={{ fontSize: '11px', color: '#A8A29E' }}>{formatDate(c.created_at)}</span>
                {c.updated_at && <span style={{ fontSize: '11px', color: '#A8A29E' }}>(수정됨)</span>}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                  {userId && (
                    <button onClick={() => setReplyTo(replyTo === c.id ? null : c.id)} style={ghostBtnStyle}>
                      답글
                    </button>
                  )}
                  {userId === c.author_id && (
                    <>
                      <button onClick={() => { setEditingId(c.id); setEditText(c.content) }} style={ghostBtnStyle}>수정</button>
                      <button onClick={() => deleteComment(c.id)} style={{ ...ghostBtnStyle, color: '#DC2626' }}>삭제</button>
                    </>
                  )}
                </div>
              </div>

              {editingId === c.id ? (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input value={editText} onChange={e => setEditText(e.target.value)} onKeyDown={e => e.key === 'Enter' && updateComment(c.id)} style={inputStyle} />
                  <button onClick={() => updateComment(c.id)} style={btnSmStyle}>완료</button>
                  <button onClick={() => setEditingId(null)} style={btnOutlineStyle}>취소</button>
                </div>
              ) : (
                <p style={{ fontSize: '14px', color: '#1C1917', lineHeight: 1.7 }}>{c.content}</p>
              )}

              {/* 답글 입력 */}
              {replyTo === c.id && (
                <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                  <input
                    type="text"
                    placeholder="답글을 입력해주세요..."
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addComment(c.id)}
                    style={inputStyle}
                    autoFocus
                  />
                  <button onClick={() => addComment(c.id)} style={btnSmStyle}>등록</button>
                </div>
              )}
            </div>

            {/* 대댓글 */}
            {getReplies(c.id).map(r => (
              <div key={r.id} style={{ padding: '10px 0 10px 20px', borderBottom: '1px solid #F5F5F4', borderLeft: '2px solid #E7E5E4', marginLeft: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '11px', color: '#A8A29E' }}>↩</span>
                  <span style={{ fontSize: '13px', fontWeight: 500, color: '#1C1917' }}>
                    {(r as Comment & { profiles?: { nickname: string } }).profiles?.nickname || '알 수 없음'}
                  </span>
                  <span style={{ fontSize: '11px', color: '#A8A29E' }}>{formatDate(r.created_at)}</span>
                  {userId === r.author_id && (
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                      <button onClick={() => { setEditingId(r.id); setEditText(r.content) }} style={ghostBtnStyle}>수정</button>
                      <button onClick={() => deleteComment(r.id)} style={{ ...ghostBtnStyle, color: '#DC2626' }}>삭제</button>
                    </div>
                  )}
                </div>
                {editingId === r.id ? (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input value={editText} onChange={e => setEditText(e.target.value)} onKeyDown={e => e.key === 'Enter' && updateComment(r.id)} style={inputStyle} />
                    <button onClick={() => updateComment(r.id)} style={btnSmStyle}>완료</button>
                    <button onClick={() => setEditingId(null)} style={btnOutlineStyle}>취소</button>
                  </div>
                ) : (
                  <p style={{ fontSize: '13px', color: '#1C1917', lineHeight: 1.7 }}>{r.content}</p>
                )}
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  flex: 1, height: '36px', border: '1px solid #E7E5E4', borderRadius: '8px',
  padding: '0 12px', fontSize: '13px', color: '#1C1917', background: '#FAFAF9',
  fontFamily: 'inherit', outline: 'none',
}
const btnSmStyle: React.CSSProperties = {
  height: '36px', padding: '0 14px', background: '#1C1917', color: '#FAFAF9',
  border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 500,
  cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
}
const btnOutlineStyle: React.CSSProperties = {
  height: '36px', padding: '0 14px', background: 'transparent', color: '#78716C',
  border: '1px solid #E7E5E4', borderRadius: '8px', fontSize: '12px',
  cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
}
const ghostBtnStyle: React.CSSProperties = {
  fontSize: '11px', color: '#A8A29E', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
}
