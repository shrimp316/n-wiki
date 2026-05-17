import { NextRequest, NextResponse } from 'next/server'
import { verifyBotSecret } from '@/lib/bot-auth'
import { createAdminClient } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  if (!verifyBotSecret(req))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { command?: string; triggered_by?: string; room?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { command, triggered_by, room } = body
  if (command !== 'summarize-now' || !triggered_by || !room)
    return NextResponse.json({ error: 'Invalid command payload' }, { status: 400 })

  const siteUrl = process.env.SITE_URL ?? ''
  const cronSecret = process.env.CRON_SECRET ?? ''

  const res = await fetch(`${siteUrl}/api/cron/summarize-now`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${cronSecret}` },
  })

  const result = await res.json() as {
    ok?: boolean
    skipped?: string
    slug?: string
    error?: string
    date?: string
    count?: number
  }

  const kstDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())

  let message: string
  if (result.skipped === 'already_summarized_today') {
    message = `📋 오늘(${kstDate}) 중간 요약이 이미 있어요!\n${siteUrl}/wiki/카카오-담론-${kstDate}-중간요약`
  } else if (result.skipped === 'not_enough_messages') {
    const count = result.count ?? 0
    message = `💬 아직 대화가 부족해요 (현재 ${count}건, 최소 3건 필요). 조금 더 이야기하다 다시 요청해줘요!`
  } else if (result.ok && result.slug) {
    message = `✅ ${triggered_by}님 요청으로 오늘 담론이 정리됐어요!\n${siteUrl}/wiki/${result.slug}`
  } else {
    message = `❌ 요약 중 오류가 발생했어요: ${result.error ?? '알 수 없는 오류'}`
  }

  const supabase = createAdminClient()
  const { error: outboxError } = await supabase
    .from('outbox')
    .insert({ type: 'command-reply', room, message })

  if (outboxError) {
    console.error('[command] outbox insert failed:', outboxError.message)
    return NextResponse.json({ error: outboxError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
