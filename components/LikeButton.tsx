'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

interface Props {
  documentId: string
  initialCount: number
}

export default function LikeButton({ documentId, initialCount }: Props) {
  const supabase = createClient()
  const router = useRouter()
  const [liked, setLiked] = useState(false)
  const [count, setCount] = useState(initialCount)
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUserId(data.user.id)
        supabase.from('likes').select('user_id').eq('document_id', documentId).eq('user_id', data.user.id).maybeSingle()
          .then(({ data: like }) => setLiked(!!like))
      }
    })
  }, [documentId])

  async function toggleLike() {
    if (!userId) { router.push('/auth/login'); return }
    if (loading) return
    setLoading(true)

    if (liked) {
      await supabase.from('likes').delete().eq('document_id', documentId).eq('user_id', userId)
      setLiked(false)
      setCount(c => c - 1)
    } else {
      await supabase.from('likes').insert({ document_id: documentId, user_id: userId })
      setLiked(true)
      setCount(c => c + 1)
    }
    setLoading(false)
  }

  return (
    <button
      onClick={toggleLike}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '6px',
        padding: '6px 16px',
        border: `1.5px solid ${liked ? '#1C1917' : '#E7E5E4'}`,
        borderRadius: '20px',
        background: liked ? '#F5F5F4' : 'transparent',
        color: liked ? '#1C1917' : '#A8A29E',
        cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px',
        transition: 'all 0.15s',
      }}
    >
      {liked ? '♥' : '♡'} {count}
    </button>
  )
}
