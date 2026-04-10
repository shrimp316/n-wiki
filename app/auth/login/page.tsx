'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)

  async function handleLogin() {
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('이메일 또는 비밀번호가 올바르지 않아요')
      setLoading(false)
    } else {
      router.push('/')
      router.refresh()
    }
  }

  async function handleReset() {
    if (!email.trim()) return setError('이메일을 입력해주세요')
    setResetLoading(true)
    setError('')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/auth/reset`,
    })
    if (error) setError(error.message)
    else setResetSent(true)
    setResetLoading(false)
  }

  return (
    <main style={s.main}>
      <div style={s.card}>
        <Link href="/" style={s.logo}>N의 위키</Link>

        <h1 style={s.title}>다시 돌아왔군요</h1>
        <p style={s.sub}>로그인하고 위키에 기여해보세요</p>

        <div style={s.field}>
          <label style={s.label}>이메일</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="example@email.com" style={s.input} />
        </div>

        <div style={s.field}>
          <label style={s.label}>비밀번호</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" style={s.input} onKeyDown={e => e.key === 'Enter' && handleLogin()} />
          {resetSent ? (
            <div style={{ fontSize: '11px', color: '#16A34A', textAlign: 'right', marginTop: '6px' }}>재설정 이메일을 보냈어요!</div>
          ) : (
            <button onClick={handleReset} disabled={resetLoading} style={{ fontSize: '11px', color: '#A8A29E', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0, display: 'block', textAlign: 'right', width: '100%', marginTop: '6px' }}>
              {resetLoading ? '보내는 중...' : '비밀번호를 잊으셨나요?'}
            </button>
          )}
        </div>

        {error && <p style={s.error}>{error}</p>}

        <button onClick={handleLogin} disabled={loading} style={s.btn}>
          {loading ? '로그인 중...' : '로그인'}
        </button>

        <div style={s.switchRow}>
          <span style={s.switchText}>계정이 없으신가요?</span>
          <Link href="/auth/signup" style={s.switchLink}>가입하기</Link>
        </div>
      </div>
    </main>
  )
}

const s: Record<string, React.CSSProperties> = {
  main: { minHeight: '100vh', background: '#FAFAF9', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' },
  card: { width: '100%', maxWidth: '360px', background: '#FFFFFF', border: '1px solid #E7E5E4', borderRadius: '16px', padding: '32px 28px' },
  logo: { display: 'block', fontSize: '15px', fontWeight: 600, color: '#1C1917', letterSpacing: '-0.4px', marginBottom: '28px', textDecoration: 'none' },
  title: { fontSize: '20px', fontWeight: 400, color: '#1C1917', letterSpacing: '-0.4px', marginBottom: '6px' },
  sub: { fontSize: '13px', color: '#A8A29E', marginBottom: '24px' },
  field: { marginBottom: '14px' },
  label: { display: 'block', fontSize: '11px', color: '#78716C', marginBottom: '5px' },
  input: { width: '100%', height: '38px', border: '1px solid #E7E5E4', borderRadius: '8px', padding: '0 12px', fontSize: '13px', color: '#1C1917', background: '#FAFAF9', fontFamily: 'inherit', outline: 'none' },
  error: { fontSize: '12px', color: '#DC2626', marginBottom: '12px', padding: '8px 12px', background: '#FEF2F2', borderRadius: '6px' },
  btn: { width: '100%', height: '40px', background: '#1C1917', color: '#FAFAF9', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', marginTop: '4px' },
  switchRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '20px' },
  switchText: { fontSize: '12px', color: '#A8A29E' },
  switchLink: { fontSize: '12px', color: '#1C1917', fontWeight: 500, textDecoration: 'underline', textUnderlineOffset: '2px' },
}
