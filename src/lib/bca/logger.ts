/**
 * BCA API Call Logger
 *
 * Logs semua request/response ke BCA API untuk audit trail
 */

/**
 * Mask sensitive headers for logging
 */
export function maskSensitiveHeaders(headers: Record<string, string>): Record<string, string> {
  const masked = { ...headers }
  const sensitiveKeys = ['authorization', 'x-api-key', 'x-signature', 'cookie']

  for (const key of Object.keys(masked)) {
    if (sensitiveKeys.includes(key.toLowerCase())) {
      masked[key] = '***MASKED***'
    }
  }

  return masked
}

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
 * Log BCA API call
 * Currently logs to console; can be extended to log to database if needed
 */
export async function logBcaApiCall(entry: BcaApiLogEntry): Promise<void> {
  try {
    const logData = {
      timestamp: new Date().toISOString(),
      ...entry,
    }

    if (entry.isError) {
      console.error('[BCA API]', JSON.stringify(logData))
    } else {
      console.log('[BCA API]', JSON.stringify(logData))
    }
  } catch (error) {
    console.error('[BCA Logger] Failed to log:', error)
  }
}
