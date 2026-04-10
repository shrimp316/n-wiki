'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const INTEREST_TAGS = [
  '사회', '철학', '언어', '문화', '정치', '경제',
  '과학', '심리', '역사', '예술', '미디어', '기술',
]

export default function SignupPage() {
  useRouter() // reserved for future redirect
  const supabase = createClient()

  const [step, setStep] = useState<1 | 2 | 'done'>(1)
  const [nickname, setNickname] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [nicknameStatus, setNicknameStatus] = useState<'idle' | 'checking' | 'ok' | 'taken'>('idle')

  useEffect(() => {
    if (nickname.length < 2) { setNicknameStatus('idle'); return }
    setNicknameStatus('checking')
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('nickname')
        .eq('nickname', nickname)
        .maybeSingle()
      setNicknameStatus(data ? 'taken' : 'ok')
    }, 400)
    return () => clearTimeout(timer)
  }, [nickname])

  async function handleNextStep() {
    if (nickname.length < 2) return setError('닉네임을 2자 이상 입력해주세요')
    if (nicknameStatus === 'taken') return setError('이미 사용 중인 닉네임이에요')
    if (nicknameStatus === 'checking') return setError('닉네임 확인 중이에요, 잠시만요')
    if (!email.trim()) return setError('이메일을 입력해주세요')
    if (password.length < 8) return setError('비밀번호는 8자 이상이어야 해요')
    setError('')
    setStep(2)
  }

  async function handleSignup() {
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { nickname, interests: selected },
        emailRedirectTo: `${location.origin}/auth/callback`,
      },
    })
    if (error) { setError(error.message); setLoading(false) }
    else setStep('done')
  }

  function toggleTag(tag: string) {
    setSelected(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  }

  const nicknameBorder =
    nicknameStatus === 'ok' ? '1px solid #16A34A' :
    nicknameStatus === 'taken' ? '1px solid #DC2626' : '1px solid #E7E5E4'

  const nicknameHint =
    nicknameStatus === 'checking' ? { text: '확인 중...', color: '#A8A29E' } :
    nicknameStatus === 'ok' ? { text: '사용할 수 있는 닉네임이에요', color: '#16A34A' } :
    nicknameStatus === 'taken' ? { text: '이미 사용 중인 닉네임이에요', color: '#DC2626' } :
    { text: '2–20자', color: '#A8A29E' }

  return (
    <main style={s.main}>
      <div style={s.card}>
        <Link href="/" style={s.logo}>N의 위키</Link>

        <div style={{ display: 'flex', gap: '4px', marginBottom: '24px' }}>
          <div style={{ flex: 1, height: '2px', background: '#1C1917', borderRadius: '2px' }} />
          <div style={{ flex: 1, height: '2px', background: step === 2 ? '#1C1917' : '#E7E5E4', borderRadius: '2px', transition: 'background 0.2s' }} />
        </div>

        {step === 1 ? (
          <>
            <h1 style={s.title}>N의 위키에 오신 걸 환영해요</h1>
            <p style={s.sub}>기본 정보를 입력해주세요</p>

            <div style={s.field}>
              <label style={s.label}>닉네임</label>
              <input value={nickname} onChange={e => setNickname(e.target.value)} placeholder="위키에서 표시돼요" style={{ ...s.input, border: nicknameBorder }} maxLength={20} />
              <div style={{ fontSize: '11px', color: nicknameHint.color, marginTop: '4px' }}>{nicknameHint.text}</div>
            </div>

            <div style={s.field}>
              <label style={s.label}>이메일</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="example@email.com" style={s.input} />
            </div>

            <div style={s.field}>
              <label style={s.label}>비밀번호</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="8자 이상" style={s.input} onKeyDown={e => e.key === 'Enter' && handleNextStep()} />
            </div>

            {error && <p style={s.error}>{error}</p>}
            <button onClick={handleNextStep} style={s.btn}>다음 →</button>
            <div style={s.switchRow}>
              <span style={s.switchText}>이미 계정이 있으신가요?</span>
              <Link href="/auth/login" style={s.switchLink}>로그인</Link>
            </div>
          </>
        ) : step === 2 ? (
          <>
            <h1 style={s.title}>어떤 주제를 주로 다루나요?</h1>
            <p style={s.sub}>관심 태그를 골라두면 맞춤 문서를 먼저 보여드려요</p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' }}>
              {INTEREST_TAGS.map(tag => (
                <button key={tag} onClick={() => toggleTag(tag)} style={{
                  fontSize: '12px', padding: '5px 14px', borderRadius: '20px', cursor: 'pointer',
                  border: selected.includes(tag) ? '1px solid #A8A29E' : '1px solid #E7E5E4',
                  background: selected.includes(tag) ? '#F5F5F4' : 'transparent',
                  color: selected.includes(tag) ? '#1C1917' : '#78716C',
                  fontFamily: 'inherit', fontWeight: selected.includes(tag) ? 500 : 400,
                  transition: 'all 0.15s',
                }}>
                  {tag}
                </button>
              ))}
            </div>

            <p style={{ fontSize: '11px', color: '#A8A29E', marginBottom: '24px' }}>
              {selected.length < 3
                ? `${3 - selected.length}개 더 선택하면 좋아요 · 나중에 바꿀 수 있어요`
                : `${selected.length}개 선택됨 · 나중에 바꿀 수 있어요`}
            </p>

            {error && <p style={s.error}>{error}</p>}
            <button onClick={handleSignup} disabled={loading} style={s.btn}>
              {loading ? '가입 중...' : '시작하기'}
            </button>
            <div style={{ textAlign: 'center', marginTop: '14px' }}>
              <button onClick={handleSignup} style={{ fontSize: '12px', color: '#A8A29E', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                건너뛰기
              </button>
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: '32px', marginBottom: '16px' }}>✉️</div>
            <h2 style={{ fontSize: '18px', fontWeight: 500, color: '#1C1917', marginBottom: '8px', letterSpacing: '-0.3px' }}>이메일을 확인해주세요</h2>
            <p style={{ fontSize: '13px', color: '#78716C', lineHeight: 1.6, marginBottom: '8px' }}>
              <span style={{ fontWeight: 500 }}>{email}</span> 로<br />가입 확인 이메일을 보냈어요
            </p>
            <p style={{ fontSize: '12px', color: '#A8A29E', lineHeight: 1.6 }}>이메일의 링크를 클릭하면<br />가입이 완료돼요</p>
            <Link href="/auth/login" style={{ display: 'block', width: '100%', height: '40px', background: '#1C1917', color: '#FAFAF9', borderRadius: '8px', fontSize: '13px', fontWeight: 500, textDecoration: 'none', textAlign: 'center', lineHeight: '40px', marginTop: '24px' }}>
              로그인 하러 가기
            </Link>
          </div>
        )}
      </div>
    </main>
  )
}

