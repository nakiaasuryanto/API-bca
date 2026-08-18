/**
 * Database Configuration
 *
 * Simplified version of Obrola's database-multi.ts pattern.
 * This service primarily uses vg_payment database.
 *
 * Note: Prisma 7+ requires driver adapters.
 */

import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import path from 'path'

// Singleton pattern
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  // For SQLite with better-sqlite3 driver
  let databaseUrl = process.env.DATABASE_URL || 'file:./prisma/dev.db'

  // Ensure the path is absolute if relative
  if (databaseUrl.startsWith('file:./') || databaseUrl.startsWith('file:prisma/')) {
    const relativePath = databaseUrl.replace('file:', '')
    const absolutePath = path.resolve(process.cwd(), relativePath)
    databaseUrl = `file:${absolutePath}`
  }

  console.log('[DB] Using SQLite database URL:', databaseUrl)

  // PrismaBetterSqlite3 expects config object with url, not a Database instance
  const adapter = new PrismaBetterSqlite3({ url: databaseUrl })

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })
}

export function getPrismaClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient()
    console.log('[DB] Created new Prisma Client for vg_payment')
  }

  return globalForPrisma.prisma
}

export default getPrismaClient()

/**
 * Retry wrapper for database operations
 * Handles transient connection errors (P1001, P1017)
 */
export async function withDbRetry<T>(
  operation: () => Promise<T>,
  attempts: number = 3
): Promise<T> {
  let lastError: Error | undefined

  for (let i = 0; i < attempts; i++) {
    try {
      return await operation()
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string }
      const code = err?.code
      const msg = String(err?.message || '')

      const isConnectionError =
        code === 'P1001' ||
        code === 'P1017' ||
        /Server has closed the connection|Can't reach database server|connection.*(closed|lost|reset)|ECONNRESET|ETIMEDOUT/i.test(
          msg
        )

      if (!isConnectionError || i === attempts - 1) {
        throw error
      }

      lastError = error instanceof Error ? error : new Error(String(error))
      // Exponential backoff: 120ms, 240ms, ...
      await new Promise((resolve) => setTimeout(resolve, 120 * (i + 1)))
    }
  }

  throw lastError
}

/**
 * Get schema name dari database URL
 */
export function getSchemaName(databaseEnvKey: string): string {
  const url = process.env[databaseEnvKey]
  if (!url) {
    if (databaseEnvKey.includes('PROSPECT')) return 'vg_prospect'
    if (databaseEnvKey.includes('PAYMENT')) return 'vg_payment'
    return 'unknown'
  }

  // Extract DB name from mysql://user:pass@host:port/DBNAME[?params]
  const match = url.match(/^[^:]+:\/\/[^@]+@[^/]+\/([^?]+)/)
  if (match) {
    return decodeURIComponent(match[1])
  }

  return 'unknown'
}

/**
 * For cross-DB queries to vg_prospect (CRM)
 * In SQLite test mode, this just returns the same client
 */
let prospectClient: PrismaClient | null = null

export function getProspectPrismaClient(): PrismaClient {
  if (prospectClient) return prospectClient

  // In SQLite test mode, use the same database
  // In production with MySQL, this would connect to vg_prospect
  prospectClient = getPrismaClient()

  console.log('[DB] Using same Prisma Client for vg_prospect (SQLite test mode)')

  return prospectClient
}
