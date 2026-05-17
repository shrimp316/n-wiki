import { NextRequest, NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/bot-auth'
import { createAdminClient } from '@/lib/supabase-admin'

const MIN_MESSAGES = 5

const escapeXmlTags = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { ANTHROPIC_API_KEY, BOT_AUTHOR_ID } = process.env
  if (!ANTHROPIC_API_KEY || !BOT_AUTHOR_ID)
    return NextResponse.json({ error: 'Missing required env vars' }, { status: 500 })

  // KST 어제 날짜 계산
  const todayKst = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())
  const [y, m, d] = todayKst.split('-').map(Number)
  const kstDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' })
    .format(new Date(Date.UTC(y, m - 1, d - 1)))

  const supabase = createAdminClient()

  // 멱등성: 이미 요약됐으면 skip
  const { data: meta } = await supabase
    .from('chat_log_meta')
    .select('summarized, message_count')
    .eq('log_date', kstDate)
    .maybeSingle()

  if (meta?.summarized)
    return NextResponse.json({ ok: true, skipped: 'already_summarized' })

  const { data: logs, error: logsError } = await supabase
    .from('chat_logs')
    .select('sender, text, created_at')
    .eq('log_date', kstDate)
    .order('created_at', { ascending: true })

  if (logsError) return NextResponse.json({ error: logsError.message }, { status: 500 })
  if (!logs || logs.length < MIN_MESSAGES)
    return NextResponse.json({ ok: true, skipped: 'not_enough_messages', count: logs?.length ?? 0 })

  const participants = logs.reduce<string[]>((acc, l) => {
    if (!acc.includes(l.sender)) acc.push(l.sender)
    return acc
  }, [])

  const transcript = logs
    .map(l => `${escapeXmlTags(l.sender)}: ${escapeXmlTags(l.text)}`)
    .join('\n')

  const prompt = `다음은 ${kstDate}에 나눈 카카오톡 대화입니다. 참여자: ${participants.map(escapeXmlTags).join(', ')}

<대화>
${transcript}
</대화>

위 대화를 아래 형식으로 요약해주세요. HTML로 작성하세요.

<h2>주요 주제</h2>
<p>한두 문장으로 핵심 주제 요약</p>

<h2>핵심 논점</h2>
<ul>
<li>주요 의견이나 논거 (발언자 포함)</li>
</ul>

<h2>결론 / 미결 사안</h2>
<p>합의된 내용이나 아직 열려있는 질문</p>`

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
  const rawSummary: string = aiJson.content?.[0]?.text ?? ''

  // XSS 방지
  const summary = rawSummary
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<(iframe|object|embed|base|meta|link)\b[^>]*/gi, '')
    .replace(/\bon\w+\s*=/gi, '')
    .replace(/javascript\s*:/gi, 'javascript-blocked:')

  const slug = `카카오-담론-${kstDate}`

  // 재시도 멱등성: 동일 slug 이미 있으면 재사용
  const { data: existingDoc } = await supabase
    .from('documents')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()

  let docId: string

  if (existingDoc) {
    docId = existingDoc.id
  } else {
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .insert({
        slug,
        title: `카카오톡 담론 요약 (${kstDate})`,
        type: 'kakao',
        body: summary,
        status: 'published',
        author_id: BOT_AUTHOR_ID,
        tags: ['자동요약', '일일담론'],
        like_count: 0,
      })
      .select('id')
      .single()

    if (docError) return NextResponse.json({ error: docError.message }, { status: 500 })
    docId = doc.id
  }

  const { error: kakaoMetaError } = await supabase
    .from('kakao_meta')
    .upsert(
      { document_id: docId, talk_date: kstDate, participants },
      { onConflict: 'document_id' }
    )

  if (kakaoMetaError) return NextResponse.json({ error: kakaoMetaError.message }, { status: 500 })

  const { error: metaError } = await supabase
    .from('chat_log_meta')
    .upsert({
      log_date: kstDate,
      summarized: true,
      summary_doc_id: docId,
      message_count: logs.length,
    })

  if (metaError) return NextResponse.json({ error: metaError.message }, { status: 500 })

  await supabase.from('chat_logs').delete().eq('log_date', kstDate)

  return NextResponse.json({ ok: true, doc_id: docId, date: kstDate, message_count: logs.length })
}
