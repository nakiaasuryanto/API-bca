/**
 * GET /api/health
 *
 * Health check endpoint - tidak perlu autentikasi.
 */

import { NextResponse } from 'next/server'
import { getPrismaClient } from '@/lib/database'
import { checkCrmConnection, isCrmDevMode } from '@/lib/crm-database'

export async function GET() {
  const checks: Record<string, 'ok' | 'error' | 'not_configured'> = {
    server: 'ok',
    database: 'error',
    crm: 'not_configured',
  }

  // Check database connection (vg_payment)
  try {
    const prisma = getPrismaClient()
    // Use a simple count query instead of raw SQL
    await prisma.oAuthToken.count()
    checks.database = 'ok'
  } catch (error) {
    console.error('[Health] Database check failed:', error)
    checks.database = 'error'
  }

  // Check CRM database connection (vg_prospect)
  // In dev mode, uses SQLite; in prod, uses MySQL
  try {
    const connected = await checkCrmConnection()
    if (isCrmDevMode()) {
      checks.crm = connected ? 'dev' : 'error'
    } else {
      checks.crm = connected ? 'ok' : 'error'
    }
  } catch (error) {
    console.error('[Health] CRM database check failed:', error)
    checks.crm = 'error'
  }

  // CRM is optional, so only check server + database for health status
  const coreOk = checks.server === 'ok' && checks.database === 'ok'

  return NextResponse.json(
    {
      status: coreOk ? 'healthy' : 'unhealthy',
      checks,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
    },
    { status: coreOk ? 200 : 503 }
  )
}