const s: Record<string, React.CSSProperties> = {
  main: { minHeight: '100vh', background: '#FAFAF9', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' },
  card: { width: '100%', maxWidth: '360px', background: '#FFFFFF', border: '1px solid #E7E5E4', borderRadius: '16px', padding: '32px 28px' },
  logo: { display: 'block', fontSize: '15px', fontWeight: 600, color: '#1C1917', letterSpacing: '-0.4px', marginBottom: '20px', textDecoration: 'none' },
  title: { fontSize: '20px', fontWeight: 400, color: '#1C1917', letterSpacing: '-0.4px', marginBottom: '6px' },
  sub: { fontSize: '13px', color: '#A8A29E', marginBottom: '24px' },
  field: { marginBottom: '14px' },
  label: { display: 'block', fontSize: '11px', color: '#78716C', marginBottom: '5px' },
  input: { width: '100%', height: '38px', border: '1px solid #E7E5E4', borderRadius: '8px', padding: '0 12px', fontSize: '13px', color: '#1C1917', background: '#FAFAF9', fontFamily: 'inherit', outline: 'none' },
  error: { fontSize: '12px', color: '#DC2626', marginBottom: '12px', padding: '8px 12px', background: '#FEF2F2', borderRadius: '6px' },
  btn: { width: '100%', height: '40px', background: '#1C1917', color: '#FAFAF9', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' },
  switchRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '20px' },
  switchText: { fontSize: '12px', color: '#A8A29E' },
  switchLink: { fontSize: '12px', color: '#1C1917', fontWeight: 500, textDecoration: 'underline', textUnderlineOffset: '2px' },
}
