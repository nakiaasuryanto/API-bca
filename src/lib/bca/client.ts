/**
 * BCA SNAP API Client
 *
 * High-level client untuk interact dengan BCA SNAP API.
 * Handles: auth, signature, request/response, retry logic.
 */

import { getBcaConfig, BCA_ENDPOINTS, BCA_RESPONSE_CODES } from './config'
import { getAccessToken, refreshAccessToken } from './auth'
import {
  generateSignatureService,
  generateTimestamp,
  generateExternalId,
} from './signature'
import { logBcaApiCall, maskSensitiveHeaders } from './logger'

export interface BcaApiResponse<T = unknown> {
  success: boolean
  responseCode: string
  responseMessage: string
  data?: T
  rawResponse?: string
}

export interface BcaRequestOptions {
  /** Operation name for logging (e.g., "VA_INQUIRY") */
  operation?: string
  /** VA number for logging context */
  vaNumber?: string
  /** Skip retry on 401 (useful to prevent infinite loop) */
  skipRetryOn401?: boolean
}

/**
 * Make authenticated request to BCA SNAP API
 */
export async function bcaRequest<T = unknown>(
  method: 'GET' | 'POST',
  endpoint: string,
  body: object,
  options: BcaRequestOptions = {}
): Promise<BcaApiResponse<T>> {
  const config = getBcaConfig()
  const timestamp = generateTimestamp()
  const externalId = generateExternalId()

  // Get access token
  let accessToken = await getAccessToken()

  // Generate service signature
  const signature = generateSignatureService(
    method,
    endpoint,
    accessToken,
    body,
    timestamp
  )

  const url = `${config.baseUrl}${endpoint}`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`,
    'X-TIMESTAMP': timestamp,
    'X-SIGNATURE': signature,
    'X-PARTNER-ID': config.partnerId,
    'X-EXTERNAL-ID': externalId,
    'CHANNEL-ID': config.channelId,
  }

  const startTime = Date.now()
  let response: Response
  let responseBody: string

  try {
    response = await fetch(url, {
      method,
      headers,
      body: JSON.stringify(body),
    })

    responseBody = await response.text()
    const durationMs = Date.now() - startTime

    // Log API call (with masked headers)
    await logBcaApiCall({
      endpoint,
      method,
      requestHeaders: JSON.stringify(maskSensitiveHeaders(headers)),
      requestBody: JSON.stringify(body),
      responseStatus: response.status,
      responseBody,
      durationMs,
      operation: options.operation,
      vaNumber: options.vaNumber,
      isError: !response.ok,
    })

    // Parse response
    let data: T | undefined
    let parsedResponse: { responseCode?: string; responseMessage?: string } = {}

    try {
      parsedResponse = JSON.parse(responseBody)
      data = parsedResponse as T
    } catch {
      // Response might not be JSON
    }

    const responseCode = parsedResponse.responseCode || String(response.status)
    const responseMessage =
      parsedResponse.responseMessage || response.statusText

    // Handle 401 - try refresh token once
    if (
      response.status === 401 ||
      responseCode === BCA_RESPONSE_CODES.INVALID_TOKEN
    ) {
      if (!options.skipRetryOn401) {
        console.log('[BCA Client] Token expired, refreshing and retrying...')
        accessToken = await refreshAccessToken()

        // Retry with new token
        return bcaRequest(method, endpoint, body, {
          ...options,
          skipRetryOn401: true, // Prevent infinite loop
        })
      }
    }

    return {
      success: response.ok && responseCode === BCA_RESPONSE_CODES.SUCCESS,
      responseCode,
      responseMessage,
      data,
      rawResponse: responseBody,
    }
  } catch (error) {
    const durationMs = Date.now() - startTime
    const errorMessage =
      error instanceof Error ? error.message : String(error)

    // Log error
    await logBcaApiCall({
      endpoint,
      method,
      requestHeaders: JSON.stringify(maskSensitiveHeaders(headers)),
      requestBody: JSON.stringify(body),
      responseStatus: 0,
      durationMs,
      operation: options.operation,
      vaNumber: options.vaNumber,
      isError: true,
      errorMessage,
    })

    return {
      success: false,
      responseCode: 'ERROR',
      responseMessage: errorMessage,
    }
  }
}

// =============================================================================
// VA INQUIRY
// =============================================================================

export interface VaInquiryRequest {
  partnerServiceId: string
  customerNo: string
  virtualAccountNo: string
  inquiryRequestId?: string
}

export interface VaInquiryResponse {
  responseCode: string
  responseMessage: string
  virtualAccountData?: {
    partnerServiceId: string
    customerNo: string
    virtualAccountNo: string
    virtualAccountName: string
    totalAmount: {
      value: string
      currency: string
    }
    expiredDate?: string
    additionalInfo?: Record<string, unknown>
  }
}

/**
 * VA Inquiry - check VA status dan details
 *
 * Ini endpoint yang dipanggil BCA ke kita untuk inquiry VA.
 * Tapi kita juga bisa panggil untuk testing.
 */
export async function vaInquiry(
  vaNumber: string
): Promise<BcaApiResponse<VaInquiryResponse>> {
  const config = getBcaConfig()

  // Parse VA number: first 5 digits = partnerServiceId, rest = customerNo
  const partnerServiceId = vaNumber.substring(0, 5).padStart(5, ' ')
  const customerNo = vaNumber.substring(5).padStart(18, ' ')

  const body: VaInquiryRequest = {
    partnerServiceId,
    customerNo,
    virtualAccountNo: `${partnerServiceId}${customerNo}`,
    inquiryRequestId: generateExternalId(),
  }

  return bcaRequest<VaInquiryResponse>('POST', BCA_ENDPOINTS.VA_INQUIRY, body, {
    operation: 'VA_INQUIRY',
    vaNumber,
  })
}

// =============================================================================
// VA PAYMENT STATUS
// =============================================================================

export interface VaPaymentStatusRequest {
  partnerServiceId: string
  customerNo: string
  virtualAccountNo: string
  inquiryRequestId?: string
}

export interface VaPaymentStatusResponse {
  responseCode: string
  responseMessage: string
  virtualAccountData?: {
    paymentFlagStatus: string // '00' = belum bayar, '01' = sudah bayar
    partnerServiceId: string
    customerNo: string
    virtualAccountNo: string
    paidAmount?: {
      value: string
      currency: string
    }
    paidDate?: string
  }
}

/**
 * VA Payment Status - check apakah VA sudah dibayar
 */
export async function vaPaymentStatus(
  vaNumber: string
): Promise<BcaApiResponse<VaPaymentStatusResponse>> {
  const config = getBcaConfig()

  const partnerServiceId = vaNumber.substring(0, 5).padStart(5, ' ')
  const customerNo = vaNumber.substring(5).padStart(18, ' ')

  const body: VaPaymentStatusRequest = {
    partnerServiceId,
    customerNo,
    virtualAccountNo: `${partnerServiceId}${customerNo}`,
    inquiryRequestId: generateExternalId(),
  }

  return bcaRequest<VaPaymentStatusResponse>(
    'POST',
    BCA_ENDPOINTS.VA_PAYMENT_STATUS,
    body,
    {
      operation: 'VA_PAYMENT_STATUS',
      vaNumber,
    }
  )
}

// =============================================================================
// HELPER: Generate VA Number
// =============================================================================

/**
 * Generate VA number dari prospecting ID
 *
 * Format: {partnerServiceId}{ubPrefix}{prospectingId}
 * - partnerServiceId: 5 digit company code dari BCA
 * - ubPrefix: 2 digit prefix unit bisnis (untuk multi-UB)
 * - prospectingId: ID prospecting, zero-padded
 *
 * Total customerNo max 18 digit, jadi prospectingId max 16 digit setelah prefix
 */
export function generateVaNumber(
  prospectingId: number,
  ubPrefix: string = '00'
): string {
  const config = getBcaConfig()
  const partnerServiceId = config.vaPartnerServiceId.padStart(5, '0')

  // Format customerNo: {ubPrefix}{prospectingId}
  // Ensure prospectingId fits in 16 digits (after 2-digit prefix)
  const paddedProspectingId = String(prospectingId).padStart(16, '0')
  const customerNo = `${ubPrefix}${paddedProspectingId}`

  return `${partnerServiceId}${customerNo}`
}

/**
 * Parse VA number kembali ke components
 */
export function parseVaNumber(vaNumber: string): {
  partnerServiceId: string
  ubPrefix: string
  prospectingId: number
  customerNo: string
} {
  const partnerServiceId = vaNumber.substring(0, 5)
  const customerNo = vaNumber.substring(5)
  const ubPrefix = customerNo.substring(0, 2)
  const prospectingIdStr = customerNo.substring(2)
  const prospectingId = parseInt(prospectingIdStr, 10)

  return {
    partnerServiceId,
    ubPrefix,
    prospectingId,
    customerNo,
  }
}
