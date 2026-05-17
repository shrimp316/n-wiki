import { timingSafeEqual } from 'crypto'
import { NextRequest } from 'next/server'

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufA, bufA)
    return false
  }
  return timingSafeEqual(bufA, bufB)
}

export function verifyBotSecret(req: NextRequest): boolean {
  const secret = req.headers.get('x-bot-secret') ?? ''
  const expected = process.env.BOT_SECRET ?? ''
  if (!expected) {
    timingSafeEqual(Buffer.from('x'), Buffer.from('x'))
    return false
  }
  return constantTimeEqual(secret, expected)
}

export function verifyCronSecret(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') ?? ''
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`
  if (!process.env.CRON_SECRET) {
    timingSafeEqual(Buffer.from('x'), Buffer.from('x'))
    return false
  }
  return constantTimeEqual(auth, expected)
}
