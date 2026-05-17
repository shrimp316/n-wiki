import { NextRequest, NextResponse } from 'next/server'
import { verifyBotSecret } from '@/lib/bot-auth'
import { createAdminClient } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  if (!verifyBotSecret(req))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { room?: unknown; sender?: unknown; text?: unknown; received_at?: unknown }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { room, sender, text, received_at } = body
  if (typeof room !== 'string' || typeof sender !== 'string' || typeof text !== 'string')
    return NextResponse.json({ error: 'room, sender, text required' }, { status: 400 })
  if (room.length > 100 || sender.length > 100)
    return NextResponse.json({ error: 'room/sender too long' }, { status: 400 })
  if (text.length > 2000)
    return NextResponse.json({ error: 'text too long' }, { status: 400 })

  const targetRoom = process.env.OPENCHAT_ROOM_NAME
  if (targetRoom && room !== targetRoom)
    return NextResponse.json({ ok: true, skipped: true })

  const supabase = createAdminClient()

  const baseTime = (typeof received_at === 'string' && received_at)
    ? new Date(received_at)
    : new Date()
  const logDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(baseTime)

  const { error } = await supabase
    .from('chat_logs')
    .insert({ log_date: logDate, sender, text })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { error: metaErr } = await supabase.rpc('increment_chat_log_meta', { p_date: logDate })
  if (metaErr) console.error('[ingest] meta increment failed:', metaErr.message)

  return NextResponse.json({ ok: true })
}
