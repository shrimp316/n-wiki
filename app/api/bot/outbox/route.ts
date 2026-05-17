import { NextRequest, NextResponse } from 'next/server'
import { verifyBotSecret } from '@/lib/bot-auth'
import { createAdminClient } from '@/lib/supabase-admin'

export async function GET(req: NextRequest) {
  if (!verifyBotSecret(req))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('claim_outbox', { p_limit: 10 })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
