import { NextRequest, NextResponse } from 'next/server'
import { verifyBotSecret } from '@/lib/bot-auth'
import { createAdminClient } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  if (!verifyBotSecret(req))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { id?: number; status?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { id, status } = body
  if (!id || !['sent', 'failed'].includes(status ?? ''))
    return NextResponse.json({ error: 'id and status(sent|failed) required' }, { status: 400 })

  const supabase = createAdminClient()
  const { data: updated, error } = await supabase
    .from('outbox')
    .update({
      status,
      sent_at: status === 'sent' ? new Date().toISOString() : null,
    })
    .eq('id', id)
    .eq('status', 'in_flight')
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!updated || updated.length === 0)
    return NextResponse.json({ error: 'not_found_or_not_in_flight' }, { status: 409 })
  return NextResponse.json({ ok: true })
}
