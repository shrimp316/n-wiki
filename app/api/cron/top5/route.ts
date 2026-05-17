import { NextRequest, NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/bot-auth'
import { createAdminClient } from '@/lib/supabase-admin'

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const room = process.env.OPENCHAT_ROOM_NAME
  if (!room) return NextResponse.json({ error: 'OPENCHAT_ROOM_NAME not set' }, { status: 500 })

  const supabase = createAdminClient()

  const kstDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())

  const { data: docs, error } = await supabase
    .from('documents')
    .select('title, slug, like_count')
    .eq('status', 'published')
    .in('type', ['concept', 'discussion'])
    .order('like_count', { ascending: false })
    .limit(5)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!docs || docs.length === 0)
    return NextResponse.json({ ok: true, skipped: 'no_docs' })

  const siteUrl = process.env.SITE_URL ?? ''
  const lines = docs.map((d, i) =>
    `${i + 1}. ${d.title} ♥${d.like_count}\n   ${siteUrl}/wiki/${d.slug}`
  )
  const message = `📊 오늘의 인기 글 TOP ${docs.length}\n\n${lines.join('\n\n')}`

  const { error: outboxError } = await supabase
    .from('outbox')
    .upsert(
      { type: 'top5', room, message, dedup_key: `top5:${kstDate}` },
      { onConflict: 'dedup_key', ignoreDuplicates: true }
    )

  if (outboxError) return NextResponse.json({ error: outboxError.message }, { status: 500 })
  return NextResponse.json({ ok: true, count: docs.length })
}
