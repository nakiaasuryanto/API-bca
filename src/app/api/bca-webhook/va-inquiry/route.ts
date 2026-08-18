/**
 * POST /api/bca-webhook/va-inquiry
 *
 * Endpoint yang dipanggil BCA untuk inquiry Virtual Account.
 * BCA akan memanggil endpoint ini setiap kali customer mencoba bayar VA.
 *
 * Flow:
 * 1. Verify signature dari BCA
 * 2. Lookup VA di database kita
 * 3. Return VA details jika valid, atau error code jika tidak
 */

import { NextRequest, NextResponse } from 'next/server'
import { getPrismaClient } from '@/lib/database'
import { logBcaApiCall } from '@/lib/bca/logger'
import { getBcaConfig, BCA_RESPONSE_CODES } from '@/lib/bca/config'
import { verifySignatureService, generateTimestamp } from '@/lib/bca/signature'

interface VaInquiryRequest {
  partnerServiceId: string
  customerNo: string
  virtualAccountNo: string
  channelCode?: string
  trxDateInit?: string
  inquiryRequestId?: string
  additionalInfo?: Record<string, unknown>
}

interface VaInquiryResponse {
  responseCode: string
  responseMessage: string
  virtualAccountData?: {
    partnerServiceId: string
    customerNo: string
    virtualAccountNo: string
    virtualAccountName: string
    virtualAccountEmail?: string
    virtualAccountPhone?: string
    totalAmount: {
      value: string
      currency: string
    }
    expiredDate?: string
    additionalInfo?: {
      prospectingId?: number
      unitBisnis?: string
    }
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  let requestBody: VaInquiryRequest | null = null

  try {
    // 1. Parse request
    const rawBody = await request.text()
    requestBody = JSON.parse(rawBody)

    if (!requestBody) {
      return createResponse('4000000', 'Invalid request body', 400)
    }

    // 2. Verify signature dari BCA (optional di sandbox, wajib di production)
    // TODO: Implement signature verification
    // const signature = request.headers.get('X-SIGNATURE')
    // const timestamp = request.headers.get('X-TIMESTAMP')
    // const accessToken = request.headers.get('Authorization')?.replace('Bearer ', '')
    // if (!verifySignatureService('POST', '/api/bca-webhook/va-inquiry', accessToken, rawBody, timestamp, signature)) {
    //   return createResponse('4010000', 'Invalid signature', 401)
    // }

    // 3. Extract VA number
    const vaNumber = requestBody.virtualAccountNo?.trim()
    if (!vaNumber) {
      return createResponse('4000001', 'Missing virtualAccountNo', 400)
    }

    // 4. Lookup VA di database
    const prisma = getPrismaClient()
    const va = await prisma.virtualAccount.findUnique({
      where: { vaNumber },
    })

    // Log request
    await logBcaApiCall({
      endpoint: '/api/bca-webhook/va-inquiry',
      method: 'POST',
      requestBody: rawBody,
      operation: 'VA_INQUIRY_WEBHOOK',
      vaNumber,
      durationMs: Date.now() - startTime,
    })

    // 5. Handle cases
    if (!va) {
      console.log(`[VA Inquiry] VA not found: ${vaNumber}`)
      return createResponse(BCA_RESPONSE_CODES.VA_NOT_FOUND, 'Virtual Account not found', 404)
    }

    if (va.status === 'PAID') {
      console.log(`[VA Inquiry] VA already paid: ${vaNumber}`)
      return createResponse(BCA_RESPONSE_CODES.VA_ALREADY_PAID, 'Virtual Account already paid', 409)
    }

    if (va.status === 'EXPIRED' || (va.expiresAt && va.expiresAt < new Date())) {
      console.log(`[VA Inquiry] VA expired: ${vaNumber}`)
      return createResponse('4042413', 'Virtual Account expired', 404)
    }

    if (va.status === 'CANCELLED') {
      console.log(`[VA Inquiry] VA cancelled: ${vaNumber}`)
      return createResponse('4042414', 'Virtual Account cancelled', 404)
    }

    // 6. Return VA details
    const config = getBcaConfig()
    const response: VaInquiryResponse = {
      responseCode: BCA_RESPONSE_CODES.SUCCESS,
      responseMessage: 'Success',
      virtualAccountData: {
        partnerServiceId: config.vaPartnerServiceId.padStart(5, ' '),
        customerNo: va.customerNo.padStart(18, ' '),
        virtualAccountNo: va.vaNumber,
        virtualAccountName: va.customerName || 'Customer',
        virtualAccountPhone: va.customerPhone || undefined,
        totalAmount: {
          value: va.amount.toString() + '.00',
          currency: 'IDR',
        },
        expiredDate: va.expiresAt?.toISOString(),
        additionalInfo: {
          prospectingId: va.prospectingId,
          unitBisnis: va.unitBisnis,
        },
      },
    }

    console.log(`[VA Inquiry] Success: ${vaNumber}, amount: ${va.amount}`)

    return NextResponse.json(response, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-TIMESTAMP': generateTimestamp(),
      },
    })
  } catch (error) {
    console.error('[VA Inquiry] Error:', error)

    await logBcaApiCall({
      endpoint: '/api/bca-webhook/va-inquiry',
      method: 'POST',
      requestBody: JSON.stringify(requestBody),
      operation: 'VA_INQUIRY_WEBHOOK',
      durationMs: Date.now() - startTime,
      isError: true,
      errorMessage: error instanceof Error ? error.message : String(error),
    })

    return createResponse('5000000', 'Internal server error', 500)
  }
}

function createResponse(
  responseCode: string,
  responseMessage: string,
  httpStatus: number
): NextResponse {
  return NextResponse.json(
    { responseCode, responseMessage },
    {
      status: httpStatus,
      headers: {
        'Content-Type': 'application/json',
        'X-TIMESTAMP': generateTimestamp(),
      },
    }
  )
}
