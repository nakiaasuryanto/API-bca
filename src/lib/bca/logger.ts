/**
 * BCA API Call Logger
 *
 * Logs semua request/response ke BCA API untuk audit trail
 */

export interface BcaApiLogEntry {
  endpoint: string
  method: string
  requestHeaders?: string
  requestBody?: string
  responseStatus?: number
  responseHeaders?: string
  responseBody?: string
  durationMs?: number
  operation?: string
  vaNumber?: string
  isError?: boolean
  errorMessage?: string
}

/**
 * Log BCA API call ke database
 *
 * Non-blocking: jangan sampai logging error mengganggu flow utama
 */
export async function logBcaApiCall(entry: BcaApiLogEntry): Promise<void> {
  try {
    const { getPrismaClient } = await import('../database')
    const prisma = getPrismaClient()

    await prisma.bcaApiLog.create({
      data: {
        endpoint: entry.endpoint,
        method: entry.method,
        requestHeaders: entry.requestHeaders,
        requestBody: entry.requestBody,
        responseStatus: entry.responseStatus,
        responseHeaders: entry.responseHeaders,
        responseBody: entry.responseBody,
        durationMs: entry.durationMs,
        operation: entry.operation,
        vaNumber: entry.vaNumber,
        isError: entry.isError ?? false,
        errorMessage: entry.errorMessage,
      },
    })
  } catch (error) {
    // Log to console but don't throw - logging should never break the main flow
    console.error('[BCA Logger] Failed to log API call:', error)
  }
}

/**
 * Mask sensitive data untuk logging
 * (access token, signature, dll)
 */
export function maskSensitiveHeaders(headers: Record<string, string>): Record<string, string> {
  const masked = { ...headers }

  const sensitiveKeys = ['authorization', 'x-signature', 'access-token']

  for (const key of Object.keys(masked)) {
    if (sensitiveKeys.includes(key.toLowerCase())) {
      const value = masked[key]
      if (value && value.length > 10) {
        masked[key] = value.substring(0, 10) + '...[MASKED]'
      }
    }
  }

  return masked
}
