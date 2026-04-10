'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function ResetPage() {
  const supabase = createClient()
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleReset() {
    if (password.length < 8) return setError('비밀번호는 8자 이상이어야 해요')
    if (password !== confirm) return setError('비밀번호가 일치하지 않아요')
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) { setError(error.message); setLoading(false) }
    else { setDone(true); setTimeout(() => router.push('/'), 2000) }
  }

  return (
    <main style={{ minHeight: '100vh', background: '#FAFAF9', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '360px', background: '#FFFFFF', border: '1px solid #E7E5E4', borderRadius: '16px', padding: '32px 28px' }}>
        <Link href="/" style={{ display: 'block', fontSize: '15px', fontWeight: 600, color: '#1C1917', textDecoration: 'none', marginBottom: '28px' }}>
          N의 위키
        </Link>

        {done ? (
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '15px', color: '#16A34A', marginBottom: '8px' }}>비밀번호가 변경됐어요!</p>
            <p style={{ fontSize: '13px', color: '#A8A29E' }}>잠시 후 메인 페이지로 이동해요</p>
          </div>
        ) : (
          <>
            <h1 style={{ fontSize: '20px', fontWeight: 400, color: '#1C1917', letterSpacing: '-0.4px', marginBottom: '6px' }}>새 비밀번호 설정</h1>
            <p style={{ fontSize: '13px', color: '#A8A29E', marginBottom: '24px' }}>새로 사용할 비밀번호를 입력해주세요</p>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '11px', color: '#78716C', marginBottom: '5px' }}>새 비밀번호</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="8자 이상"
                style={{ width: '100%', height: '38px', border: '1px solid #E7E5E4', borderRadius: '8px', padding: '0 12px', fontSize: '13px', color: '#1C1917', background: '#FAFAF9', fontFamily: 'inherit', outline: 'none' }} />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '11px', color: '#78716C', marginBottom: '5px' }}>비밀번호 확인</label>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="한 번 더 입력해주세요"
                style={{ width: '100%', height: '38px', border: '1px solid #E7E5E4', borderRadius: '8px', padding: '0 12px', fontSize: '13px', color: '#1C1917', background: '#FAFAF9', fontFamily: 'inherit', outline: 'none' }}
                onKeyDown={e => e.key === 'Enter' && handleReset()} />
            </div>

            {error && <p style={{ fontSize: '12px', color: '#DC2626', marginBottom: '14px', padding: '8px 12px', background: '#FEF2F2', borderRadius: '6px' }}>{error}</p>}

            <button onClick={handleReset} disabled={loading}
              style={{ width: '100%', height: '40px', background: loading ? '#D6D3D1' : '#1C1917', color: '#FAFAF9', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
              {loading ? '변경 중...' : '비밀번호 변경'}
            </button>
          </>
        )}
      </div>
    </main>
  )
}
