/**
 * GET /api/health
 *
 * Health check endpoint - tidak perlu autentikasi.
 */

import { NextResponse } from 'next/server'
import { checkPklConnection } from '@/lib/crm-database'

export async function GET() {
  const checks: Record<string, 'ok' | 'error'> = {
    server: 'ok',
    database: 'error',
  }

  // Check PKL MySQL connection
  try {
    const connected = await checkPklConnection()
    checks.database = connected ? 'ok' : 'error'
  } catch (error) {
    console.error('[Health] Database check failed:', error)
    checks.database = 'error'
  }

  const isHealthy = checks.server === 'ok' && checks.database === 'ok'

  return NextResponse.json(
    {
      status: isHealthy ? 'healthy' : 'unhealthy',
      checks,
      timestamp: new Date().toISOString(),
      version: '0.1.0',
    },
    { status: isHealthy ? 200 : 503 }
  )
}
