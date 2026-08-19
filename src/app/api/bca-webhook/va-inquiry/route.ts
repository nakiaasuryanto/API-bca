/**
 * POST /api/bca-webhook/va-inquiry
 *
 * Endpoint yang dipanggil BCA untuk inquiry Virtual Account.
 * BCA akan memanggil endpoint ini setiap kali customer mencoba bayar VA.
 *
 * Flow:
 * 1. Verify signature dari BCA
 * 2. Lookup VA di PKL MySQL database
 * 3. Return VA details jika valid, atau error code jika tidak
 */

import { NextRequest, NextResponse } from 'next/server'
import { getVAByNumber } from '@/lib/crm-database'
import { getBcaConfig, BCA_RESPONSE_CODES } from '@/lib/bca/config'
import { generateTimestamp } from '@/lib/bca/signature'

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
  let requestBody: VaInquiryRequest | null = null

  try {
    // 1. Parse request
    const rawBody = await request.text()
    requestBody = JSON.parse(rawBody)

    if (!requestBody) {
      return createResponse('4000000', 'Invalid request body', 400)
    }

    // 2. TODO: Verify signature dari BCA (wajib di production)

    // 3. Extract VA number
    const vaNumber = requestBody.virtualAccountNo?.trim()
    if (!vaNumber) {
      return createResponse('4000001', 'Missing virtualAccountNo', 400)
    }

    // 4. Lookup VA di PKL MySQL
    const va = await getVAByNumber(vaNumber)

    // 5. Handle cases
    if (!va) {
      console.log(`[VA Inquiry] VA not found: ${vaNumber}`)
      return createResponse(BCA_RESPONSE_CODES.VA_NOT_FOUND, 'Virtual Account not found', 404)
    }

    if (va.status === 'PAID') {
      console.log(`[VA Inquiry] VA already paid: ${vaNumber}`)
      return createResponse(BCA_RESPONSE_CODES.VA_ALREADY_PAID, 'Virtual Account already paid', 409)
    }

    if (va.status === 'EXPIRED') {
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
        customerNo: va.customer_no.padStart(18, ' '),
        virtualAccountNo: va.va_number,
        virtualAccountName: va.customer_name || 'Customer',
        totalAmount: {
          value: va.amount.toString() + '.00',
          currency: 'IDR',
        },
        additionalInfo: {
          prospectingId: va.prospecting_id,
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
