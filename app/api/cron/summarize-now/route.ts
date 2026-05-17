import { NextRequest, NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/bot-auth'
import { createAdminClient } from '@/lib/supabase-admin'

// on-demand 요약: 오늘 자정~지금까지, 최소 3건
const MIN_MESSAGES = 3

const escapeXmlTags = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { ANTHROPIC_API_KEY, BOT_AUTHOR_ID } = process.env
  if (!ANTHROPIC_API_KEY || !BOT_AUTHOR_ID)
    return NextResponse.json({ error: 'Missing required env vars' }, { status: 500 })

  const kstDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())
  const slug = `카카오-담론-${kstDate}-중간요약`

  const supabase = createAdminClient()

  // 멱등성: 오늘 중간 요약이 이미 있으면 skip
  const { data: existingDoc } = await supabase
    .from('documents')
    .select('id, slug')
    .eq('slug', slug)
    .maybeSingle()

  if (existingDoc)
    return NextResponse.json({ ok: true, skipped: 'already_summarized_today', slug })

  const { data: logs, error: logsError } = await supabase
    .from('chat_logs')
    .select('sender, text, created_at')
    .eq('log_date', kstDate)
    .order('created_at', { ascending: true })

  if (logsError) return NextResponse.json({ error: logsError.message }, { status: 500 })
  if (!logs || logs.length < MIN_MESSAGES)
    return NextResponse.json({
      ok: true,
      skipped: 'not_enough_messages',
      count: logs?.length ?? 0,
    })

  const participants = logs.reduce<string[]>((acc, l) => {
    if (!acc.includes(l.sender)) acc.push(l.sender)
    return acc
  }, [])

  const transcript = logs
    .map(l => `${escapeXmlTags(l.sender)}: ${escapeXmlTags(l.text)}`)
    .join('\n')

  const now = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date())

  const prompt = `다음은 ${kstDate} 오늘 자정부터 ${now}까지의 카카오톡 대화입니다.
참여자: ${participants.map(escapeXmlTags).join(', ')}

<대화>
${transcript}
</대화>

위 대화를 아래 두 형식으로 요약해주세요.

1. 사이트 위키 게시용 (HTML):
<h2>주요 주제</h2>
<p>한두 문장으로 핵심 주제 요약</p>
<h2>핵심 논점</h2>
<ul>
<li>주요 의견이나 논거 (발언자 포함)</li>
</ul>
<h2>결론 / 미결 사안</h2>
<p>합의된 내용이나 아직 열려있는 질문</p>

2. 카카오톡 공유용 (말풍선 형식, 300자 이내):
[KAKAO]
📅 ${kstDate} 중간 요약 (${now} 기준)
━━━━━━━━━━━━━━
💬 주제: (한 줄)
📌 핵심:
• (논점 1)
• (논점 2)
🏁 소결: (한 줄)
[/KAKAO]`

  const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!aiRes.ok) {
    const err = await aiRes.text()
    return NextResponse.json({ error: `Claude API error: ${err}` }, { status: 500 })
  }

  const aiJson = await aiRes.json()
  const rawText: string = aiJson.content?.[0]?.text ?? ''

  // HTML 부분과 카카오 말풍선 부분 분리
  const kakaoMatch = rawText.match(/\[KAKAO\]([\s\S]*?)\[\/KAKAO\]/)
  const kakaoSummary = kakaoMatch ? kakaoMatch[1].trim() : ''
  const htmlBody = rawText
    .replace(/\[KAKAO\][\s\S]*?\[\/KAKAO\]/g, '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<(iframe|object|embed|base|meta|link)\b[^>]*/gi, '')
    .replace(/\bon\w+\s*=/gi, '')
    .replace(/javascript\s*:/gi, 'javascript-blocked:')
    .trim()

  const { data: doc, error: docError } = await supabase
    .from('documents')
    .insert({
      slug,
      title: `카카오톡 중간 요약 (${kstDate} ${now} 기준)`,
      type: 'kakao',
      body: htmlBody,
      status: 'published',
      author_id: BOT_AUTHOR_ID,
      tags: ['자동요약', '중간요약'],
      like_count: 0,
    })
    .select('id')
    .single()

  if (docError) return NextResponse.json({ error: docError.message }, { status: 500 })

  await supabase
    .from('kakao_meta')
    .upsert(
      { document_id: doc.id, talk_date: kstDate, participants },
      { onConflict: 'document_id' }
    )

  return NextResponse.json({
    ok: true,
    doc_id: doc.id,
    slug,
    date: kstDate,
    message_count: logs.length,
    kakao_summary: kakaoSummary,
  })
}
